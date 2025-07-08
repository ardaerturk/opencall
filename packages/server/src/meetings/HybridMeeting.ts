import { Meeting, Participant } from './Meeting';
import { MeetingId, MeetingOptions, ConnectionMode } from '@opencall/core';
import { P2PMeeting } from './P2PMeeting';
import { MediasoupRoom } from './MediasoupRoom';
import { Worker } from 'mediasoup/node/lib/types';
import { logger } from '../utils/logger';
import { EventEmitter } from 'events';

interface TransitionState {
  inProgress: boolean;
  fromMode: ConnectionMode;
  toMode: ConnectionMode;
  startTime: number;
  participants: Set<string>;
}

interface ConnectionQuality {
  participantId: string;
  bitrate: number;
  packetLoss: number;
  jitter: number;
  rtt: number;
  timestamp: number;
}

interface HybridConnectionInfo {
  mode: ConnectionMode;
  transitioning: boolean;
  p2pInfo?: any;
  sfuInfo?: any;
  qualityMetrics: ConnectionQuality[];
}

export class HybridMeeting extends Meeting {
  private currentMeeting: P2PMeeting | MediasoupRoom;
  private transitionState: TransitionState | null = null;
  private workerProvider: () => Promise<Worker>;
  private qualityMetrics = new Map<string, ConnectionQuality[]>();
  private transitionLock = false;
  private modeChangeHistory: Array<{ mode: ConnectionMode; timestamp: Date; reason: string }> = [];
  private prewarmSFU: MediasoupRoom | null = null;
  
  // Thresholds and configuration
  private readonly P2P_THRESHOLD = 3;
  private readonly SFU_THRESHOLD = 4;
  private readonly TRANSITION_TIMEOUT_MS = 2000;
  private readonly MIN_TIME_BETWEEN_TRANSITIONS_MS = 10000;
  private readonly QUALITY_CHECK_INTERVAL_MS = 5000;
  private readonly POOR_QUALITY_THRESHOLD = {
    packetLoss: 5, // 5%
    rtt: 200, // 200ms
    bitrate: 100000, // 100kbps
  };

  constructor(
    id: MeetingId,
    options: MeetingOptions,
    hostId: string,
    workerProvider: () => Promise<Worker>
  ) {
    super(id, options, hostId);
    this.workerProvider = workerProvider;
    
    // Start with P2P if small meeting, otherwise SFU
    const initialMode = this.determineInitialMode();
    this.initializeMeeting(initialMode);
    
    logger.info(`HybridMeeting created: ${id} in ${initialMode} mode`);
  }

  private async initializeMeeting(mode: ConnectionMode): Promise<void> {
    this.currentMeeting = await this.createMeeting(mode);
    this.setupEventHandlers();
    this.startQualityMonitoring();
  }

  private determineInitialMode(): ConnectionMode {
    const expectedParticipants = this.options.maxParticipants || 2;
    return expectedParticipants <= this.P2P_THRESHOLD ? 'p2p' : 'sfu';
  }

  private async createMeeting(mode: ConnectionMode): Promise<P2PMeeting | MediasoupRoom> {
    if (mode === 'p2p') {
      return new P2PMeeting(this.id, this.options, this.hostId);
    } else {
      // MediasoupRoom handles worker internally now
      return new MediasoupRoom(this.id, this.options, this.hostId);
    }
  }

  private setupEventHandlers(): void {
    // Forward events from current meeting
    this.currentMeeting.on('participant:joined', (participant) => {
      this.emit('participant:joined', participant);
      this.checkModeChange('participant-join');
    });

    this.currentMeeting.on('participant:left', (participant) => {
      this.emit('participant:left', participant);
      this.checkModeChange('participant-leave');
    });

    this.currentMeeting.on('meeting:closed', () => {
      this.emit('meeting:closed');
    });
  }

  private startQualityMonitoring(): void {
    setInterval(() => {
      this.updateQualityMetrics();
      this.checkQualityBasedModeChange();
    }, this.QUALITY_CHECK_INTERVAL_MS);
  }

  private updateQualityMetrics(): void {
    // In a real implementation, these metrics would come from WebRTC stats
    // For now, we'll simulate them
    for (const participant of this.participants.values()) {
      const quality: ConnectionQuality = {
        participantId: participant.id,
        bitrate: Math.random() * 1000000 + 500000, // 500kbps - 1.5Mbps
        packetLoss: Math.random() * 10, // 0-10%
        jitter: Math.random() * 50, // 0-50ms
        rtt: Math.random() * 150 + 20, // 20-170ms
        timestamp: Date.now(),
      };

      const metrics = this.qualityMetrics.get(participant.id) || [];
      metrics.push(quality);
      
      // Keep only last 10 samples
      if (metrics.length > 10) {
        metrics.shift();
      }
      
      this.qualityMetrics.set(participant.id, metrics);
    }
  }

  private checkQualityBasedModeChange(): void {
    if (this.transitionLock || this.transitionState) return;

    const currentMode = this.getConnectionInfo().mode;
    const avgQuality = this.getAverageQuality();

    // If in P2P mode and quality is poor with multiple participants, switch to SFU
    if (currentMode === 'p2p' && this.participants.size >= 2) {
      if (avgQuality.packetLoss > this.POOR_QUALITY_THRESHOLD.packetLoss ||
          avgQuality.rtt > this.POOR_QUALITY_THRESHOLD.rtt) {
        logger.info(`Poor quality detected in P2P mode, switching to SFU`, avgQuality);
        this.transitionToMode('sfu', 'poor-quality');
      }
    }
  }

  private getAverageQuality(): { packetLoss: number; rtt: number; bitrate: number } {
    let totalPacketLoss = 0;
    let totalRtt = 0;
    let totalBitrate = 0;
    let count = 0;

    for (const metrics of this.qualityMetrics.values()) {
      if (metrics.length > 0) {
        const latest = metrics[metrics.length - 1];
        totalPacketLoss += latest.packetLoss;
        totalRtt += latest.rtt;
        totalBitrate += latest.bitrate;
        count++;
      }
    }

    return {
      packetLoss: count > 0 ? totalPacketLoss / count : 0,
      rtt: count > 0 ? totalRtt / count : 0,
      bitrate: count > 0 ? totalBitrate / count : 0,
    };
  }

  private async checkModeChange(reason: string): Promise<void> {
    if (this.transitionLock || this.transitionState) return;

    const currentMode = this.getConnectionInfo().mode;
    const participantCount = this.participants.size;
    
    // Check if we need to change modes based on participant count
    if (currentMode === 'p2p' && participantCount >= this.SFU_THRESHOLD) {
      await this.transitionToMode('sfu', reason);
    } else if (currentMode === 'sfu' && participantCount <= this.P2P_THRESHOLD) {
      // Check if enough time has passed since last transition
      const lastTransition = this.modeChangeHistory[this.modeChangeHistory.length - 1];
      if (!lastTransition || 
          Date.now() - lastTransition.timestamp.getTime() > this.MIN_TIME_BETWEEN_TRANSITIONS_MS) {
        await this.transitionToMode('p2p', reason);
      }
    }
  }

  private async transitionToMode(targetMode: ConnectionMode, reason: string): Promise<void> {
    if (this.transitionLock || this.transitionState) {
      logger.warn(`Transition already in progress, skipping transition to ${targetMode}`);
      return;
    }

    const currentMode = this.getConnectionInfo().mode;
    if (currentMode === targetMode) return;

    this.transitionLock = true;
    
    try {
      logger.info(`Starting transition from ${currentMode} to ${targetMode}`, {
        meetingId: this.id,
        reason,
        participantCount: this.participants.size,
      });

      // Start transition
      this.transitionState = {
        inProgress: true,
        fromMode: currentMode,
        toMode: targetMode,
        startTime: Date.now(),
        participants: new Set(this.participants.keys()),
      };

      // Emit transition started event
      this.emit('transition:started', {
        fromMode: currentMode,
        toMode: targetMode,
        reason,
      });

      // Create new meeting instance
      const newMeeting = targetMode === 'p2p' 
        ? new P2PMeeting(this.id, this.options, this.hostId)
        : this.prewarmSFU || new MediasoupRoom(this.id, this.options, this.hostId);

      // If we used prewarmed SFU, clear it
      if (targetMode === 'sfu' && this.prewarmSFU) {
        this.prewarmSFU = null;
      }

      // Get current state
      const currentParticipants = Array.from(this.participants.values());
      const connectionInfo = this.currentMeeting.getConnectionInfo();

      // Add all participants to new meeting
      for (const participant of currentParticipants) {
        await newMeeting.addParticipant(participant);
      }

      // Store old meeting for cleanup
      const oldMeeting = this.currentMeeting;

      // Switch to new meeting
      this.currentMeeting = newMeeting;
      this.setupEventHandlers();

      // Emit transition info to all participants
      this.emit('transition:info', {
        newMode: targetMode,
        connectionInfo: newMeeting.getConnectionInfo(),
        participants: currentParticipants.map(p => p.id),
      });

      // Wait for clients to acknowledge transition
      await this.waitForClientAcknowledgments();

      // Clean up old meeting
      await oldMeeting.close();

      // Complete transition
      this.transitionState = null;
      
      // Record mode change
      this.modeChangeHistory.push({
        mode: targetMode,
        timestamp: new Date(),
        reason,
      });

      // Emit transition completed
      this.emit('transition:completed', {
        mode: targetMode,
        duration: Date.now() - this.transitionState!.startTime,
      });

      logger.info(`Transition completed to ${targetMode}`, {
        meetingId: this.id,
        duration: Date.now() - this.transitionState!.startTime,
      });

      // Pre-warm SFU if we're in P2P mode with 3 participants
      if (targetMode === 'p2p' && this.participants.size === 3) {
        this.prewarmSFUInstance();
      }

    } catch (error) {
      logger.error(`Transition failed from ${currentMode} to ${targetMode}`, error);
      
      // Emit transition failed
      this.emit('transition:failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        fromMode: currentMode,
        toMode: targetMode,
      });

      this.transitionState = null;
    } finally {
      this.transitionLock = false;
    }
  }

  private async waitForClientAcknowledgments(): Promise<void> {
    // In a real implementation, we would wait for WebSocket acknowledgments
    // from all clients before proceeding
    return new Promise((resolve) => {
      setTimeout(resolve, 500); // Simulated wait
    });
  }

  private async prewarmSFUInstance(): Promise<void> {
    if (this.prewarmSFU) return;

    try {
      logger.info(`Pre-warming SFU instance for meeting ${this.id}`);
      this.prewarmSFU = new MediasoupRoom(
        this.id + '-prewarm',
        this.options,
        this.hostId
      );
    } catch (error) {
      logger.error(`Failed to pre-warm SFU instance`, error);
    }
  }

  async addParticipant(participant: Participant): Promise<void> {
    this.participants.set(participant.id, participant);
    await this.currentMeeting.addParticipant(participant);
  }

  async removeParticipant(participantId: string): Promise<void> {
    const participant = this.participants.get(participantId);
    if (!participant) return;

    this.participants.delete(participantId);
    this.qualityMetrics.delete(participantId);
    await this.currentMeeting.removeParticipant(participantId);
  }

  async close(): Promise<void> {
    // Clean up prewarmed SFU if exists
    if (this.prewarmSFU) {
      await this.prewarmSFU.close();
    }

    // Close current meeting
    await this.currentMeeting.close();
    
    this.participants.clear();
    this.qualityMetrics.clear();
    
    logger.info(`HybridMeeting ${this.id} closed`);
  }

  getConnectionInfo(): HybridConnectionInfo {
    const baseInfo = this.currentMeeting.getConnectionInfo();
    const qualityMetrics: ConnectionQuality[] = [];

    // Get latest quality metrics for each participant
    for (const [participantId, metrics] of this.qualityMetrics) {
      if (metrics.length > 0) {
        qualityMetrics.push(metrics[metrics.length - 1]);
      }
    }

    return {
      mode: baseInfo.mode,
      transitioning: this.transitionState !== null,
      p2pInfo: baseInfo.mode === 'p2p' ? baseInfo : undefined,
      sfuInfo: baseInfo.mode === 'sfu' ? baseInfo : undefined,
      qualityMetrics,
    };
  }

  getTransitionHistory(): Array<{ mode: ConnectionMode; timestamp: Date; reason: string }> {
    return [...this.modeChangeHistory];
  }

  isTransitioning(): boolean {
    return this.transitionState !== null;
  }

  getCurrentMode(): ConnectionMode {
    return this.currentMeeting.getConnectionInfo().mode;
  }
}