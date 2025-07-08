import React, { useState, useEffect, useMemo } from 'react';
import { MeetingLobby, JoinSettings } from './MeetingLobby';
import { VideoGrid, Participant } from './VideoGrid';
import { MediaControls } from './MediaControls';
import { ConnectionStatus, ConnectionQuality } from './ConnectionStatus';
import { MeetingInfo } from './MeetingInfo';
import { HybridConnectionIndicator } from './HybridConnectionIndicator';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { useHybridConnection } from '../../hooks/useHybridConnection';
import styles from './Meeting.module.css';

interface MeetingProps {
  meetingId: string;
}

export const Meeting: React.FC<MeetingProps> = ({ meetingId }) => {
  const [isInLobby, setIsInLobby] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [screenShareEnabled, setScreenShareEnabled] = useState(false);
  const [meetingDuration, setMeetingDuration] = useState(0);
  const [displayName, setDisplayName] = useState('');

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
        name: `Participant ${peerId.slice(0, 4)}`, // You can enhance this with actual names
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

      // Update local participant
      setParticipants(prev =>
        prev.map(p =>
          p.isLocal ? { ...p, audioEnabled: !audioEnabled } : p
        )
      );
    }
  };

  const handleToggleVideo = () => {
    if (localStream) {
      const videoTracks = localStream.getVideoTracks();
      videoTracks.forEach(track => {
        track.enabled = !videoEnabled;
      });
      setVideoEnabled(!videoEnabled);

      // Update local participant
      setParticipants(prev =>
        prev.map(p =>
          p.isLocal ? { ...p, videoEnabled: !videoEnabled } : p
        )
      );
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
    setIsInLobby(true);
    setMeetingDuration(0);
  };

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
      <div className={styles.meetingContainer}>
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
    </ErrorBoundary>
  );
};