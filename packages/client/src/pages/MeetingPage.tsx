import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWebRTC } from '../hooks/useWebRTC';
import { useMediaControls } from '../hooks/useMediaControls';
import { useDevices } from '../hooks/useDevices';
import { usePeers } from '../hooks/usePeers';
import { useReconnection } from '../hooks/useReconnection';
import { MeetingLobby, JoinSettings } from '../components/meeting/MeetingLobby';
import { VideoGrid, Participant } from '../components/meeting/VideoGrid';
import { MediaControls } from '../components/meeting/MediaControls';
import { ConnectionStatus, ConnectionQuality } from '../components/meeting/ConnectionStatus';
import { MeetingInfo } from '../components/meeting/MeetingInfo';
import { ErrorBoundary } from '../components/common/ErrorBoundary';
import styles from './MeetingPage.module.css';

export const MeetingPage: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [isInLobby, setIsInLobby] = useState(true);
  const [meetingDuration, setMeetingDuration] = useState(0);
  const [displayName, setDisplayName] = useState('');
  const [screenShareStream, setScreenShareStream] = useState<MediaStream | null>(null);

  // Initialize WebRTC
  const {
    joinRoom,
    leaveRoom,
    initializeMedia,
    localStream,
    meetingState,
    socketConnected,
  } = useWebRTC({
    serverUrl: import.meta.env.VITE_WS_URL || 'ws://localhost:4000/ws',
    enableAudio: true,
    enableVideo: true,
  });

  // Media controls
  const {
    audioEnabled,
    videoEnabled,
    toggleAudio,
    toggleVideo,
  } = useMediaControls();

  // Device management
  const {
    hasPermissions,
    requestPermissions,
  } = useDevices();

  // Peer management
  const { connectedPeers } = usePeers();

  // Reconnection logic
  const { isReconnecting } = useReconnection(null, null, {
    enabled: true,
    onReconnectStart: () => console.log('Reconnecting...'),
    onReconnectSuccess: () => console.log('Reconnected!'),
    onReconnectFail: (error) => console.error('Reconnection failed:', error),
  });

  // Update meeting duration
  useEffect(() => {
    if (!isInLobby && meetingState.type === 'connected') {
      const interval = setInterval(() => {
        setMeetingDuration(prev => prev + 1);
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [isInLobby, meetingState.type]);

  // Convert peers to participants for VideoGrid
  const participants: Participant[] = [
    // Local participant
    ...(localStream ? [{
      id: 'local',
      name: displayName || 'You',
      stream: localStream,
      audioEnabled,
      videoEnabled,
      isLocal: true,
    }] : []),
    // Remote participants
    ...connectedPeers.map(peer => ({
      id: peer.peerId,
      name: peer.metadata?.displayName || `Participant ${peer.peerId.slice(-4)}`,
      stream: peer.remoteStream || undefined,
      audioEnabled: peer.audioEnabled ?? true,
      videoEnabled: peer.videoEnabled ?? true,
      isLocal: false,
    })),
  ];

  const handleJoinMeeting = async (settings: JoinSettings) => {
    try {
      setDisplayName(settings.displayName);
      
      // Check if room ID exists
      if (!roomId) {
        throw new Error('Invalid meeting ID');
      }

      // Check WebSocket connection
      if (!socketConnected) {
        throw new Error('Not connected to server. Please check your internet connection.');
      }
      
      // Check permissions
      if (!hasPermissions) {
        const granted = await requestPermissions();
        if (!granted) {
          throw new Error('Camera and microphone permissions are required');
        }
      }

      // Initialize media with selected devices
      await initializeMedia();

      // Join the room
      await joinRoom(roomId);
      
      setIsInLobby(false);
    } catch (error) {
      console.error('Error joining meeting:', error);
      alert(error instanceof Error ? error.message : 'Failed to join meeting');
    }
  };

  const handleToggleAudio = () => {
    toggleAudio();
  };

  const handleToggleVideo = () => {
    toggleVideo();
  };

  const handleToggleScreenShare = async () => {
    if (!screenShareStream) {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });
        
        setScreenShareStream(stream);

        // Listen for screen share end
        stream.getVideoTracks()[0].onended = () => {
          setScreenShareStream(null);
        };

        // TODO: Replace video track in peer connections
      } catch (error) {
        console.error('Error sharing screen:', error);
      }
    } else {
      screenShareStream.getTracks().forEach(track => track.stop());
      setScreenShareStream(null);
    }
  };

  const handleEndCall = () => {
    leaveRoom();
    navigate('/');
  };

  const handleLobbyCancel = () => {
    navigate('/');
  };

  // Determine connection quality based on state
  const getConnectionQuality = (): ConnectionQuality => {
    if (isReconnecting) return 'poor';
    if (!socketConnected) return 'disconnected';
    if (meetingState.type === 'connecting') return 'connecting';
    if (meetingState.type === 'connected') return 'excellent';
    return 'connecting';
  };

  // Show error state
  if (meetingState.type === 'error') {
    return (
      <ErrorBoundary>
        <div className={styles.errorContainer}>
          <h2>Connection Error</h2>
          <p>{meetingState.error}</p>
          <button onClick={() => navigate('/')}>Return Home</button>
        </div>
      </ErrorBoundary>
    );
  }

  // Show lobby
  if (isInLobby) {
    return (
      <ErrorBoundary>
        <div>
          {!socketConnected && (
            <div className={styles.connectionWarning}>
              Connecting to server...
            </div>
          )}
          <MeetingLobby
            meetingId={roomId || ''}
            onJoin={handleJoinMeeting}
            onCancel={handleLobbyCancel}
          />
        </div>
      </ErrorBoundary>
    );
  }

  // Show meeting room
  return (
    <ErrorBoundary>
      <div className={styles.meetingContainer}>
        <div className={styles.header}>
          <ConnectionStatus 
            quality={getConnectionQuality()} 
            latency={32} 
            showDetails 
          />
          <MeetingInfo
            meetingId={roomId || ''}
            participantCount={participants.length}
            duration={meetingDuration}
          />
        </div>

        <div className={styles.content}>
          <VideoGrid participants={participants} />
        </div>

        <MediaControls
          audioEnabled={audioEnabled}
          videoEnabled={videoEnabled}
          screenShareEnabled={screenShareStream !== null}
          onToggleAudio={handleToggleAudio}
          onToggleVideo={handleToggleVideo}
          onToggleScreenShare={handleToggleScreenShare}
          onEndCall={handleEndCall}
        />
      </div>
    </ErrorBoundary>
  );
};