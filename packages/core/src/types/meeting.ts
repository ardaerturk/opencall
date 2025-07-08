import { z } from 'zod';

export const MeetingIdSchema = z.string().min(8).max(64);
export type MeetingId = z.infer<typeof MeetingIdSchema>;

export const MeetingStateSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('idle') }),
  z.object({ type: z.literal('connecting'), meetingId: MeetingIdSchema }),
  z.object({
    type: z.literal('connected'),
    meetingId: MeetingIdSchema,
    peers: z.array(z.string()),
    encryptionState: z.enum(['initializing', 'ready', 'error']),
  }),
  z.object({ type: z.literal('error'), error: z.string() }),
]);

export type MeetingState = z.infer<typeof MeetingStateSchema>;

export interface MeetingOptions {
  type: 'instant' | 'scheduled';
  encryption: 'e2e' | 'none';
  maxParticipants?: number;
  enableRecording?: boolean;
}

export interface Meeting {
  id: MeetingId;
  createdAt: Date;
  joinLink: string;
  options: MeetingOptions;
  hostPeerId?: string;
}

export type ConnectionMode = 'p2p' | 'sfu';

export interface MeetingConfig {
  p2pThreshold: number;
  stunServers: string[];
  turnServers: Array<{
    urls: string[];
    username?: string;
    credential?: string;
  }>;
  iceTransportPolicy: RTCIceTransportPolicy;
}
