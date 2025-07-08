import { ConnectionConfig } from '@opencall/core';
import { MLSEncryptionService, MLSKeyPackage } from './MLSEncryptionService';
import { SignalData } from '../websocket';
import { performanceMonitor } from './PerformanceMonitor';

export interface EncryptedPeerConnectionOptions {
  peerId: string;
  userId: string;
  groupId: string;
  initiator: boolean;
  stream?: MediaStream;
  config?: ConnectionConfig;
  encryptionService: MLSEncryptionService;
  onStream?: (stream: MediaStream) => void;
  onClose?: () => void;
  onError?: (error: Error) => void;
  onConnect?: () => void;
  onEncryptionStatus?: (encrypted: boolean) => void;
  onKeyExchange?: (keyPackage: MLSKeyPackage) => void;
}

export class EncryptedPeerConnection extends EventTarget {
  private pc: RTCPeerConnection;
  private options: EncryptedPeerConnectionOptions;
  private encryptionWorker: Worker | null = null;
  private decryptionWorker: Worker | null = null;
  private isEncryptionEnabled: boolean = false;
  private pendingCandidates: RTCIceCandidate[] = [];
  private isConnected: boolean = false;

  constructor(options: EncryptedPeerConnectionOptions) {
    super();
    this.options = options;
    
    // Create RTCPeerConnection with config
    const config = options.config || {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    };
    
    // Add encoded transform support if available
    const pcConfig: RTCConfiguration = {
      ...config,
      encodedInsertableStreams: true, // Legacy flag for older browsers
    } as RTCConfiguration;
    
    this.pc = new RTCPeerConnection(pcConfig);
    this.setupPeerConnection();
    this.setupEncryption();
    
    // Start performance monitoring
    performanceMonitor.startMonitoring(5000);
  }

  private setupPeerConnection(): void {
    // Handle ICE candidates
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.dispatchEvent(new CustomEvent('signal', { 
          detail: { 
            candidate: event.candidate.toJSON() 
          } 
        }));
      }
    };

    // Handle connection state changes
    this.pc.onconnectionstatechange = () => {
      console.log(`Connection state: ${this.pc.connectionState}`);
      
      if (this.pc.connectionState === 'connected') {
        this.isConnected = true;
        this.options.onConnect?.();
      } else if (this.pc.connectionState === 'failed' || this.pc.connectionState === 'closed') {
        this.cleanup();
        this.options.onClose?.();
      }
    };

    // Handle incoming streams
    this.pc.ontrack = (event) => {
      console.log(`Received track from peer ${this.options.peerId}:`, event.track.kind);
      
      if (event.streams[0]) {
        this.options.onStream?.(event.streams[0]);
      }
    };

    // Add local stream if provided
    if (this.options.stream) {
      this.addStream(this.options.stream);
    }
  }

  private async setupEncryption(): Promise<void> {
    // Check if RTCRtpScriptTransform is supported
    if (!this.supportsEncryption()) {
      console.warn('RTCRtpScriptTransform not supported, encryption disabled');
      this.options.onEncryptionStatus?.(false);
      return;
    }

    try {
      // Create workers for encryption/decryption
      this.encryptionWorker = new Worker(
        new URL('./encryptionWorker.ts', import.meta.url),
        { type: 'module' }
      );
      
      this.decryptionWorker = new Worker(
        new URL('./decryptionWorker.ts', import.meta.url),
        { type: 'module' }
      );

      // Initialize workers
      const initData = {
        groupId: this.options.groupId,
        senderId: this.options.userId
      };

      this.encryptionWorker.postMessage({ type: 'init', data: initData });
      this.decryptionWorker.postMessage({ type: 'init', data: initData });

      // Set up message handlers
      this.setupWorkerMessageHandlers();

      // Get initial encryption key
      const key = await this.options.encryptionService.getEncryptionKey(
        this.options.groupId,
        this.options.userId
      );

      if (key) {
        const keyId = await this.options.encryptionService.getCurrentKeyId(
          this.options.groupId,
          this.options.userId
        );
        
        // Send key to encryption worker
        this.encryptionWorker.postMessage({
          type: 'updateKey',
          data: { keyId, key }
        });

        this.isEncryptionEnabled = true;
        this.options.onEncryptionStatus?.(true);
      }

      // Listen for key rotation events
      this.options.encryptionService.on('keysRotated', this.handleKeyRotation);

    } catch (error) {
      console.error('Failed to setup encryption:', error);
      this.options.onEncryptionStatus?.(false);
    }
  }

  private setupWorkerMessageHandlers(): void {
    const handleWorkerMessage = (isEncryption: boolean) => async (event: MessageEvent) => {
      const { type, ...data } = event.data;

      switch (type) {
        case 'keyRequest':
          // Worker needs a key
          const key = await this.options.encryptionService.getEncryptionKey(
            this.options.groupId,
            this.options.userId
          );
          
          const worker = isEncryption ? this.encryptionWorker : this.decryptionWorker;
          worker?.postMessage({
            type: 'keyResponse',
            keyId: data.keyId,
            key
          });
          break;

        case 'keyNeeded':
          // Decryptor needs a key from another participant
          console.log(`Key needed from ${data.senderId} with keyId ${data.keyId}`);
          // This would trigger key exchange protocol
          break;

        case 'performance':
          // Record performance metrics
          if (data.operation === 'encryption') {
            performanceMonitor.recordEncryption(data.duration);
          } else if (data.operation === 'decryption') {
            performanceMonitor.recordDecryption(data.duration);
          }
          break;

        case 'frameDropped':
          // Record dropped frame
          performanceMonitor.recordDroppedFrame();
          console.warn(`Frame dropped: ${data.reason}`);
          break;

        case 'error':
          console.error(`${isEncryption ? 'Encryption' : 'Decryption'} worker error:`, data.error);
          this.options.onError?.(new Error(data.error));
          break;
      }
    };

    if (this.encryptionWorker) {
      this.encryptionWorker.onmessage = handleWorkerMessage(true);
    }
    
    if (this.decryptionWorker) {
      this.decryptionWorker.onmessage = handleWorkerMessage(false);
    }
  }

  private handleKeyRotation = async (event: any): Promise<void> => {
    if (event.groupId !== this.options.groupId) {
      return;
    }

    // Get new key
    const key = await this.options.encryptionService.getEncryptionKey(
      this.options.groupId,
      this.options.userId
    );

    if (key) {
      const keyId = await this.options.encryptionService.getCurrentKeyId(
        this.options.groupId,
        this.options.userId
      );

      // Update encryption worker
      this.encryptionWorker?.postMessage({
        type: 'updateKey',
        data: { keyId, key }
      });

      // Add key to decryption worker
      this.decryptionWorker?.postMessage({
        type: 'addKey',
        data: { keyId, key }
      });
    }
  };

  private supportsEncryption(): boolean {
    return 'RTCRtpScriptTransform' in window || 'createEncodedStreams' in RTCRtpSender.prototype;
  }

  addStream(stream: MediaStream): void {
    stream.getTracks().forEach(track => {
      const sender = this.pc.addTrack(track, stream);
      
      // Apply encryption transform if supported and enabled
      if (this.isEncryptionEnabled && this.encryptionWorker) {
        this.applyEncryptionTransform(sender);
      }
    });
  }

  private applyEncryptionTransform(sender: RTCRtpSender): void {
    if ('transform' in sender && this.encryptionWorker) {
      // Modern API
      (sender as any).transform = new (window as any).RTCRtpScriptTransform(
        this.encryptionWorker,
        { operation: 'encrypt' }
      );
    } else if ('createEncodedStreams' in sender) {
      // Legacy API
      const { readable, writable } = (sender as any).createEncodedStreams();
      this.encryptionWorker?.postMessage(
        { readable, writable },
        [readable, writable]
      );
    }
  }

  private applyDecryptionTransform(receiver: RTCRtpReceiver): void {
    if ('transform' in receiver && this.decryptionWorker) {
      // Modern API
      (receiver as any).transform = new (window as any).RTCRtpScriptTransform(
        this.decryptionWorker,
        { operation: 'decrypt' }
      );
    } else if ('createEncodedStreams' in receiver) {
      // Legacy API
      const { readable, writable } = (receiver as any).createEncodedStreams();
      this.decryptionWorker?.postMessage(
        { readable, writable },
        [readable, writable]
      );
    }
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    
    // Apply decryption transforms to receivers after setting local description
    if (this.isEncryptionEnabled && this.decryptionWorker) {
      this.pc.getReceivers().forEach(receiver => {
        if (receiver.track) {
          this.applyDecryptionTransform(receiver);
        }
      });
    }
    
    return offer;
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    
    // Apply decryption transforms to receivers after setting local description
    if (this.isEncryptionEnabled && this.decryptionWorker) {
      this.pc.getReceivers().forEach(receiver => {
        if (receiver.track) {
          this.applyDecryptionTransform(receiver);
        }
      });
    }
    
    return answer;
  }

  async handleSignal(signal: SignalData | RTCSessionDescriptionInit | RTCIceCandidateInit): Promise<void> {
    try {
      if ('type' in signal && (signal.type === 'offer' || signal.type === 'answer')) {
        // Handle offer/answer
        const description = signal as RTCSessionDescriptionInit;
        await this.pc.setRemoteDescription(description);
        
        // Process any pending ICE candidates
        while (this.pendingCandidates.length > 0) {
          const candidate = this.pendingCandidates.shift()!;
          await this.pc.addIceCandidate(candidate);
        }
        
        // Create answer if this was an offer
        if (description.type === 'offer' && !this.options.initiator) {
          const answer = await this.createAnswer();
          this.dispatchEvent(new CustomEvent('signal', { 
            detail: answer 
          }));
        }
      } else if ('candidate' in signal) {
        // Handle ICE candidate
        const candidate = new RTCIceCandidate(signal as RTCIceCandidateInit);
        
        if (this.pc.remoteDescription) {
          await this.pc.addIceCandidate(candidate);
        } else {
          // Queue candidate if remote description not set yet
          this.pendingCandidates.push(candidate);
        }
      }
    } catch (error) {
      console.error('Error handling signal:', error);
      this.options.onError?.(error as Error);
    }
  }

  async exchangeKeyPackage(remoteKeyPackage?: MLSKeyPackage): Promise<void> {
    if (this.options.initiator) {
      // Send our key package
      const keyPackage = await this.options.encryptionService.exportKeyPackage();
      this.options.onKeyExchange?.(keyPackage);
      
      if (remoteKeyPackage) {
        // Add remote member to group
        await this.options.encryptionService.addMember(
          this.options.groupId,
          this.options.peerId,
          remoteKeyPackage
        );
      }
    } else if (remoteKeyPackage) {
      // Received remote key package, add them and send ours
      await this.options.encryptionService.addMember(
        this.options.groupId,
        this.options.peerId,
        remoteKeyPackage
      );
      
      const keyPackage = await this.options.encryptionService.exportKeyPackage();
      this.options.onKeyExchange?.(keyPackage);
    }
  }

  replaceTrack(oldTrack: MediaStreamTrack, newTrack: MediaStreamTrack): void {
    const sender = this.pc.getSenders().find(s => s.track === oldTrack);
    if (sender) {
      sender.replaceTrack(newTrack);
    }
  }

  getStats(): Promise<RTCStatsReport> {
    return this.pc.getStats();
  }

  close(): void {
    this.cleanup();
    this.pc.close();
  }

  private cleanup(): void {
    // Clean up workers
    if (this.encryptionWorker) {
      this.encryptionWorker.terminate();
      this.encryptionWorker = null;
    }
    
    if (this.decryptionWorker) {
      this.decryptionWorker.postMessage({ type: 'cleanup' });
      this.decryptionWorker.terminate();
      this.decryptionWorker = null;
    }

    // Remove event listeners
    this.options.encryptionService.off('keysRotated', this.handleKeyRotation);
    
    this.isEncryptionEnabled = false;
    this.isConnected = false;
  }

  get connectionState(): RTCPeerConnectionState {
    return this.pc.connectionState;
  }

  get iceConnectionState(): RTCIceConnectionState {
    return this.pc.iceConnectionState;
  }

  get signalingState(): RTCSignalingState {
    return this.pc.signalingState;
  }

  get isEncrypted(): boolean {
    return this.isEncryptionEnabled;
  }
}