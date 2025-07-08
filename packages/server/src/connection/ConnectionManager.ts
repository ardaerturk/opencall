import { EventEmitter } from 'events';
import { Meeting } from '../meetings/Meeting';
import { P2PMeeting } from '../meetings/P2PMeeting';
import { MediasoupRoom } from '../meetings/MediasoupRoom';
import { HybridMeeting } from '../meetings/HybridMeeting';
import { MeetingId, MeetingOptions, P2P_PARTICIPANT_LIMIT } from '@opencall/core';
import { logger } from '../utils/logger';
import { MediasoupManager } from '../mediasoup/MediasoupManager';

export class ConnectionManager extends EventEmitter {
  private meetings = new Map<MeetingId, Meeting>();
  private mediasoupManager: MediasoupManager;
  private readonly p2pThreshold = P2P_PARTICIPANT_LIMIT;

  constructor() {
    super();
    this.mediasoupManager = MediasoupManager.getInstance();
    this.initializeMediasoup();
  }

  private async initializeMediasoup(): Promise<void> {
    await this.mediasoupManager.initialize();
    logger.info('MediasoupManager initialized');
  }

  async createMeeting(
    meetingId: MeetingId,
    options: MeetingOptions,
    hostId: string
  ): Promise<Meeting> {
    if (this.meetings.has(meetingId)) {
      throw new Error(`Meeting ${meetingId} already exists`);
    }

    logger.info(`Creating hybrid meeting ${meetingId}`, { options });
    
    // Create hybrid meeting that handles mode switching automatically
    const meeting = new HybridMeeting(
      meetingId, 
      options, 
      hostId, 
      async () => {
        const { router, worker } = await this.mediasoupManager.createRouter();
        return worker;
      }
    );
    
    // Set up event listeners for hybrid meeting
    this.setupHybridMeetingListeners(meeting);

    this.meetings.set(meetingId, meeting);
    this.emit('meeting:created', { 
      meetingId, 
      mode: meeting.getConnectionInfo().mode,
      hybrid: true 
    });

    return meeting;
  }

  private setupHybridMeetingListeners(meeting: HybridMeeting): void {
    // Forward transition events
    meeting.on('transition:started', (data) => {
      this.emit('meeting:transition:started', {
        meetingId: meeting.id,
        ...data
      });
    });

    meeting.on('transition:completed', (data) => {
      this.emit('meeting:transition:completed', {
        meetingId: meeting.id,
        ...data
      });
    });

    meeting.on('transition:failed', (data) => {
      this.emit('meeting:transition:failed', {
        meetingId: meeting.id,
        ...data
      });
    });

    // Handle transition info for signaling
    meeting.on('transition:info', (data) => {
      // This will be picked up by SignalingHandler to notify clients
      this.emit('meeting:transition:info', {
        meetingId: meeting.id,
        ...data
      });
    });
  }

  async upgradeToSFU(meetingId: MeetingId): Promise<Meeting> {
    const meeting = this.meetings.get(meetingId);
    if (!meeting || !(meeting instanceof P2PMeeting)) {
      throw new Error(`Cannot upgrade meeting ${meetingId}`);
    }

    logger.info(`Upgrading meeting ${meetingId} from P2P to SFU`);

    // Get current state from P2P meeting
    const state = await meeting.upgradeToSFU();
    
    // Create new MediasoupRoom (SFU) meeting
    const sfuMeeting = new MediasoupRoom(
      meetingId,
      state.meetingInfo.options,
      state.meetingInfo.hostPeerId!
    );

    // Restore participants
    for (const participant of state.participants) {
      await sfuMeeting.addParticipant(participant);
    }

    // Replace meeting in map
    this.meetings.set(meetingId, sfuMeeting);

    this.emit('meeting:upgraded', { meetingId, from: 'p2p', to: 'sfu' });
    
    return sfuMeeting;
  }

  getMeeting(meetingId: MeetingId): Meeting | undefined {
    return this.meetings.get(meetingId);
  }

  async closeMeeting(meetingId: MeetingId): Promise<void> {
    const meeting = this.meetings.get(meetingId);
    if (!meeting) {
      throw new Error(`Meeting ${meetingId} not found`);
    }

    await meeting.close();
    this.meetings.delete(meetingId);
    
    logger.info(`Meeting ${meetingId} removed from manager`);
    this.emit('meeting:closed', { meetingId });
  }


  getStats() {
    const meetingStats = Array.from(this.meetings.values()).map(meeting => ({
      id: meeting.id,
      mode: meeting.getConnectionInfo().mode,
      participantCount: meeting.getParticipantCount(),
      createdAt: meeting.getMeetingInfo().createdAt,
    }));

    const workerStats = this.mediasoupManager.getWorkerStats();

    return {
      totalMeetings: this.meetings.size,
      p2pMeetings: meetingStats.filter(m => m.mode === 'p2p').length,
      sfuMeetings: meetingStats.filter(m => m.mode === 'sfu').length,
      meetings: meetingStats,
      workers: workerStats,
    };
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down ConnectionManager');

    // Close all meetings
    const closingPromises = Array.from(this.meetings.keys()).map(meetingId =>
      this.closeMeeting(meetingId).catch(error =>
        logger.error(`Error closing meeting ${meetingId}`, error)
      )
    );

    await Promise.all(closingPromises);

    // Close MediasoupManager
    await this.mediasoupManager.close();

    logger.info('ConnectionManager shutdown complete');
  }
}