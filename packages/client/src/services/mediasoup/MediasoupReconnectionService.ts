import { EventEmitter } from 'events';
import { MediasoupService } from './MediasoupService';
import { Producer, Consumer, Transport } from 'mediasoup-client/lib/types';

interface ReconnectionConfig {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  connectionTimeout?: number;
  enableAutoReconnect?: boolean;
}

interface ReconnectionState {
  isReconnecting: boolean;
  retryCount: number;
  lastError?: Error;
  startTime?: number;
  nextRetryTime?: number;
}

interface TransportState {
  id: string;
  direction: 'send' | 'recv';
  options: any;
  connected: boolean;
}

interface ProducerState {
  id: string;
  kind: 'audio' | 'video';
  paused: boolean;
  track?: MediaStreamTrack;
  options?: any;
}

interface ConsumerState {
  id: string;
  producerId: string;
  kind: 'audio' | 'video';
  paused: boolean;
  data: any;
}

export class MediasoupReconnectionService extends EventEmitter {
  private config: Required<ReconnectionConfig>;
  private reconnectionState: ReconnectionState = {
    isReconnecting: false,
    retryCount: 0,
  };
  private reconnectionTimer?: NodeJS.Timer;
  private transportStates = new Map<string, TransportState>();
  private producerStates = new Map<string, ProducerState>();
  private consumerStates = new Map<string, ConsumerState>();
  private iceRestartAttempts = new Map<string, number>();

  constructor(
    private mediasoupService: MediasoupService,
    private sendMessage: (type: string, data: any) => Promise<any>,
    config: ReconnectionConfig = {}
  ) {
    super();
    
    this.config = {
      maxRetries: config.maxRetries ?? 10,
      initialDelay: config.initialDelay ?? 1000,
      maxDelay: config.maxDelay ?? 30000,
      backoffMultiplier: config.backoffMultiplier ?? 1.5,
      connectionTimeout: config.connectionTimeout ?? 10000,
      enableAutoReconnect: config.enableAutoReconnect ?? true,
    };

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Monitor transport connection state changes
    this.mediasoupService.on('sendTransport:connectionstatechange', (state) => {
      this.handleTransportStateChange('send', state);
    });

    this.mediasoupService.on('recvTransport:connectionstatechange', (state) => {
      this.handleTransportStateChange('recv', state);
    });

    // Monitor transport failures
    this.mediasoupService.on('transport:failed', (direction) => {
      this.handleTransportFailure(direction);
    });

    // Track producer state
    this.mediasoupService.on('producer:trackended', (producerId) => {
      this.handleProducerTrackEnded(producerId);
    });
  }

  private handleTransportStateChange(direction: 'send' | 'recv', state: string): void {
    console.log(`Transport ${direction} state changed to: ${state}`);

    switch (state) {
      case 'disconnected':
        this.emit('transport:warning', { direction, state });
        // Start monitoring for recovery
        this.startConnectionMonitoring(direction);
        break;

      case 'failed':
        this.handleTransportFailure(direction);
        break;

      case 'connected':
        this.emit('transport:recovered', { direction });
        this.stopConnectionMonitoring(direction);
        break;
    }
  }

  private handleTransportFailure(direction: 'send' | 'recv'): void {
    console.error(`Transport ${direction} failed`);
    this.emit('transport:error', { direction, error: 'Transport failed' });

    if (this.config.enableAutoReconnect && !this.reconnectionState.isReconnecting) {
      this.startReconnection();
    }
  }

  private handleProducerTrackEnded(producerId: string): void {
    const producerState = this.producerStates.get(producerId);
    if (producerState && producerState.track) {
      console.warn(`Producer ${producerId} track ended, attempting to replace`);
      this.replaceProducerTrack(producerId);
    }
  }

  private async replaceProducerTrack(producerId: string): Promise<void> {
    try {
      const producer = this.mediasoupService.getProducer(producerId);
      const producerState = this.producerStates.get(producerId);
      
      if (!producer || !producerState) return;

      // Get new track of the same kind
      const constraints = producerState.kind === 'audio' 
        ? { audio: true, video: false }
        : { audio: false, video: true };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const newTrack = producerState.kind === 'audio' 
        ? stream.getAudioTracks()[0]
        : stream.getVideoTracks()[0];

      if (newTrack) {
        await producer.replaceTrack({ track: newTrack });
        producerState.track = newTrack;
        this.emit('producer:trackReplaced', { producerId, track: newTrack });
      }
    } catch (error) {
      console.error(`Failed to replace producer track: ${error}`);
      this.emit('producer:replaceTrackFailed', { producerId, error });
    }
  }

  private startConnectionMonitoring(direction: 'send' | 'recv'): void {
    // Monitor connection for a timeout period
    setTimeout(() => {
      const transport = direction === 'send' 
        ? (this.mediasoupService as any).sendTransport
        : (this.mediasoupService as any).recvTransport;

      if (transport && transport.connectionState === 'disconnected') {
        // Try ICE restart first
        this.attemptIceRestart(direction);
      }
    }, 5000); // Wait 5 seconds before attempting recovery
  }

  private stopConnectionMonitoring(direction: 'send' | 'recv'): void {
    // Reset ICE restart attempts
    this.iceRestartAttempts.delete(direction);
  }

  private async attemptIceRestart(direction: 'send' | 'recv'): Promise<void> {
    const attempts = this.iceRestartAttempts.get(direction) || 0;
    
    if (attempts >= 3) {
      console.error(`ICE restart failed after ${attempts} attempts`);
      this.handleTransportFailure(direction);
      return;
    }

    try {
      console.log(`Attempting ICE restart for ${direction} transport (attempt ${attempts + 1})`);
      
      const iceParameters = await this.mediasoupService.restartIce(direction);
      if (iceParameters) {
        this.iceRestartAttempts.set(direction, attempts + 1);
        this.emit('ice:restarted', { direction });
      }
    } catch (error) {
      console.error(`ICE restart failed: ${error}`);
      this.iceRestartAttempts.set(direction, attempts + 1);
      
      // Retry after delay
      setTimeout(() => this.attemptIceRestart(direction), 2000);
    }
  }

  async startReconnection(): Promise<void> {
    if (this.reconnectionState.isReconnecting) {
      console.log('Already reconnecting...');
      return;
    }

    this.reconnectionState = {
      isReconnecting: true,
      retryCount: 0,
      startTime: Date.now(),
    };

    this.emit('reconnection:started');
    
    // Save current state
    await this.saveCurrentState();

    // Start reconnection attempts
    this.attemptReconnection();
  }

  private async saveCurrentState(): Promise<void> {
    // Save transport states
    const sendTransport = (this.mediasoupService as any).sendTransport;
    const recvTransport = (this.mediasoupService as any).recvTransport;

    if (sendTransport) {
      this.transportStates.set('send', {
        id: sendTransport.id,
        direction: 'send',
        options: {
          id: sendTransport.id,
          iceParameters: sendTransport.iceParameters,
          iceCandidates: sendTransport.iceCandidates,
          dtlsParameters: sendTransport.dtlsParameters,
          sctpParameters: sendTransport.sctpParameters,
        },
        connected: sendTransport.connectionState === 'connected',
      });
    }

    if (recvTransport) {
      this.transportStates.set('recv', {
        id: recvTransport.id,
        direction: 'recv',
        options: {
          id: recvTransport.id,
          iceParameters: recvTransport.iceParameters,
          iceCandidates: recvTransport.iceCandidates,
          dtlsParameters: recvTransport.dtlsParameters,
          sctpParameters: recvTransport.sctpParameters,
        },
        connected: recvTransport.connectionState === 'connected',
      });
    }

    // Save producer states
    for (const producer of this.mediasoupService.getAllProducers()) {
      this.producerStates.set(producer.id, {
        id: producer.id,
        kind: producer.kind as 'audio' | 'video',
        paused: producer.paused,
        track: producer.track,
        options: {
          encodings: producer.rtpSender?.getParameters().encodings,
          codecOptions: (producer as any).codecOptions,
          appData: producer.appData,
        },
      });
    }

    // Save consumer states
    for (const consumer of this.mediasoupService.getAllConsumers()) {
      this.consumerStates.set(consumer.id, {
        id: consumer.id,
        producerId: consumer.producerId,
        kind: consumer.kind as 'audio' | 'video',
        paused: consumer.paused,
        data: {
          rtpParameters: consumer.rtpParameters,
          appData: consumer.appData,
        },
      });
    }
  }

  private async attemptReconnection(): Promise<void> {
    if (!this.reconnectionState.isReconnecting) return;

    if (this.reconnectionState.retryCount >= this.config.maxRetries) {
      this.handleReconnectionFailure(new Error('Max retries exceeded'));
      return;
    }

    this.reconnectionState.retryCount++;
    const delay = this.calculateRetryDelay();
    
    this.emit('reconnection:attempt', {
      attempt: this.reconnectionState.retryCount,
      maxAttempts: this.config.maxRetries,
      nextRetryIn: delay,
    });

    try {
      // Close existing connections
      this.mediasoupService.close();

      // Reinitialize mediasoup
      await this.reinitializeMediasoup();

      // Restore state
      await this.restoreState();

      // Success!
      this.handleReconnectionSuccess();
    } catch (error) {
      this.reconnectionState.lastError = error as Error;
      console.error(`Reconnection attempt ${this.reconnectionState.retryCount} failed:`, error);

      // Schedule next retry
      this.reconnectionState.nextRetryTime = Date.now() + delay;
      this.reconnectionTimer = setTimeout(() => {
        this.attemptReconnection();
      }, delay);
    }
  }

  private async reinitializeMediasoup(): Promise<void> {
    // This would use the same initialization process as the original connection
    // The actual implementation would depend on your specific setup
    throw new Error('Reinitialize mediasoup - implementation needed');
  }

  private async restoreState(): Promise<void> {
    // Restore transports
    for (const [_, transportState] of this.transportStates) {
      // Recreate transport with saved options
      // This would use the mediasoupService methods
    }

    // Restore producers
    for (const [_, producerState] of this.producerStates) {
      if (producerState.track && producerState.track.readyState === 'live') {
        await this.mediasoupService.produce(producerState.track, producerState.options);
      }
    }

    // Restore consumers
    for (const [_, consumerState] of this.consumerStates) {
      await this.mediasoupService.consume(consumerState.data);
    }
  }

  private calculateRetryDelay(): number {
    const baseDelay = this.config.initialDelay;
    const multiplier = Math.pow(this.config.backoffMultiplier, this.reconnectionState.retryCount - 1);
    const delay = Math.min(baseDelay * multiplier, this.config.maxDelay);
    
    // Add jitter (±20%)
    const jitter = delay * 0.2 * (Math.random() - 0.5);
    return Math.round(delay + jitter);
  }

  private handleReconnectionSuccess(): void {
    this.reconnectionState.isReconnecting = false;
    const duration = Date.now() - this.reconnectionState.startTime!;
    
    this.emit('reconnection:success', {
      attempts: this.reconnectionState.retryCount,
      duration,
    });

    // Clear saved states
    this.transportStates.clear();
    this.producerStates.clear();
    this.consumerStates.clear();
    this.iceRestartAttempts.clear();
  }

  private handleReconnectionFailure(error: Error): void {
    this.reconnectionState.isReconnecting = false;
    
    if (this.reconnectionTimer) {
      clearTimeout(this.reconnectionTimer);
      this.reconnectionTimer = undefined;
    }

    this.emit('reconnection:failed', {
      error,
      attempts: this.reconnectionState.retryCount,
      duration: Date.now() - this.reconnectionState.startTime!,
    });
  }

  stopReconnection(): void {
    if (!this.reconnectionState.isReconnecting) return;

    this.reconnectionState.isReconnecting = false;
    
    if (this.reconnectionTimer) {
      clearTimeout(this.reconnectionTimer);
      this.reconnectionTimer = undefined;
    }

    this.emit('reconnection:stopped');
  }

  getReconnectionState(): ReconnectionState {
    return { ...this.reconnectionState };
  }

  setAutoReconnect(enabled: boolean): void {
    this.config.enableAutoReconnect = enabled;
  }

  dispose(): void {
    this.stopReconnection();
    this.removeAllListeners();
    this.transportStates.clear();
    this.producerStates.clear();
    this.consumerStates.clear();
    this.iceRestartAttempts.clear();
  }
}