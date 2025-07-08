import SimplePeer from 'simple-peer';
import type { Instance } from 'simple-peer';
import { ConnectionConfig } from '@opencall/core';
import { WebSocketService, SignalData } from './websocket';
import { usePeerStore, PeerInfo } from '../stores/peerStore';
import { useMediaStore } from '../stores/mediaStore';
import { EventEmitter } from 'events';

export interface PeerConnectionOptions {
  peerId: string;
  initiator: boolean;
  stream?: MediaStream;
  config?: ConnectionConfig;
  onStream?: (stream: MediaStream) => void;
  onClose?: () => void;
  onError?: (error: Error) => void;
  onConnect?: () => void;
}

export interface ConnectionStats {
  bitrate?: number;
  packetLoss?: number;
  rtt?: number;
  jitter?: number;
}

export class PeerConnectionService extends EventEmitter {
  private wsService: WebSocketService;
  private config: ConnectionConfig;
  private roomId: string | null = null;
  private sfuConnection: RTCPeerConnection | null = null;
  private sfuTransports = new Map<string, RTCPeerConnection>();

  constructor(wsService: WebSocketService, config?: ConnectionConfig) {
    super();
    this.wsService = wsService;
    this.config = config || {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    };
  }

  setRoomId(roomId: string): void {
    this.roomId = roomId;
  }

  createPeerConnection(options: PeerConnectionOptions): Instance {
    const {
      peerId,
      initiator,
      stream,
      onStream,
      onClose,
      onError,
      onConnect,
    } = options;

    const peer = new SimplePeer({
      initiator,
      stream,
      trickle: true,
      config: {
        iceServers: this.config.iceServers,
        iceTransportPolicy: this.config.iceTransportPolicy,
        bundlePolicy: this.config.bundlePolicy,
        rtcpMuxPolicy: this.config.rtcpMuxPolicy,
      },
    });

    // Handle signaling
    peer.on('signal', (signal) => {
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
          candidate: signal as RTCIceCandidateInit,
          timestamp: Date.now(),
        });
      }
    });

    // Handle remote stream
    peer.on('stream', (remoteStream) => {
      console.log(`Received stream from peer ${peerId}`);
      // Update peer store with remote stream
      usePeerStore.getState().updatePeer(peerId, { remoteStream });
      onStream?.(remoteStream);
    });

    // Handle connection established
    peer.on('connect', () => {
      console.log(`Connected to peer ${peerId}`);
      usePeerStore.getState().updatePeer(peerId, { connected: true });
      onConnect?.();
    });

    // Handle errors
    peer.on('error', (error) => {
      console.error(`Peer connection error with ${peerId}:`, error);
      onError?.(error);
    });

    // Handle close
    peer.on('close', () => {
      console.log(`Connection closed with peer ${peerId}`);
      onClose?.();
    });

    // Store peer connection
    usePeerStore.getState().updatePeer(peerId, { connection: peer });

    return peer;
  }

  handleSignal(data: SignalData): void {
    let remotePeerId: string | undefined;
    let offer: RTCSessionDescriptionInit | undefined;
    let answer: RTCSessionDescriptionInit | undefined;
    let candidate: RTCIceCandidateInit | undefined;
    
    if (data.type === 'offer') {
      remotePeerId = data.fromPeerId;
      offer = data.offer;
    } else if (data.type === 'answer') {
      remotePeerId = data.fromPeerId;
      answer = data.answer;
    } else if (data.type === 'ice-candidate') {
      remotePeerId = data.fromPeerId;
      candidate = data.candidate;
    }
    
    if (!remotePeerId) {
      console.error('No remote peer ID in signal data');
      return;
    }

    const peerInfo = usePeerStore.getState().getPeer(remotePeerId);
    
    if (offer) {
      // Received an offer, create answer peer if not exists
      if (!peerInfo) {
        const localStream = useMediaStore.getState().localStream;
        const peerOptions: PeerConnectionOptions = {
          peerId: remotePeerId,
          initiator: false,
        };
        if (localStream) peerOptions.stream = localStream;
        
        const peer = this.createPeerConnection(peerOptions);
        
        const peerInfo: Omit<PeerInfo, 'peerId'> = {
          connection: peer,
          connected: false,
          initiator: false,
        };
        if (localStream) peerInfo.localStream = localStream;
        
        usePeerStore.getState().addPeer(remotePeerId, peerInfo);
        
        // Signal the offer to the peer
        peer.signal(offer);
      } else if (peerInfo.connection) {
        // Signal offer to existing peer
        peerInfo.connection.signal(offer);
      }
    } else if (answer && peerInfo?.connection) {
      // Received an answer
      peerInfo.connection.signal(answer);
    } else if (candidate && peerInfo?.connection) {
      // Received ICE candidate
      peerInfo.connection.signal(candidate);
    }
  }

  connectToPeer(peerId: string, metadata?: { userId?: string; displayName?: string }): Instance {
    const localStream = useMediaStore.getState().localStream;
    
    const peerOptions: PeerConnectionOptions = {
      peerId,
      initiator: true,
    };
    if (localStream) peerOptions.stream = localStream;
    
    const peer = this.createPeerConnection(peerOptions);
    
    const peerInfo: Omit<PeerInfo, 'peerId'> = {
      connection: peer,
      connected: false,
      initiator: true,
    };
    if (metadata?.userId) peerInfo.userId = metadata.userId;
    if (metadata?.displayName) peerInfo.displayName = metadata.displayName;
    if (localStream) peerInfo.localStream = localStream;
    
    usePeerStore.getState().addPeer(peerId, peerInfo);
    
    return peer;
  }

  disconnectFromPeer(peerId: string): void {
    const peerInfo = usePeerStore.getState().getPeer(peerId);
    if (peerInfo?.connection) {
      peerInfo.connection.destroy();
    }
    usePeerStore.getState().removePeer(peerId);
  }

  updateLocalStream(stream: MediaStream): void {
    const peers = usePeerStore.getState().peers;
    
    peers.forEach((peerInfo) => {
      if (peerInfo.connection) {
        // Replace tracks in existing connections
        try {
          peerInfo.connection.removeStream(peerInfo.localStream!);
          peerInfo.connection.addStream(stream);
          usePeerStore.getState().updatePeer(peerInfo.peerId, { localStream: stream });
        } catch (error) {
          console.error(`Failed to update stream for peer ${peerInfo.peerId}:`, error);
        }
      }
    });
  }

  disconnectAll(): void {
    const peers = usePeerStore.getState().peers;
    peers.forEach((peerInfo) => {
      this.disconnectFromPeer(peerInfo.peerId);
    });
    
    // Also disconnect from SFU if connected
    this.disconnectFromSFU();
  }

  // SFU-specific methods for hybrid mode
  async connectToSFU(connectionInfo: any): Promise<void> {
    try {
      // Create SFU peer connection
      this.sfuConnection = new RTCPeerConnection({
        iceServers: this.config.iceServers,
      });

      // Handle connection state changes
      this.sfuConnection.onconnectionstatechange = () => {
        console.log('SFU connection state:', this.sfuConnection?.connectionState);
        this.emit('connection-state-changed', {
          peerId: 'sfu',
          state: this.sfuConnection?.connectionState || 'closed',
        });
      };

      // Handle incoming tracks from SFU
      this.sfuConnection.ontrack = (event) => {
        const [remoteStream] = event.streams;
        const peerId = event.transceiver.mid || 'unknown'; // Use transceiver mid as peer identifier
        
        console.log(`Received track from SFU for peer ${peerId}`);
        this.emit('stream-added', { peerId, stream: remoteStream });
      };

      // Create offer or answer based on connection info
      if (connectionInfo.createOffer) {
        const offer = await this.sfuConnection.createOffer();
        await this.sfuConnection.setLocalDescription(offer);
        
        // Send offer to server
        this.wsService.send({
          type: 'sfu-offer',
          roomId: this.roomId!,
          peerId: usePeerStore.getState().currentPeerId!,
          offer,
          timestamp: Date.now(),
        });
      }

      // Store SFU connection info
      usePeerStore.getState().updatePeer('sfu', {
        connection: this.sfuConnection as any,
        connected: false,
        initiator: false,
      });

    } catch (error) {
      console.error('Failed to connect to SFU:', error);
      throw error;
    }
  }

  disconnectFromSFU(): void {
    if (this.sfuConnection) {
      this.sfuConnection.close();
      this.sfuConnection = null;
    }
    
    // Close all SFU transports
    this.sfuTransports.forEach(transport => transport.close());
    this.sfuTransports.clear();
    
    // Remove SFU from peer store
    usePeerStore.getState().removePeer('sfu');
  }

  getActivePeers(): string[] {
    const peers = usePeerStore.getState().peers;
    return peers
      .filter(peer => peer.connected)
      .map(peer => peer.peerId);
  }

  async getConnectionStats(peerId: string): Promise<ConnectionStats | null> {
    const peerInfo = usePeerStore.getState().getPeer(peerId);
    if (!peerInfo?.connection) return null;

    try {
      // For SimplePeer connections
      if ('_pc' in peerInfo.connection) {
        const pc = (peerInfo.connection as any)._pc as RTCPeerConnection;
        const stats = await pc.getStats();
        
        let bitrate = 0;
        let packetLoss = 0;
        let rtt = 0;
        
        stats.forEach((report) => {
          if (report.type === 'inbound-rtp' && report.mediaType === 'video') {
            bitrate = report.bytesReceived ? (report.bytesReceived * 8) / 1000 : 0;
            packetLoss = report.packetsLost || 0;
          }
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            rtt = report.currentRoundTripTime ? report.currentRoundTripTime * 1000 : 0;
          }
        });
        
        return { bitrate, packetLoss, rtt, jitter: 0 };
      }
      
      // For SFU connection
      if (peerId === 'sfu' && this.sfuConnection) {
        const stats = await this.sfuConnection.getStats();
        let bitrate = 0;
        let packetLoss = 0;
        let rtt = 0;
        
        stats.forEach((report) => {
          if (report.type === 'inbound-rtp') {
            bitrate += report.bytesReceived ? (report.bytesReceived * 8) / 1000 : 0;
            packetLoss += report.packetsLost || 0;
          }
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            rtt = Math.max(rtt, report.currentRoundTripTime ? report.currentRoundTripTime * 1000 : 0);
          }
        });
        
        return { bitrate, packetLoss, rtt, jitter: 0 };
      }
      
    } catch (error) {
      console.error(`Failed to get stats for peer ${peerId}:`, error);
    }
    
    return null;
  }

  // Enhanced stream handling for mode transitions
  async replaceTrack(peerId: string, oldTrack: MediaStreamTrack, newTrack: MediaStreamTrack): Promise<void> {
    const peerInfo = usePeerStore.getState().getPeer(peerId);
    if (!peerInfo?.connection) return;

    try {
      if ('replaceTrack' in peerInfo.connection) {
        await (peerInfo.connection as any).replaceTrack(oldTrack, newTrack);
      } else if ('_pc' in peerInfo.connection) {
        // For SimplePeer
        const pc = (peerInfo.connection as any)._pc as RTCPeerConnection;
        const sender = pc.getSenders().find(s => s.track === oldTrack);
        if (sender) {
          await sender.replaceTrack(newTrack);
        }
      }
    } catch (error) {
      console.error(`Failed to replace track for peer ${peerId}:`, error);
      throw error;
    }
  }
}