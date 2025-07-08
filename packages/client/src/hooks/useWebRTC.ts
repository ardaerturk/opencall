import { useEffect, useRef, useCallback } from 'react';
import { useConnectionStore } from '../stores/connectionStore';
import { usePeerStore } from '../stores/peerStore';
import { useMediaStore } from '../stores/mediaStore';
import { WebSocketService, SignalData } from '../services/websocket';
import { PeerConnectionService } from '../services/peerConnection';
import { getUserMedia, stopMediaStream, enumerateDevices } from '../utils/media';

export interface UseWebRTCOptions {
  serverUrl: string;
  enableAudio?: boolean;
  enableVideo?: boolean;
}

export function useWebRTC({ serverUrl, enableAudio = true, enableVideo = true }: UseWebRTCOptions) {
  const wsServiceRef = useRef<WebSocketService | null>(null);
  const peerServiceRef = useRef<PeerConnectionService | null>(null);
  
  const { setMeetingState, setSocketConnected, reset: resetConnection } = useConnectionStore();
  const { setCurrentPeerId, reset: resetPeers } = usePeerStore();
  const { 
    localStream,
    setLocalStream,
    selectedAudioInput,
    selectedVideoInput,
    userPreferences,
    setDevices,
    reset: resetMedia,
  } = useMediaStore();

  // Initialize WebSocket and PeerConnection services
  useEffect(() => {
    wsServiceRef.current = new WebSocketService(serverUrl);
    peerServiceRef.current = new PeerConnectionService(wsServiceRef.current);

    // Set up WebSocket event handlers
    wsServiceRef.current.onConnected(() => {
      setSocketConnected(true);
    });

    wsServiceRef.current.onDisconnected(() => {
      setSocketConnected(false);
      setMeetingState({ type: 'error', error: 'Connection lost' });
    });

    // Connect WebSocket
    wsServiceRef.current.connect().catch((error) => {
      console.error('Failed to connect WebSocket:', error);
      setMeetingState({ type: 'error', error: 'Failed to connect to server' });
    });

    return () => {
      wsServiceRef.current?.disconnect();
    };
  }, [serverUrl, setSocketConnected, setMeetingState]);

  // Set up signaling handlers
  useEffect(() => {
    if (!wsServiceRef.current || !peerServiceRef.current) return;

    const unsubscribers: (() => void)[] = [];

    // Handle peer joining
    unsubscribers.push(
      wsServiceRef.current.on('peer-joined', (data: SignalData) => {
        if (data.peerId && data.metadata) {
          console.log(`Peer joined: ${data.peerId}`);
          // Auto-connect to new peer
          peerServiceRef.current!.connectToPeer(data.peerId, data.metadata);
        }
      })
    );

    // Handle peer leaving
    unsubscribers.push(
      wsServiceRef.current.on('peer-left', (data: SignalData) => {
        if (data.peerId) {
          console.log(`Peer left: ${data.peerId}`);
          peerServiceRef.current!.disconnectFromPeer(data.peerId);
        }
      })
    );

    // Handle offers
    unsubscribers.push(
      wsServiceRef.current.on('offer', (data: SignalData) => {
        peerServiceRef.current!.handleSignal(data);
      })
    );

    // Handle answers
    unsubscribers.push(
      wsServiceRef.current.on('answer', (data: SignalData) => {
        peerServiceRef.current!.handleSignal(data);
      })
    );

    // Handle ICE candidates
    unsubscribers.push(
      wsServiceRef.current.on('ice-candidate', (data: SignalData) => {
        peerServiceRef.current!.handleSignal(data);
      })
    );

    // Handle errors
    unsubscribers.push(
      wsServiceRef.current.on('error', (data: SignalData) => {
        console.error('Signaling error:', data.error);
        setMeetingState({ type: 'error', error: data.error || 'Unknown error' });
      })
    );

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [setMeetingState]);

  // Initialize local media stream
  const initializeMedia = useCallback(async () => {
    try {
      // First enumerate devices
      const devices = await enumerateDevices();
      setDevices(devices);

      // Get user media
      const selectedDevices: { audioInput?: string; videoInput?: string } = {};
      if (selectedAudioInput) selectedDevices.audioInput = selectedAudioInput;
      if (selectedVideoInput) selectedDevices.videoInput = selectedVideoInput;
      
      const stream = await getUserMedia(
        { audio: enableAudio, video: enableVideo },
        userPreferences,
        selectedDevices
      );
      
      setLocalStream(stream);
      
      // Update existing peer connections with new stream
      if (peerServiceRef.current) {
        peerServiceRef.current.updateLocalStream(stream);
      }
      
      return stream;
    } catch (error) {
      console.error('Failed to initialize media:', error);
      setMeetingState({ type: 'error', error: 'Failed to access camera/microphone' });
      throw error;
    }
  }, [
    enableAudio,
    enableVideo,
    selectedAudioInput,
    selectedVideoInput,
    userPreferences,
    setLocalStream,
    setDevices,
    setMeetingState,
  ]);

  // Join a room
  const joinRoom = useCallback(async (roomId: string) => {
    if (!wsServiceRef.current || !peerServiceRef.current) {
      throw new Error('Services not initialized');
    }

    try {
      setMeetingState({ type: 'connecting', meetingId: roomId });
      
      // Initialize media if not already done
      if (!localStream) {
        await initializeMedia();
      }
      
      // Set room ID in peer service
      peerServiceRef.current.setRoomId(roomId);
      
      // Generate a peer ID (in production, this might come from the server)
      const peerId = `peer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      setCurrentPeerId(peerId);
      
      // Send join room signal
      wsServiceRef.current.send({
        type: 'join-room',
        roomId,
        peerId,
        metadata: {
          // Add user metadata here if available
        },
      });
      
      // Update meeting state to connected
      setMeetingState({
        type: 'connected',
        meetingId: roomId,
        peers: [],
        encryptionState: 'ready', // Simplified for now
      });
    } catch (error) {
      console.error('Failed to join room:', error);
      setMeetingState({ type: 'error', error: 'Failed to join room' });
      throw error;
    }
  }, [localStream, initializeMedia, setMeetingState, setCurrentPeerId]);

  // Leave the current room
  const leaveRoom = useCallback(() => {
    if (!wsServiceRef.current || !peerServiceRef.current) return;

    const meetingState = useConnectionStore.getState().meetingState;
    if (meetingState.type === 'connected' || meetingState.type === 'connecting') {
      // Send leave room signal
      wsServiceRef.current.send({
        type: 'leave-room',
        roomId: meetingState.meetingId,
      });
      
      // Disconnect all peers
      peerServiceRef.current.disconnectAll();
      
      // Reset state
      setMeetingState({ type: 'idle' });
    }
  }, [setMeetingState]);

  // Update media stream (e.g., when switching devices)
  const updateMediaStream = useCallback(async () => {
    if (!localStream) return;
    
    // Stop current stream
    stopMediaStream(localStream);
    
    // Get new stream
    const newStream = await initializeMedia();
    
    return newStream;
  }, [localStream, initializeMedia]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Leave room if connected
      leaveRoom();
      
      // Stop local stream
      if (localStream) {
        stopMediaStream(localStream);
      }
      
      // Reset all stores
      resetConnection();
      resetPeers();
      resetMedia();
    };
  }, []);

  return {
    // Actions
    joinRoom,
    leaveRoom,
    initializeMedia,
    updateMediaStream,
    
    // State
    localStream,
    peers: usePeerStore((state) => state.peers),
    meetingState: useConnectionStore((state) => state.meetingState),
    socketConnected: useConnectionStore((state) => state.socketConnected),
  };
}