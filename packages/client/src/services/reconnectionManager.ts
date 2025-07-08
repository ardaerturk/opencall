import { WebSocketService } from './websocket';
import { PeerConnectionService } from './peerConnection';
import { useConnectionStore } from '../stores/connectionStore';
import { usePeerStore } from '../stores/peerStore';

export interface ReconnectionConfig {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

export class ReconnectionManager {
  private config: ReconnectionConfig;
  private reconnectTimer: number | null = null;
  private attemptCount = 0;
  private currentDelay: number;
  private isReconnecting = false;
  private lastRoomId: string | null = null;
  private onReconnectStart?: () => void;
  private onReconnectSuccess?: () => void;
  private onReconnectFail?: (error: Error) => void;

  constructor(config?: Partial<ReconnectionConfig>) {
    this.config = {
      maxAttempts: 5,
      initialDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      ...config,
    };
    this.currentDelay = this.config.initialDelay;
  }

  setCallbacks(callbacks: {
    onStart?: () => void;
    onSuccess?: () => void;
    onFail?: (error: Error) => void;
  }): void {
    this.onReconnectStart = callbacks.onStart;
    this.onReconnectSuccess = callbacks.onSuccess;
    this.onReconnectFail = callbacks.onFail;
  }

  async startReconnection(
    wsService: WebSocketService,
    peerService: PeerConnectionService,
    roomId: string
  ): Promise<void> {
    if (this.isReconnecting) {
      console.log('Already reconnecting...');
      return;
    }

    this.isReconnecting = true;
    this.lastRoomId = roomId;
    this.attemptCount = 0;
    this.currentDelay = this.config.initialDelay;

    this.onReconnectStart?.();
    
    await this.attemptReconnect(wsService, peerService);
  }

  private async attemptReconnect(
    wsService: WebSocketService,
    peerService: PeerConnectionService
  ): Promise<void> {
    if (!this.lastRoomId) {
      this.stopReconnection();
      return;
    }

    this.attemptCount++;
    console.log(`Reconnection attempt ${this.attemptCount}/${this.config.maxAttempts}`);

    try {
      // Update connection state
      useConnectionStore.getState().setMeetingState({
        type: 'connecting',
        meetingId: this.lastRoomId,
      });

      // Reconnect WebSocket
      if (!wsService.isConnected()) {
        await wsService.connect();
      }

      // Get current peer ID
      const currentPeerId = usePeerStore.getState().currentPeerId;
      if (!currentPeerId) {
        throw new Error('No peer ID available for reconnection');
      }

      // Rejoin the room
      wsService.send({
        type: 'join-room',
        roomId: this.lastRoomId,
        peerId: currentPeerId,
        timestamp: Date.now(),
        mediaState: {
          audio: true,
          video: true,
          screen: false,
        },
      });

      // Wait a bit for the join confirmation
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Reconnect to peers
      const peers = usePeerStore.getState().peers;
      for (const [peerId, peerInfo] of peers) {
        if (!peerInfo.connected) {
          console.log(`Reconnecting to peer ${peerId}`);
          const metadata: { userId?: string; displayName?: string } = {};
          if (peerInfo.userId) metadata.userId = peerInfo.userId;
          if (peerInfo.displayName) metadata.displayName = peerInfo.displayName;
          peerService.connectToPeer(peerId, metadata);
        }
      }

      // Success!
      this.isReconnecting = false;
      this.attemptCount = 0;
      this.currentDelay = this.config.initialDelay;

      useConnectionStore.getState().setMeetingState({
        type: 'connected',
        meetingId: this.lastRoomId,
        peers: Array.from(peers.keys()),
        encryptionState: 'ready',
      });

      this.onReconnectSuccess?.();
      console.log('Reconnection successful');
    } catch (error) {
      console.error('Reconnection attempt failed:', error);

      if (this.attemptCount >= this.config.maxAttempts) {
        // Max attempts reached
        this.stopReconnection();
        useConnectionStore.getState().setMeetingState({
          type: 'error',
          error: 'Failed to reconnect after multiple attempts',
        });
        this.onReconnectFail?.(new Error('Max reconnection attempts reached'));
        return;
      }

      // Schedule next attempt
      console.log(`Next reconnection attempt in ${this.currentDelay}ms`);
      this.reconnectTimer = window.setTimeout(() => {
        this.attemptReconnect(wsService, peerService);
      }, this.currentDelay);

      // Increase delay for next attempt
      this.currentDelay = Math.min(
        this.currentDelay * this.config.backoffMultiplier,
        this.config.maxDelay
      );
    }
  }

  stopReconnection(): void {
    this.isReconnecting = false;
    this.attemptCount = 0;
    this.currentDelay = this.config.initialDelay;
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  isActive(): boolean {
    return this.isReconnecting;
  }

  getAttemptCount(): number {
    return this.attemptCount;
  }

  getNextDelay(): number {
    return this.currentDelay;
  }
}