import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { MeetingLobby, JoinSettings } from './MeetingLobby';
import { VideoGrid, Participant } from './VideoGrid';
import { MediaControls } from './MediaControls';
import { ConnectionStatus, ConnectionQuality } from './ConnectionStatus';
import { MeetingInfo } from './MeetingInfo';
import { HybridConnectionIndicator } from './HybridConnectionIndicator';
import { CollaborationSidebar } from '../collaboration';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { useHybridConnection } from '../../hooks/useHybridConnection';
import { mlsEncryptionService } from '../../services/encryption/MLSEncryptionService';
import styles from './Meeting.module.css';

interface EnhancedMeetingProps {
  meetingId: string;
}

export const EnhancedMeeting: React.FC<EnhancedMeetingProps> = ({ meetingId }) => {
  const [isInLobby, setIsInLobby] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [screenShareEnabled, setScreenShareEnabled] = useState(false);
  const [meetingDuration, setMeetingDuration] = useState(0);
  const [displayName, setDisplayName] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [dataChannel, setDataChannel] = useState<RTCDataChannel | null>(null);

  // Use hybrid connection hook
  const {
    mode,
    isTransitioning,
    quality,
    joinRoom,
    leaveRoom,
    initializeMedia,
    localStream,
    remoteStreams,
    participantCount,
    socketConnected,
    meetingState,
  } = useHybridConnection({
    serverUrl: import.meta.env.VITE_WS_URL || 'ws://localhost:8080',
    enableAudio: audioEnabled,
    enableVideo: videoEnabled,
  });

  // Initialize MLS encryption service when joining meeting
  useEffect(() => {
    if (!isInLobby && displayName) {
      initializeMLS();
    }
  }, [isInLobby, displayName]);

  const initializeMLS = async () => {
    try {
      // Initialize MLS with user ID (could be enhanced with proper auth)
      const userId = `user-${Math.random().toString(36).substr(2, 9)}`;
      await mlsEncryptionService.initialize(userId);
      
      // Create or join MLS group for this meeting
      const existingGroup = mlsEncryptionService.getGroup(meetingId);
      if (!existingGroup) {
        await mlsEncryptionService.createGroup(meetingId);
      }
    } catch (error) {
      console.error('Failed to initialize MLS:', error);
    }
  };

  // Update meeting duration every second
  useEffect(() => {
    if (!isInLobby && meetingState.type === 'connected') {
      const interval = setInterval(() => {
        setMeetingDuration(prev => prev + 1);
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [isInLobby, meetingState.type]);

  // Convert streams to participants
  const participants = useMemo<Participant[]>(() => {
    const participantList: Participant[] = [];
    
    // Add local participant
    if (localStream) {
      participantList.push({
        id: 'local',
        name: displayName || 'You',
        stream: localStream,
        audioEnabled,
        videoEnabled,
        isLocal: true,
      });
    }
    
    // Add remote participants
    remoteStreams.forEach((stream, peerId) => {
      participantList.push({
        id: peerId,
        name: `Participant ${peerId.slice(0, 4)}`,
        stream,
        audioEnabled: stream.getAudioTracks().some(track => track.enabled),
        videoEnabled: stream.getVideoTracks().some(track => track.enabled),
        isLocal: false,
      });
    });
    
    return participantList;
  }, [localStream, remoteStreams, audioEnabled, videoEnabled, displayName]);

  // Determine connection quality based on hybrid metrics
  const connectionQuality = useMemo<ConnectionQuality>(() => {
    if (!socketConnected || meetingState.type === 'connecting') return 'connecting';
    if (!quality) return 'good';
    
    const { packetLoss, rtt } = quality;
    if (packetLoss > 5 || rtt > 200) return 'poor';
    if (packetLoss > 2 || rtt > 100) return 'good';
    return 'excellent';
  }, [socketConnected, meetingState.type, quality]);

  const handleJoinMeeting = async (settings: JoinSettings) => {
    try {
      setDisplayName(settings.displayName);
      setAudioEnabled(settings.audioEnabled);
      setVideoEnabled(settings.videoEnabled);
      
      // Initialize media with device selection
      await initializeMedia();
      
      // Join the room
      await joinRoom(meetingId);
      
      setIsInLobby(false);
    } catch (error) {
      console.error('Error joining meeting:', error);
    }
  };

  const handleToggleAudio = () => {
    if (localStream) {
      const audioTracks = localStream.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = !audioEnabled;
      });
      setAudioEnabled(!audioEnabled);
    }
  };

  const handleToggleVideo = () => {
    if (localStream) {
      const videoTracks = localStream.getVideoTracks();
      videoTracks.forEach(track => {
        track.enabled = !videoEnabled;
      });
      setVideoEnabled(!videoEnabled);
    }
  };

  const handleToggleScreenShare = async () => {
    if (!screenShareEnabled) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });
        
        // TODO: Replace video track with screen share
        setScreenShareEnabled(true);

        screenStream.getVideoTracks()[0].onended = () => {
          setScreenShareEnabled(false);
        };
      } catch (error) {
        console.error('Error sharing screen:', error);
      }
    } else {
      // TODO: Stop screen share
      setScreenShareEnabled(false);
    }
  };

  const handleEndCall = () => {
    leaveRoom();
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    if (dataChannel) {
      dataChannel.close();
      setDataChannel(null);
    }
    mlsEncryptionService.cleanup();
    setIsInLobby(true);
    setMeetingDuration(0);
  };

  const handleToggleSidebar = useCallback((isOpen: boolean) => {
    setSidebarOpen(isOpen);
  }, []);

  // Set up data channel when peer connection is established
  useEffect(() => {
    // This would be integrated with your WebRTC peer connection setup
    // For now, it's a placeholder
    const setupDataChannel = () => {
      // When creating peer connection, create data channel
      // pc.createDataChannel('collaboration', { ordered: true });
      // Or handle incoming data channel
      // pc.ondatachannel = (event) => { setDataChannel(event.channel); };
    };
  }, []);

  if (isInLobby) {
    return (
      <ErrorBoundary>
        <MeetingLobby
          meetingId={meetingId}
          onJoin={handleJoinMeeting}
          onCancel={() => window.history.back()}
        />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div className={`${styles.meetingContainer} ${sidebarOpen ? styles.withSidebar : ''}`}>
        <div className={styles.mainContent}>
          <div className={styles.header}>
            <ConnectionStatus quality={connectionQuality} latency={quality?.rtt || 0} showDetails />
            <MeetingInfo
              meetingId={meetingId}
              participantCount={participants.length}
              duration={meetingDuration}
            />
            <HybridConnectionIndicator
              mode={mode}
              isTransitioning={isTransitioning}
              quality={quality}
              participantCount={participantCount}
            />
          </div>

          <div className={styles.content}>
            <VideoGrid participants={participants} />
          </div>

          <MediaControls
            audioEnabled={audioEnabled}
            videoEnabled={videoEnabled}
            screenShareEnabled={screenShareEnabled}
            onToggleAudio={handleToggleAudio}
            onToggleVideo={handleToggleVideo}
            onToggleScreenShare={handleToggleScreenShare}
            onEndCall={handleEndCall}
          />
        </div>

        <CollaborationSidebar
          roomId={meetingId}
          currentUserId={mlsEncryptionService.getClientId()}
          currentUserName={displayName}
          mlsService={mlsEncryptionService}
          dataChannel={dataChannel || undefined}
          isOpen={sidebarOpen}
          onToggle={handleToggleSidebar}
        />
      </div>
    </ErrorBoundary>
  );
};