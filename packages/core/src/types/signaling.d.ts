export type SignalingMessageType = 'join-room' | 'leave-room' | 'room-joined' | 'room-left' | 'peer-joined' | 'peer-left' | 'offer' | 'answer' | 'ice-candidate' | 'media-state-changed' | 'error';
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
export interface ErrorMessage extends BaseSignalingMessage {
    type: 'error';
    error: string;
    code?: string;
}
export type SignalingMessage = JoinRoomMessage | LeaveRoomMessage | RoomJoinedMessage | RoomLeftMessage | PeerJoinedMessage | PeerLeftMessage | OfferMessage | AnswerMessage | IceCandidateMessage | MediaStateChangedMessage | ErrorMessage;
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
}
export interface IceServerConfig {
    urls: string | string[];
    username?: string;
    credential?: string;
    credentialType?: 'password' | 'oauth';
}
//# sourceMappingURL=signaling.d.ts.map