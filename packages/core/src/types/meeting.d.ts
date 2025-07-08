import { z } from 'zod';
export declare const MeetingIdSchema: z.ZodString;
export type MeetingId = z.infer<typeof MeetingIdSchema>;
export declare const MeetingStateSchema: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
    type: z.ZodLiteral<"idle">;
}, "strip", z.ZodTypeAny, {
    type: "idle";
}, {
    type: "idle";
}>, z.ZodObject<{
    type: z.ZodLiteral<"connecting">;
    meetingId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "connecting";
    meetingId: string;
}, {
    type: "connecting";
    meetingId: string;
}>, z.ZodObject<{
    type: z.ZodLiteral<"connected">;
    meetingId: z.ZodString;
    peers: z.ZodArray<z.ZodString, "many">;
    encryptionState: z.ZodEnum<["initializing", "ready", "error"]>;
}, "strip", z.ZodTypeAny, {
    type: "connected";
    meetingId: string;
    peers: string[];
    encryptionState: "initializing" | "ready" | "error";
}, {
    type: "connected";
    meetingId: string;
    peers: string[];
    encryptionState: "initializing" | "ready" | "error";
}>, z.ZodObject<{
    type: z.ZodLiteral<"error">;
    error: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "error";
    error: string;
}, {
    type: "error";
    error: string;
}>]>;
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
//# sourceMappingURL=meeting.d.ts.map