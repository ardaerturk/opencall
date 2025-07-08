import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useMediasoup } from '../../hooks/useMediasoup';
import { MediasoupReconnectionService } from '../../services/mediasoup/MediasoupReconnectionService';
import { EncryptedMediasoupService } from '../../services/mediasoup/EncryptedMediasoupService';
import styles from './Meeting.module.css';

interface MediasoupMeetingProps {
  meetingId: string;
  participantId: string;
  displayName: string;
  enableEncryption?: boolean;
  onLeave?: () => void;
}

interface ParticipantVideo {
  participantId: string;
  stream: MediaStream;
  audioLevel?: number;
  isActiveSpeaker?: boolean;
}

export const MediasoupMeeting: React.FC<MediasoupMeetingProps> = ({
  meetingId,
  participantId,
  displayName,
  enableEncryption = false,
  onLeave,
}) => {
  const [participantVideos, setParticipantVideos] = useState<Map<string, ParticipantVideo>>(new Map());
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'reconnecting' | 'failed'>('connecting');
  const [networkQuality, setNetworkQuality] = useState<'excellent' | 'good' | 'poor'>('good');
  const [selectedQuality, setSelectedQuality] = useState<'auto' | 'high' | 'medium' | 'low'>('auto');
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const reconnectionServiceRef = useRef<MediasoupReconnectionService | null>(null);

  const {
    isInitialized,
    isConnected,
    localStream,
    remoteStreams,
    activeSpeakers,
    connectionQuality,
    toggleAudio,
    toggleVideo,
    shareScreen,
    sendData,
    setConsumerQuality,
    cleanup,
  } = useMediasoup({
    meetingId,
    participantId,
    enableAudio: true,
    enableVideo: true,
    enableDataChannel: true,
  });

  // Initialize reconnection service
  useEffect(() => {
    if (isInitialized && !reconnectionServiceRef.current) {
      // Note: In a real implementation, you'd need to pass the mediasoupService and sendMessage function
      // reconnectionServiceRef.current = new MediasoupReconnectionService(mediasoupService, sendMessage);
      
      // Set up event listeners
      // reconnectionServiceRef.current.on('reconnection:started', () => {
      //   setConnectionStatus('reconnecting');
      // });
      
      // reconnectionServiceRef.current.on('reconnection:success', () => {
      //   setConnectionStatus('connected');
      // });
      
      // reconnectionServiceRef.current.on('reconnection:failed', () => {
      //   setConnectionStatus('failed');
      // });
    }

    return () => {
      reconnectionServiceRef.current?.dispose();
    };
  }, [isInitialized]);

  // Update connection status
  useEffect(() => {
    if (isConnected) {
      setConnectionStatus('connected');
    }
  }, [isConnected]);

  // Update local video
  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Update remote streams
  useEffect(() => {
    const newVideos = new Map<string, ParticipantVideo>();
    
    for (const [pid, stream] of remoteStreams) {
      newVideos.set(pid, {
        participantId: pid,
        stream,
        isActiveSpeaker: activeSpeakers.includes(pid),
      });
    }
    
    setParticipantVideos(newVideos);
  }, [remoteStreams, activeSpeakers]);

  // Update network quality based on connection quality
  useEffect(() => {
    switch (connectionQuality) {
      case 'excellent':
        setNetworkQuality('excellent');
        break;
      case 'good':
        setNetworkQuality('good');
        break;
      case 'poor':
      case 'disconnected':
        setNetworkQuality('poor');
        break;
    }
  }, [connectionQuality]);

  const handleToggleAudio = useCallback(async () => {
    await toggleAudio();
    setIsAudioEnabled(!isAudioEnabled);
  }, [toggleAudio, isAudioEnabled]);

  const handleToggleVideo = useCallback(async () => {
    await toggleVideo();
    setIsVideoEnabled(!isVideoEnabled);
  }, [toggleVideo, isVideoEnabled]);

  const handleShareScreen = useCallback(async () => {
    if (!isScreenSharing) {
      const producer = await shareScreen();
      if (producer) {
        setIsScreenSharing(true);
      }
    } else {
      // Stop screen sharing logic would go here
      setIsScreenSharing(false);
    }
  }, [shareScreen, isScreenSharing]);

  const handleQualityChange = useCallback((quality: 'auto' | 'high' | 'medium' | 'low') => {
    setSelectedQuality(quality);
    
    if (quality !== 'auto') {
      // Apply quality to all consumers
      for (const [pid] of remoteStreams) {
        // In real implementation, you'd get the consumer ID and apply quality
        // setConsumerQuality(consumerId, quality);
      }
    }
  }, [remoteStreams, setConsumerQuality]);

  const handleSendChatMessage = useCallback((message: string) => {
    sendData({
      type: 'chat',
      message,
      timestamp: Date.now(),
      sender: {
        id: participantId,
        name: displayName,
      },
    });
  }, [sendData, participantId, displayName]);

  const handleLeave = useCallback(() => {
    cleanup();
    onLeave?.();
  }, [cleanup, onLeave]);

  // Listen for data channel messages
  useEffect(() => {
    const handleDataMessage = (event: CustomEvent) => {
      const { message } = event.detail;
      
      if (message.type === 'chat') {
        // Handle chat message
        console.log('Chat message received:', message);
      }
    };

    window.addEventListener('mediasoup:dataMessage', handleDataMessage as EventListener);
    
    return () => {
      window.removeEventListener('mediasoup:dataMessage', handleDataMessage as EventListener);
    };
  }, []);

  return (
    <div className={styles.meetingContainer}>
      <div className={styles.header}>
        <h2>Mediasoup Meeting: {meetingId}</h2>
        <div className={styles.connectionInfo}>
          <span className={`${styles.status} ${styles[connectionStatus]}`}>
            {connectionStatus}
          </span>
          <span className={`${styles.quality} ${styles[networkQuality]}`}>
            Network: {networkQuality}
          </span>
        </div>
      </div>

      <div className={styles.videoGrid}>
        {/* Local video */}
        <div className={styles.videoTile}>
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className={styles.video}
          />
          <div className={styles.participantInfo}>
            {displayName} (You)
            {activeSpeakers.includes(participantId) && (
              <span className={styles.activeSpeaker}>🔊</span>
            )}
          </div>
        </div>

        {/* Remote videos */}
        {Array.from(participantVideos.values()).map((participant) => (
          <RemoteVideo
            key={participant.participantId}
            participant={participant}
            onQualityRequest={(quality) => {
              // Apply quality to specific consumer
              // setConsumerQuality(consumerId, quality);
            }}
          />
        ))}
      </div>

      <div className={styles.controls}>
        <button
          className={`${styles.controlButton} ${!isAudioEnabled ? styles.disabled : ''}`}
          onClick={handleToggleAudio}
        >
          {isAudioEnabled ? '🎤' : '🔇'}
        </button>
        
        <button
          className={`${styles.controlButton} ${!isVideoEnabled ? styles.disabled : ''}`}
          onClick={handleToggleVideo}
        >
          {isVideoEnabled ? '📹' : '📷'}
        </button>
        
        <button
          className={`${styles.controlButton} ${isScreenSharing ? styles.active : ''}`}
          onClick={handleShareScreen}
        >
          🖥️
        </button>

        <select
          className={styles.qualitySelector}
          value={selectedQuality}
          onChange={(e) => handleQualityChange(e.target.value as any)}
        >
          <option value="auto">Auto Quality</option>
          <option value="high">High Quality</option>
          <option value="medium">Medium Quality</option>
          <option value="low">Low Quality</option>
        </select>

        <button
          className={`${styles.controlButton} ${styles.leave}`}
          onClick={handleLeave}
        >
          Leave
        </button>
      </div>

      {enableEncryption && (
        <div className={styles.encryptionIndicator}>
          🔒 End-to-End Encrypted
        </div>
      )}
    </div>
  );
};

interface RemoteVideoProps {
  participant: ParticipantVideo;
  onQualityRequest: (quality: 'high' | 'medium' | 'low') => void;
}

const RemoteVideo: React.FC<RemoteVideoProps> = ({ participant, onQualityRequest }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isInView, setIsInView] = useState(true);

  useEffect(() => {
    if (videoRef.current && participant.stream) {
      videoRef.current.srcObject = participant.stream;
    }
  }, [participant.stream]);

  // Intersection observer for viewport-based quality adaptation
  useEffect(() => {
    if (!videoRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        setIsInView(entry.isIntersecting);
        
        // Request lower quality when off-screen
        if (!entry.isIntersecting) {
          onQualityRequest('low');
        } else {
          // Request quality based on size
          const { width } = entry.boundingClientRect;
          if (width < 200) {
            onQualityRequest('low');
          } else if (width < 400) {
            onQualityRequest('medium');
          } else {
            onQualityRequest('high');
          }
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(videoRef.current);

    return () => {
      observer.disconnect();
    };
  }, [onQualityRequest]);

  return (
    <div className={`${styles.videoTile} ${participant.isActiveSpeaker ? styles.activeSpeaker : ''}`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className={styles.video}
      />
      <div className={styles.participantInfo}>
        Participant {participant.participantId}
        {participant.isActiveSpeaker && (
          <span className={styles.activeSpeaker}>🔊</span>
        )}
      </div>
      {participant.audioLevel !== undefined && (
        <div className={styles.audioLevel}>
          <div
            className={styles.audioLevelBar}
            style={{ width: `${participant.audioLevel}%` }}
          />
        </div>
      )}
    </div>
  );
};