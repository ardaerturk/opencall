import { useEffect, useRef, useState, useCallback } from 'react';
import { HybridConnectionService, ConnectionMode, ConnectionQualityMetrics } from '../services/hybridConnection';
import { WebSocketService } from '../services/websocket';
import { useConnectionStore } from '../stores/connectionStore';
import { usePeerStore } from '../stores/peerStore';
import { useMediaStore } from '../stores/mediaStore';

export interface UseHybridConnectionOptions {
  serverUrl: string;
  enableAudio?: boolean;
  enableVideo?: boolean;
}

export interface UseHybridConnectionReturn {
  // Connection state
  mode: ConnectionMode;
  isTransitioning: boolean;
  quality: ConnectionQualityMetrics | null;
  
  // Actions
  joinRoom: (roomId: string) => Promise<void>;
  leaveRoom: () => void;
  initializeMedia: () => Promise<MediaStream>;
  updateMediaStream: (stream: MediaStream) => Promise<void>;
  
  // Stream management
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  
  // Connection info
  participantCount: number;
  socketConnected: boolean;
  meetingState: any;
}

export function useHybridConnection({
  serverUrl,
  enableAudio = true,
  enableVideo = true,
}: UseHybridConnectionOptions): UseHybridConnectionReturn {
  const [mode, setMode] = useState<ConnectionMode>('p2p');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [quality, setQuality] = useState<ConnectionQualityMetrics | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  
  const wsServiceRef = useRef<WebSocketService | null>(null);
  const hybridServiceRef = useRef<HybridConnectionService | null>(null);
  
  const { setMeetingState, setSocketConnected, meetingState, socketConnected } = useConnectionStore();
  const { setCurrentPeerId } = usePeerStore();
  const { localStream, setLocalStream } = useMediaStore();

  // Initialize services
  useEffect(() => {
    wsServiceRef.current = new WebSocketService(serverUrl);
    hybridServiceRef.current = new HybridConnectionService(wsServiceRef.current);

    // Set up WebSocket handlers
    wsServiceRef.current.onConnected(() => {
      setSocketConnected(true);
    });

    wsServiceRef.current.onDisconnected(() => {
      setSocketConnected(false);
      setMeetingState({ type: 'error', error: 'Connection lost' });
    });

    // Set up hybrid connection handlers
    hybridServiceRef.current.on('mode-changed', (newMode: ConnectionMode) => {
      setMode(newMode);
    });

    hybridServiceRef.current.on('transition-started', () => {
      setIsTransitioning(true);
    });

    hybridServiceRef.current.on('transition-completed', () => {
      setIsTransitioning(false);
    });

    hybridServiceRef.current.on('transition-failed', (error) => {
      setIsTransitioning(false);
      console.error('Mode transition failed:', error);
    });

    hybridServiceRef.current.on('quality-update', (metrics: ConnectionQualityMetrics) => {
      setQuality(metrics);
    });

    hybridServiceRef.current.on('stream-added', ({ peerId, stream }) => {
      setRemoteStreams(prev => {
        const newStreams = new Map(prev);
        newStreams.set(peerId, stream);
        return newStreams;
      });
    });

    hybridServiceRef.current.on('stream-removed', ({ peerId }) => {
      setRemoteStreams(prev => {
        const newStreams = new Map(prev);
        newStreams.delete(peerId);
        return newStreams;
      });
    });

    // Connect WebSocket
    wsServiceRef.current.connect().catch((error) => {
      console.error('Failed to connect WebSocket:', error);
      setMeetingState({ type: 'error', error: 'Failed to connect to server' });
    });

    return () => {
      hybridServiceRef.current?.destroy();
      wsServiceRef.current?.disconnect();
    };
  }, [serverUrl, setSocketConnected, setMeetingState]);

  // Initialize media
  const initializeMedia = useCallback(async (): Promise<MediaStream> => {
    try {
      const constraints: MediaStreamConstraints = {
        audio: enableAudio,
        video: enableVideo,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setLocalStream(stream);
      
      if (hybridServiceRef.current) {
        await hybridServiceRef.current.setLocalStream(stream);
      }
      
      return stream;
    } catch (error) {
      console.error('Failed to initialize media:', error);
      setMeetingState({ type: 'error', error: 'Failed to access camera/microphone' });
      throw error;
    }
  }, [enableAudio, enableVideo, setLocalStream, setMeetingState]);

  // Join room
  const joinRoom = useCallback(async (roomId: string) => {
    if (!wsServiceRef.current || !hybridServiceRef.current) {
      throw new Error('Services not initialized');
    }

    try {
      setMeetingState({ type: 'connecting', meetingId: roomId });
      
      // Initialize media if not already done
      if (!localStream) {
        await initializeMedia();
      }
      
      // Generate peer ID
      const peerId = `peer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      setCurrentPeerId(peerId);
      
      // Store for hybrid service
      (window as any).__currentRoomId = roomId;
      (window as any).__localPeerId = peerId;
      
      // Send join room signal
      wsServiceRef.current.send({
        type: 'join-room',
        roomId,
        peerId,
        displayName: 'User', // You can make this configurable
        mediaState: {
          audio: localStream?.getAudioTracks()[0]?.enabled ?? false,
          video: localStream?.getVideoTracks()[0]?.enabled ?? false,
          screen: false,
        },
        timestamp: Date.now(),
      });
      
      setMeetingState({
        type: 'connected',
        meetingId: roomId,
        peers: [],
        encryptionState: 'ready',
      });
    } catch (error) {
      console.error('Failed to join room:', error);
      setMeetingState({ type: 'error', error: 'Failed to join room' });
      throw error;
    }
  }, [localStream, initializeMedia, setMeetingState, setCurrentPeerId]);

  // Leave room
  const leaveRoom = useCallback(() => {
    if (!wsServiceRef.current || !hybridServiceRef.current) return;

    const state = useConnectionStore.getState().meetingState;
    if (state.type === 'connected' || state.type === 'connecting') {
      wsServiceRef.current.send({
        type: 'leave-room',
        roomId: state.meetingId,
        peerId: (window as any).__localPeerId,
        timestamp: Date.now(),
      });
      
      hybridServiceRef.current.destroy();
      setMeetingState({ type: 'idle' });
      setRemoteStreams(new Map());
      
      // Clean up
      delete (window as any).__currentRoomId;
      delete (window as any).__localPeerId;
    }
  }, [setMeetingState]);

  // Update media stream
  const updateMediaStream = useCallback(async (stream: MediaStream) => {
    if (hybridServiceRef.current) {
      await hybridServiceRef.current.setLocalStream(stream);
    }
    setLocalStream(stream);
  }, [setLocalStream]);

  // Calculate participant count
  const participantCount = remoteStreams.size + 1; // +1 for local participant

  return {
    // Connection state
    mode,
    isTransitioning,
    quality,
    
    // Actions
    joinRoom,
    leaveRoom,
    initializeMedia,
    updateMediaStream,
    
    // Stream management
    localStream,
    remoteStreams,
    
    // Connection info
    participantCount,
    socketConnected,
    meetingState,
  };
}