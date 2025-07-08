import { z } from 'zod';

export const UserIdSchema = z.string().min(16).max(64);
export type UserId = z.infer<typeof UserIdSchema>;

export const UserRoleSchema = z.enum(['guest', 'member', 'premium']);
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
