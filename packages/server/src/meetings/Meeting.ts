import { Meeting as MeetingType, MeetingOptions, MeetingId, ConnectionMode } from '@opencall/core';
import { EventEmitter } from 'events';

export interface Participant {
  id: string;
  peerId: string;
  displayName?: string;
  joinedAt: Date;
  isHost: boolean;
  mediaState: {
    audio: boolean;
    video: boolean;
    screen: boolean;
  };
}

export abstract class Meeting extends EventEmitter {
  protected participants = new Map<string, Participant>();
  protected createdAt = new Date();
  protected mode: ConnectionMode;

  constructor(
    public readonly id: MeetingId,
    public readonly options: MeetingOptions,
    protected hostId: string
  ) {
    super();
    this.mode = this.determineMode();
  }

  abstract async addParticipant(participant: Participant): Promise<void>;
  abstract async removeParticipant(participantId: string): Promise<void>;
  abstract async close(): Promise<void>;
  abstract getConnectionInfo(): any;

  protected determineMode(): ConnectionMode {
    return this.options.maxParticipants && this.options.maxParticipants <= 3 ? 'p2p' : 'sfu';
  }

  getParticipants(): Participant[] {
    return Array.from(this.participants.values());
  }

  getParticipantCount(): number {
    return this.participants.size;
  }

  getParticipant(id: string): Participant | undefined {
    return this.participants.get(id);
  }

  isHost(participantId: string): boolean {
    return participantId === this.hostId;
  }

  getMeetingInfo(): MeetingType {
    return {
      id: this.id,
      createdAt: this.createdAt,
      joinLink: this.generateJoinLink(),
      options: this.options,
      hostPeerId: this.hostId,
    };
  }

  protected generateJoinLink(): string {
    const baseUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    return `${baseUrl}/meeting/${this.id}`;
  }
}