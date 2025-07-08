import { ConnectionConfig } from '@opencall/core';
import { WebSocketService, SignalData } from './websocket';
import { usePeerStore } from '../stores/peerStore';
import { useMediaStore } from '../stores/mediaStore';
import { EncryptedPeerConnection, EncryptedPeerConnectionOptions } from './encryption/EncryptedPeerConnection';
import { mlsEncryptionService, MLSKeyPackage } from './encryption/MLSEncryptionService';

export interface EncryptedPeerConnectionServiceOptions {
  enableEncryption?: boolean;
  encryptionFallback?: boolean;
}

export class EncryptedPeerConnectionService {
  private wsService: WebSocketService;
  private config: ConnectionConfig;
  private roomId: string | null = null;
  private userId: string | null = null;
  private options: EncryptedPeerConnectionServiceOptions;
  private connections: Map<string, EncryptedPeerConnection> = new Map();
  private encryptionEnabled: boolean = false;

  constructor(
    wsService: WebSocketService, 
    config?: ConnectionConfig,
    options?: EncryptedPeerConnectionServiceOptions
  ) {
    this.wsService = wsService;
    this.config = config || {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    };
    this.options = {
      enableEncryption: true,
      encryptionFallback: true,
      ...options
    };
  }

  async initialize(userId: string, roomId: string): Promise<void> {
    this.userId = userId;
    this.roomId = roomId;

    if (this.options.enableEncryption) {
      try {
        // Initialize MLS encryption service
        await mlsEncryptionService.initialize(userId);
        
        // Create or join MLS group for this room
        const existingGroup = mlsEncryptionService.getGroup(roomId);
        if (!existingGroup) {
          await mlsEncryptionService.createGroup(roomId);
        }
        
        this.encryptionEnabled = true;
        console.log('Encryption enabled for room:', roomId);
      } catch (error) {
        console.error('Failed to initialize encryption:', error);
        
        if (!this.options.encryptionFallback) {
          throw error;
        }
        
        this.encryptionEnabled = false;
      }
    }
  }

  createPeerConnection(options: {
    peerId: string;
    userId: string;
    initiator: boolean;
    stream?: MediaStream;
    onStream?: (stream: MediaStream) => void;
    onClose?: () => void;
    onError?: (error: Error) => void;
    onConnect?: () => void;
  }): EncryptedPeerConnection {
    if (!this.roomId || !this.userId) {
      throw new Error('Service not initialized');
    }

    const {
      peerId,
      userId,
      initiator,
      stream,
      onStream,
      onClose,
      onError,
      onConnect,
    } = options;

    const connectionOptions: EncryptedPeerConnectionOptions = {
      peerId,
      userId: this.userId,
      groupId: this.roomId,
      initiator,
      stream,
      config: this.config,
      encryptionService: mlsEncryptionService,
      onStream: (remoteStream) => {
        console.log(`Received stream from peer ${peerId}`);
        usePeerStore.getState().updatePeer(peerId, { remoteStream });
        onStream?.(remoteStream);
      },
      onClose: () => {
        this.connections.delete(peerId);
        onClose?.();
      },
      onError,
      onConnect: () => {
        usePeerStore.getState().updatePeer(peerId, { connected: true });
        onConnect?.();
      },
      onEncryptionStatus: (encrypted) => {
        console.log(`Encryption ${encrypted ? 'enabled' : 'disabled'} for peer ${peerId}`);
        usePeerStore.getState().updatePeer(peerId, { encrypted });
      },
      onKeyExchange: (keyPackage) => {
        // Send key package through signaling
        this.wsService.send({
          type: 'key-exchange',
          roomId: this.roomId!,
          fromPeerId: usePeerStore.getState().currentPeerId!,
          toPeerId: peerId,
          keyPackage,
          timestamp: Date.now(),
        });
      }
    };

    const connection = new EncryptedPeerConnection(connectionOptions);

    // Handle signaling
    connection.addEventListener('signal', (event: any) => {
      const signal = event.detail;
      
      if (signal.type === 'offer') {
        this.wsService.send({
          type: 'offer',
          roomId: this.roomId!,
          fromPeerId: usePeerStore.getState().currentPeerId!,
          toPeerId: peerId,
          offer: signal,
          timestamp: Date.now(),
        });
      } else if (signal.type === 'answer') {
        this.wsService.send({
          type: 'answer',
          roomId: this.roomId!,
          fromPeerId: usePeerStore.getState().currentPeerId!,
          toPeerId: peerId,
          answer: signal,
          timestamp: Date.now(),
        });
      } else if (signal.candidate) {
        // ICE candidate
        this.wsService.send({
          type: 'ice-candidate',
          roomId: this.roomId!,
          fromPeerId: usePeerStore.getState().currentPeerId!,
          toPeerId: peerId,
          candidate: signal.candidate,
          timestamp: Date.now(),
        });
      }
    });

    // Store connection
    this.connections.set(peerId, connection);
    usePeerStore.getState().updatePeer(peerId, { 
      connection: connection as any,
      userId,
      encrypted: false // Will be updated by onEncryptionStatus
    });

    return connection;
  }

  async connectToPeer(peerId: string, metadata?: { userId?: string; displayName?: string }): Promise<void> {
    const localStream = useMediaStore.getState().localStream;
    
    const connection = this.createPeerConnection({
      peerId,
      userId: metadata?.userId || peerId,
      initiator: true,
      stream: localStream
    });

    // Create offer
    const offer = await connection.createOffer();
    
    // Store peer info
    const peerInfo: any = {
      connection: connection as any,
      connected: false,
      initiator: true,
      encrypted: false,
    };
    
    if (metadata?.userId) peerInfo.userId = metadata.userId;
    if (metadata?.displayName) peerInfo.displayName = metadata.displayName;
    if (localStream) peerInfo.localStream = localStream;
    
    usePeerStore.getState().addPeer(peerId, peerInfo);
  }

  async handleSignal(data: SignalData): Promise<void> {
    let remotePeerId: string | undefined;
    let offer: RTCSessionDescriptionInit | undefined;
    let answer: RTCSessionDescriptionInit | undefined;
    let candidate: RTCIceCandidateInit | undefined;
    let keyPackage: MLSKeyPackage | undefined;
    
    if (data.type === 'offer') {
      remotePeerId = data.fromPeerId;
      offer = data.offer;
    } else if (data.type === 'answer') {
      remotePeerId = data.fromPeerId;
      answer = data.answer;
    } else if (data.type === 'ice-candidate') {
      remotePeerId = data.fromPeerId;
      candidate = data.candidate;
    } else if (data.type === 'key-exchange') {
      remotePeerId = data.fromPeerId;
      keyPackage = (data as any).keyPackage;
    }
    
    if (!remotePeerId) {
      console.error('No remote peer ID in signal data');
      return;
    }

    let connection = this.connections.get(remotePeerId);
    
    if (offer && !connection) {
      // Received an offer, create answer peer
      const localStream = useMediaStore.getState().localStream;
      
      connection = this.createPeerConnection({
        peerId: remotePeerId,
        userId: remotePeerId, // Will be updated when we get metadata
        initiator: false,
        stream: localStream
      });
      
      const peerInfo: any = {
        connection: connection as any,
        connected: false,
        initiator: false,
        encrypted: false,
      };
      
      if (localStream) peerInfo.localStream = localStream;
      
      usePeerStore.getState().addPeer(remotePeerId, peerInfo);
    }
    
    if (connection) {
      if (offer || answer || candidate) {
        await connection.handleSignal(offer || answer || candidate!);
      }
      
      if (keyPackage) {
        await connection.exchangeKeyPackage(keyPackage);
      }
    }
  }

  updateLocalStream(stream: MediaStream): void {
    const peers = usePeerStore.getState().peers;
    
    peers.forEach((peerInfo) => {
      const connection = this.connections.get(peerInfo.peerId);
      if (connection && peerInfo.localStream) {
        // Replace tracks in existing connections
        try {
          peerInfo.localStream.getTracks().forEach(oldTrack => {
            const newTrack = stream.getTracks().find(t => t.kind === oldTrack.kind);
            if (newTrack) {
              connection.replaceTrack(oldTrack, newTrack);
            }
          });
          
          usePeerStore.getState().updatePeer(peerInfo.peerId, { localStream: stream });
        } catch (error) {
          console.error(`Failed to update stream for peer ${peerInfo.peerId}:`, error);
        }
      }
    });
  }

  disconnectFromPeer(peerId: string): void {
    const connection = this.connections.get(peerId);
    if (connection) {
      connection.close();
      this.connections.delete(peerId);
    }
    
    // Remove from MLS group if encryption is enabled
    if (this.encryptionEnabled && this.roomId) {
      mlsEncryptionService.removeMember(this.roomId, peerId).catch(error => {
        console.error('Failed to remove member from MLS group:', error);
      });
    }
    
    usePeerStore.getState().removePeer(peerId);
  }

  disconnectAll(): void {
    const peers = usePeerStore.getState().peers;
    peers.forEach((peerInfo) => {
      this.disconnectFromPeer(peerInfo.peerId);
    });
  }

  async getEncryptionStats(): Promise<{
    enabled: boolean;
    groupId: string | null;
    memberCount: number;
    currentEpoch: number;
  }> {
    if (!this.encryptionEnabled || !this.roomId) {
      return {
        enabled: false,
        groupId: null,
        memberCount: 0,
        currentEpoch: 0
      };
    }

    const group = mlsEncryptionService.getGroup(this.roomId);
    
    return {
      enabled: true,
      groupId: this.roomId,
      memberCount: group?.members.size || 0,
      currentEpoch: group?.epoch || 0
    };
  }

  cleanup(): void {
    this.disconnectAll();
    mlsEncryptionService.cleanup();
    this.roomId = null;
    this.userId = null;
    this.encryptionEnabled = false;
  }
}