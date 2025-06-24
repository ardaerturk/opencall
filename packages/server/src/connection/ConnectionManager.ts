import { EventEmitter } from 'events';
import * as mediasoup from 'mediasoup';
import { Worker } from 'mediasoup/node/lib/types';
import { Meeting } from '../meetings/Meeting';
import { P2PMeeting } from '../meetings/P2PMeeting';
import { SFUMeeting } from '../meetings/SFUMeeting';
import { MeetingId, MeetingOptions, P2P_PARTICIPANT_LIMIT } from '@dmp/core';
import { logger } from '../utils/logger';
import { mediasoupConfig } from '../mediasoup/config';

export class ConnectionManager extends EventEmitter {
  private meetings = new Map<MeetingId, Meeting>();
  private workers: Worker[] = [];
  private nextWorkerIndex = 0;
  private readonly p2pThreshold = P2P_PARTICIPANT_LIMIT;

  constructor() {
    super();
    this.initializeWorkers();
  }

  private async initializeWorkers(): Promise<void> {
    const numWorkers = Number(process.env.MEDIASOUP_NUM_WORKERS) || 
                      require('os').cpus().length;

    logger.info(`Creating ${numWorkers} mediasoup workers`);

    for (let i = 0; i < numWorkers; i++) {
      const worker = await mediasoup.createWorker({
        logLevel: mediasoupConfig.worker.logLevel,
        logTags: mediasoupConfig.worker.logTags,
        rtcMinPort: mediasoupConfig.worker.rtcMinPort,
        rtcMaxPort: mediasoupConfig.worker.rtcMaxPort,
      });

      worker.on('died', () => {
        logger.error(`mediasoup worker died, exiting in 2 seconds...`, {
          workerId: worker.pid,
        });
        setTimeout(() => process.exit(1), 2000);
      });

      this.workers.push(worker);
    }

    logger.info('All mediasoup workers created');
  }

  async createMeeting(
    meetingId: MeetingId,
    options: MeetingOptions,
    hostId: string
  ): Promise<Meeting> {
    if (this.meetings.has(meetingId)) {
      throw new Error(`Meeting ${meetingId} already exists`);
    }

    let meeting: Meeting;

    // Determine initial mode based on expected participants
    const expectedParticipants = options.maxParticipants || 2;
    
    if (expectedParticipants <= this.p2pThreshold) {
      logger.info(`Creating P2P meeting ${meetingId}`, { expectedParticipants });
      meeting = new P2PMeeting(meetingId, options, hostId);
      
      // Set up upgrade listener
      meeting.on('upgrade:required', async (data) => {
        logger.info(`Meeting ${meetingId} requires upgrade to SFU`, data);
        await this.upgradeToSFU(meetingId);
      });
    } else {
      logger.info(`Creating SFU meeting ${meetingId}`, { expectedParticipants });
      const worker = this.getNextWorker();
      meeting = new SFUMeeting(meetingId, options, hostId, worker);
    }

    this.meetings.set(meetingId, meeting);
    this.emit('meeting:created', { meetingId, mode: meeting.getConnectionInfo().mode });

    return meeting;
  }

  async upgradeToSFU(meetingId: MeetingId): Promise<Meeting> {
    const meeting = this.meetings.get(meetingId);
    if (!meeting || !(meeting instanceof P2PMeeting)) {
      throw new Error(`Cannot upgrade meeting ${meetingId}`);
    }

    logger.info(`Upgrading meeting ${meetingId} from P2P to SFU`);

    // Get current state from P2P meeting
    const state = await meeting.upgradeToSFU();
    
    // Create new SFU meeting
    const worker = this.getNextWorker();
    const sfuMeeting = new SFUMeeting(
      meetingId,
      state.meetingInfo.options,
      state.meetingInfo.hostPeerId!,
      worker
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

  private getNextWorker(): Worker {
    const worker = this.workers[this.nextWorkerIndex];
    this.nextWorkerIndex = (this.nextWorkerIndex + 1) % this.workers.length;
    return worker;
  }

  getStats() {
    const meetingStats = Array.from(this.meetings.values()).map(meeting => ({
      id: meeting.id,
      mode: meeting.getConnectionInfo().mode,
      participantCount: meeting.getParticipantCount(),
      createdAt: meeting.getMeetingInfo().createdAt,
    }));

    const workerStats = this.workers.map((worker, index) => ({
      index,
      pid: worker.pid,
      closed: worker.closed,
    }));

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

    // Close all workers
    for (const worker of this.workers) {
      worker.close();
    }

    logger.info('ConnectionManager shutdown complete');
  }
}