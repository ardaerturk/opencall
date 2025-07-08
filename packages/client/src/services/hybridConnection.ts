import { EventEmitter } from 'events';
import { PeerConnectionService } from './peerConnection';
import { WebSocketService, SignalData } from './websocket';

export type ConnectionMode = 'p2p' | 'sfu';

export interface TransitionInfo {
  fromMode: ConnectionMode;
  toMode: ConnectionMode;
  reason: string;
  newConnectionInfo?: any;
}

export interface HybridConnectionEvents {
  'mode-changed': (mode: ConnectionMode) => void;
  'transition-started': (info: TransitionInfo) => void;
  'transition-completed': (info: { mode: ConnectionMode; duration: number }) => void;
  'transition-failed': (error: { error: string; fromMode: ConnectionMode; toMode: ConnectionMode }) => void;
  'quality-update': (metrics: ConnectionQualityMetrics) => void;
}

export interface ConnectionQualityMetrics {
  bitrate: number;
  packetLoss: number;
  jitter: number;
  rtt: number;
  mode: ConnectionMode;
  timestamp: number;
}

export class HybridConnectionService extends EventEmitter {
  private wsService: WebSocketService;
  private peerService: PeerConnectionService;
  private currentMode: ConnectionMode = 'p2p';
  private isTransitioning = false;
  private localStream: MediaStream | null = null;
  private remoteStreams = new Map<string, MediaStream>();
  private qualityMonitorInterval?: number;
  private statsCollectionInterval?: number;
  private connectionQuality: ConnectionQualityMetrics[] = [];
  
  // Transition state management
  private pendingTransition: TransitionInfo | null = null;
  private transitionAcknowledged = false;
  
  constructor(wsService: WebSocketService) {
    super();
    this.wsService = wsService;
    this.peerService = new PeerConnectionService(wsService);
    
    this.setupEventHandlers();
    this.startQualityMonitoring();
  }

  private setupEventHandlers(): void {
    // Handle mode transition messages from server
    this.wsService.on('mode-transition-started', (data: SignalData) => {
      this.handleTransitionStarted(data as any);
    });

    this.wsService.on('mode-transition-info', (data: SignalData) => {
      this.handleTransitionInfo(data as any);
    });

    this.wsService.on('mode-transition-completed', (data: SignalData) => {
      this.handleTransitionCompleted(data as any);
    });

    this.wsService.on('mode-transition-failed', (data: SignalData) => {
      this.handleTransitionFailed(data as any);
    });

    // Monitor peer connection events
    this.peerService.on('stream-added', ({ peerId, stream }) => {
      this.remoteStreams.set(peerId, stream);
      this.emit('stream-added', { peerId, stream });
    });

    this.peerService.on('stream-removed', ({ peerId }) => {
      this.remoteStreams.delete(peerId);
      this.emit('stream-removed', { peerId });
    });

    this.peerService.on('connection-state-changed', ({ peerId, state }) => {
      this.emit('connection-state-changed', { peerId, state });
    });
  }

  private async handleTransitionStarted(data: {
    fromMode: ConnectionMode;
    toMode: ConnectionMode;
    reason: string;
  }): Promise<void> {
    console.log('Mode transition started:', data);
    
    this.isTransitioning = true;
    this.pendingTransition = data;
    
    // Emit event for UI update
    this.emit('transition-started', data);
    
    // Prepare for transition
    await this.prepareForTransition(data.toMode);
  }

  private async handleTransitionInfo(data: {
    newMode: ConnectionMode;
    connectionInfo: any;
    participants: string[];
  }): Promise<void> {
    console.log('Transition info received:', data);
    
    if (!this.pendingTransition) {
      console.error('Received transition info without pending transition');
      return;
    }

    try {
      // Store current connections state
      const currentPeers = this.peerService.getActivePeers();
      const currentStreams = new Map(this.remoteStreams);
      
      // Update connection mode
      this.currentMode = data.newMode;
      
      if (data.newMode === 'sfu') {
        // Switch to SFU mode
        await this.switchToSFUMode(data.connectionInfo);
      } else {
        // Switch to P2P mode
        await this.switchToP2PMode(data.connectionInfo);
      }
      
      // Restore streams for existing peers
      for (const [peerId, stream] of currentStreams) {
        if (data.participants.includes(peerId)) {
          this.remoteStreams.set(peerId, stream);
        }
      }
      
      // Send acknowledgment to server
      this.wsService.send({
        type: 'transition-acknowledged',
        roomId: this.getRoomId(),
        peerId: this.getLocalPeerId(),
        timestamp: Date.now(),
      });
      
      this.transitionAcknowledged = true;
      
    } catch (error) {
      console.error('Failed to handle transition info:', error);
      this.emit('transition-failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        fromMode: this.pendingTransition.fromMode,
        toMode: data.newMode,
      });
    }
  }

  private async handleTransitionCompleted(data: {
    mode: ConnectionMode;
    duration: number;
  }): Promise<void> {
    console.log('Mode transition completed:', data);
    
    this.isTransitioning = false;
    this.pendingTransition = null;
    this.transitionAcknowledged = false;
    
    // Emit event for UI update
    this.emit('transition-completed', data);
    this.emit('mode-changed', data.mode);
    
    // Resume normal operations
    this.resumeQualityMonitoring();
  }

  private async handleTransitionFailed(data: {
    error: string;
    fromMode: ConnectionMode;
    toMode: ConnectionMode;
  }): Promise<void> {
    console.error('Mode transition failed:', data);
    
    this.isTransitioning = false;
    this.pendingTransition = null;
    this.transitionAcknowledged = false;
    
    // Emit event for UI/error handling
    this.emit('transition-failed', data);
    
    // Try to recover current connections
    await this.recoverConnections();
  }

  private async prepareForTransition(toMode: ConnectionMode): Promise<void> {
    // Pause quality monitoring during transition
    this.pauseQualityMonitoring();
    
    // Save current media states
    const audioEnabled = this.localStream?.getAudioTracks()[0]?.enabled ?? false;
    const videoEnabled = this.localStream?.getVideoTracks()[0]?.enabled ?? false;
    
    // Store in session storage for recovery
    sessionStorage.setItem('transition-media-state', JSON.stringify({
      audioEnabled,
      videoEnabled,
      peerId: this.getLocalPeerId(),
    }));
  }

  private async switchToSFUMode(connectionInfo: any): Promise<void> {
    console.log('Switching to SFU mode with info:', connectionInfo);
    
    // Close all P2P connections
    this.peerService.disconnectAll();
    
    // Initialize SFU connection
    // In a real implementation, this would set up mediasoup-client
    // For now, we'll use the existing peer connection with SFU-specific config
    
    // Create a single connection to the SFU
    await this.peerService.connectToSFU(connectionInfo);
    
    // Re-add local stream
    if (this.localStream) {
      await this.peerService.updateLocalStream(this.localStream);
    }
  }

  private async switchToP2PMode(connectionInfo: any): Promise<void> {
    console.log('Switching to P2P mode with info:', connectionInfo);
    
    // Close SFU connection
    this.peerService.disconnectFromSFU();
    
    // Re-establish P2P connections with all participants
    // The server will coordinate peer connections
  }

  private async recoverConnections(): Promise<void> {
    console.log('Attempting to recover connections after failed transition');
    
    // Try to restore media state
    const savedState = sessionStorage.getItem('transition-media-state');
    if (savedState) {
      try {
        const { audioEnabled, videoEnabled } = JSON.parse(savedState);
        if (this.localStream) {
          this.localStream.getAudioTracks().forEach(track => {
            track.enabled = audioEnabled;
          });
          this.localStream.getVideoTracks().forEach(track => {
            track.enabled = videoEnabled;
          });
        }
      } catch (error) {
        console.error('Failed to restore media state:', error);
      }
      sessionStorage.removeItem('transition-media-state');
    }
    
    // Request connection state refresh from server
    this.wsService.send({
      type: 'request-connection-refresh',
      roomId: this.getRoomId(),
      peerId: this.getLocalPeerId(),
      timestamp: Date.now(),
    });
  }

  private startQualityMonitoring(): void {
    this.qualityMonitorInterval = window.setInterval(() => {
      if (!this.isTransitioning) {
        this.collectQualityMetrics();
      }
    }, 5000); // Every 5 seconds
    
    this.statsCollectionInterval = window.setInterval(() => {
      if (!this.isTransitioning) {
        this.collectDetailedStats();
      }
    }, 1000); // Every second for detailed stats
  }

  private pauseQualityMonitoring(): void {
    // Keep intervals running but skip collection during transition
    console.log('Quality monitoring paused during transition');
  }

  private resumeQualityMonitoring(): void {
    console.log('Quality monitoring resumed');
    // Clear old metrics from before transition
    this.connectionQuality = [];
  }

  private async collectQualityMetrics(): Promise<void> {
    const peers = this.peerService.getActivePeers();
    let totalBitrate = 0;
    let totalPacketLoss = 0;
    let totalRtt = 0;
    let count = 0;

    for (const peerId of peers) {
      const stats = await this.peerService.getConnectionStats(peerId);
      if (stats) {
        totalBitrate += stats.bitrate || 0;
        totalPacketLoss += stats.packetLoss || 0;
        totalRtt += stats.rtt || 0;
        count++;
      }
    }

    if (count > 0) {
      const metrics: ConnectionQualityMetrics = {
        bitrate: totalBitrate / count,
        packetLoss: totalPacketLoss / count,
        jitter: 0, // Would be calculated from detailed stats
        rtt: totalRtt / count,
        mode: this.currentMode,
        timestamp: Date.now(),
      };

      this.connectionQuality.push(metrics);
      
      // Keep only last 10 samples
      if (this.connectionQuality.length > 10) {
        this.connectionQuality.shift();
      }

      this.emit('quality-update', metrics);
    }
  }

  private async collectDetailedStats(): Promise<void> {
    // Collect detailed WebRTC stats for real-time monitoring
    // This would be used for the performance dashboard
  }

  public async setLocalStream(stream: MediaStream): Promise<void> {
    this.localStream = stream;
    await this.peerService.updateLocalStream(stream);
  }

  public getRemoteStreams(): Map<string, MediaStream> {
    return new Map(this.remoteStreams);
  }

  public getCurrentMode(): ConnectionMode {
    return this.currentMode;
  }

  public isInTransition(): boolean {
    return this.isTransitioning;
  }

  public getConnectionQuality(): ConnectionQualityMetrics[] {
    return [...this.connectionQuality];
  }

  public getAverageQuality(): ConnectionQualityMetrics | null {
    if (this.connectionQuality.length === 0) return null;
    
    const sum = this.connectionQuality.reduce((acc, curr) => ({
      bitrate: acc.bitrate + curr.bitrate,
      packetLoss: acc.packetLoss + curr.packetLoss,
      jitter: acc.jitter + curr.jitter,
      rtt: acc.rtt + curr.rtt,
      mode: curr.mode,
      timestamp: Date.now(),
    }));

    const count = this.connectionQuality.length;
    return {
      bitrate: sum.bitrate / count,
      packetLoss: sum.packetLoss / count,
      jitter: sum.jitter / count,
      rtt: sum.rtt / count,
      mode: this.currentMode,
      timestamp: Date.now(),
    };
  }

  private getRoomId(): string {
    // This should be properly managed in the app state
    return (window as any).__currentRoomId || '';
  }

  private getLocalPeerId(): string {
    // This should be properly managed in the app state
    return (window as any).__localPeerId || '';
  }

  public destroy(): void {
    if (this.qualityMonitorInterval) {
      clearInterval(this.qualityMonitorInterval);
    }
    if (this.statsCollectionInterval) {
      clearInterval(this.statsCollectionInterval);
    }
    
    this.peerService.disconnectAll();
    this.remoteStreams.clear();
    this.connectionQuality = [];
    this.removeAllListeners();
  }
}