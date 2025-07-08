import { z } from 'zod';
export declare const UserIdSchema: z.ZodString;
export type UserId = z.infer<typeof UserIdSchema>;
export declare const UserRoleSchema: z.ZodEnum<["guest", "member", "premium", "enterprise"]>;
export type UserRole = z.infer<typeof UserRoleSchema>;
export interface User {
    id: UserId;
    role: UserRole;
    displayName?: string;
    avatar?: string;
    publicKey?: string;
    createdAt: Date;
}
export interface UserPreferences {
    audioInput?: string;
    audioOutput?: string;
    videoInput?: string;
    enableNoiseSuppression: boolean;
    enableEchoCancellation: boolean;
    enableAutoGainControl: boolean;
    defaultVideoQuality: 'low' | 'medium' | 'high' | 'auto';
}
export interface UserSession {
    userId: UserId;
    peerId: string;
    connectionState: 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed';
    lastSeen: Date;
}
//# sourceMappingURL=user.d.ts.map