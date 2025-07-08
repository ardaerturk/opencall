export interface PeerConnection {
  id: string;
  peerId: string;
  connectionState: RTCPeerConnectionState;
  iceConnectionState: RTCIceConnectionState;
  signalingState: RTCSignalingState;
  localDescription?: RTCSessionDescriptionInit;
  remoteDescription?: RTCSessionDescriptionInit;
  createdAt: Date;
  stats?: ConnectionStats;
}

export interface ConnectionStats {
  bytesReceived: number;
  bytesSent: number;
  packetsLost: number;
  jitter: number;
  roundTripTime: number;
  availableOutgoingBitrate?: number;
  availableIncomingBitrate?: number;
}

export interface MediaTrack {
  id: string;
  kind: 'audio' | 'video';
  enabled: boolean;
  muted: boolean;
  settings?: MediaTrackSettings;
}

export interface ParticipantMedia {
  participantId: string;
  audioTrack?: MediaTrack;
  videoTrack?: MediaTrack;
  screenTrack?: MediaTrack;
}

// Define RTCIceCredentialType if not available in the environment
type RTCIceCredentialType = 'password' | 'oauth';

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
  credentialType?: RTCIceCredentialType;
}

export interface ConnectionConfig {
  iceServers: IceServer[];
  iceTransportPolicy?: RTCIceTransportPolicy;
  bundlePolicy?: RTCBundlePolicy;
  rtcpMuxPolicy?: RTCRtcpMuxPolicy;
  maxBitrate?: number;
}
