import { MLSKeyPackage } from './crypto';

// WebSocket signaling message types
export type SignalingMessageType = 
  | 'join-room'
  | 'leave-room'
  | 'room-joined'
  | 'room-left'
  | 'peer-joined'
  | 'peer-left'
  | 'offer'
  | 'answer'
  | 'ice-candidate'
  | 'media-state-changed'
  | 'key-exchange'
  | 'encryption-status'
  | 'error'
  | 'mode-transition-started'
  | 'mode-transition-info'
  | 'mode-transition-completed'
  | 'mode-transition-failed'
  | 'transition-acknowledged'
  | 'request-connection-refresh'
  | 'connection-refresh'
  | 'sfu-offer'
  | 'ping';

export interface BaseSignalingMessage {
  type: SignalingMessageType;
  timestamp: number;
}

export interface JoinRoomMessage extends BaseSignalingMessage {
  type: 'join-room';
  roomId: string;
  peerId: string;
  displayName?: string;
  mediaState: {
    audio: boolean;
    video: boolean;
    screen: boolean;
  };
}

export interface LeaveRoomMessage extends BaseSignalingMessage {
  type: 'leave-room';
  roomId: string;
  peerId: string;
}

export interface RoomJoinedMessage extends BaseSignalingMessage {
  type: 'room-joined';
  roomId: string;
  peerId: string;
  peers: Array<{
    peerId: string;
    displayName?: string;
    mediaState: {
      audio: boolean;
      video: boolean;
      screen: boolean;
    };
  }>;
  iceServers: RTCIceServer[];
}

export interface RoomLeftMessage extends BaseSignalingMessage {
  type: 'room-left';
  roomId: string;
  peerId: string;
}

export interface PeerJoinedMessage extends BaseSignalingMessage {
  type: 'peer-joined';
  roomId: string;
  peerId: string;
  displayName?: string;
  mediaState: {
    audio: boolean;
    video: boolean;
    screen: boolean;
  };
}

export interface PeerLeftMessage extends BaseSignalingMessage {
  type: 'peer-left';
  roomId: string;
  peerId: string;
}

export interface OfferMessage extends BaseSignalingMessage {
  type: 'offer';
  roomId: string;
  fromPeerId: string;
  toPeerId: string;
  offer: RTCSessionDescriptionInit;
}

export interface AnswerMessage extends BaseSignalingMessage {
  type: 'answer';
  roomId: string;
  fromPeerId: string;
  toPeerId: string;
  answer: RTCSessionDescriptionInit;
}

export interface IceCandidateMessage extends BaseSignalingMessage {
  type: 'ice-candidate';
  roomId: string;
  fromPeerId: string;
  toPeerId: string;
  candidate: RTCIceCandidateInit;
}

export interface MediaStateChangedMessage extends BaseSignalingMessage {
  type: 'media-state-changed';
  roomId: string;
  peerId: string;
  mediaState: {
    audio: boolean;
    video: boolean;
    screen: boolean;
  };
}

export interface KeyExchangeMessage extends BaseSignalingMessage {
  type: 'key-exchange';
  roomId: string;
  fromPeerId: string;
  toPeerId: string;
  keyPackage: MLSKeyPackage;
}

export interface EncryptionStatusMessage extends BaseSignalingMessage {
  type: 'encryption-status';
  roomId: string;
  peerId: string;
  encrypted: boolean;
  groupId?: string;
  epoch?: number;
}

export interface ErrorMessage extends BaseSignalingMessage {
  type: 'error';
  error: string;
  code?: string;
}

// Hybrid mode transition messages
export interface ModeTransitionStartedMessage extends BaseSignalingMessage {
  type: 'mode-transition-started';
  roomId: string;
  fromMode: 'p2p' | 'sfu';
  toMode: 'p2p' | 'sfu';
  reason: string;
}

export interface ModeTransitionInfoMessage extends BaseSignalingMessage {
  type: 'mode-transition-info';
  roomId: string;
  newMode: 'p2p' | 'sfu';
  connectionInfo: any; // SFU or P2P specific connection info
  participants: string[];
}

export interface ModeTransitionCompletedMessage extends BaseSignalingMessage {
  type: 'mode-transition-completed';
  roomId: string;
  mode: 'p2p' | 'sfu';
  duration: number;
}

export interface ModeTransitionFailedMessage extends BaseSignalingMessage {
  type: 'mode-transition-failed';
  roomId: string;
  error: string;
  fromMode: 'p2p' | 'sfu';
  toMode: 'p2p' | 'sfu';
}

export interface TransitionAcknowledgedMessage extends BaseSignalingMessage {
  type: 'transition-acknowledged';
  roomId: string;
  peerId: string;
}

export interface RequestConnectionRefreshMessage extends BaseSignalingMessage {
  type: 'request-connection-refresh';
  roomId: string;
  peerId: string;
}

export interface SfuOfferMessage extends BaseSignalingMessage {
  type: 'sfu-offer';
  roomId: string;
  peerId: string;
  offer: RTCSessionDescriptionInit;
}

export interface PingMessage extends BaseSignalingMessage {
  type: 'ping';
}

export interface ConnectionRefreshMessage extends BaseSignalingMessage {
  type: 'connection-refresh';
  roomId: string;
  connectionInfo: any;
}

export type SignalingMessage = 
  | JoinRoomMessage
  | LeaveRoomMessage
  | RoomJoinedMessage
  | RoomLeftMessage
  | PeerJoinedMessage
  | PeerLeftMessage
  | OfferMessage
  | AnswerMessage
  | IceCandidateMessage
  | MediaStateChangedMessage
  | KeyExchangeMessage
  | EncryptionStatusMessage
  | ErrorMessage
  | ModeTransitionStartedMessage
  | ModeTransitionInfoMessage
  | ModeTransitionCompletedMessage
  | ModeTransitionFailedMessage
  | TransitionAcknowledgedMessage
  | RequestConnectionRefreshMessage
  | ConnectionRefreshMessage
  | SfuOfferMessage
  | PingMessage;

// Room state for Redis storage
export interface RoomState {
  id: string;
  createdAt: Date;
  hostPeerId: string;
  peers: Map<string, PeerInfo>;
}

export interface PeerInfo {
  peerId: string;
  socketId: string;
  displayName?: string;
  joinedAt: Date;
  mediaState: {
    audio: boolean;
    video: boolean;
    screen: boolean;
  };
  encrypted?: boolean;
  keyPackage?: MLSKeyPackage;
}

// ICE server configuration
export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
  credentialType?: 'password' | 'oauth';
}