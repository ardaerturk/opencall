import React, { useState, useRef, useEffect } from 'react';
import { Button } from '../../common/Button';
import { useMediaDevices } from '../../../hooks/useMediaDevices';
import { DeviceSelector } from './DeviceSelector';
import { VideoPreview } from './VideoPreview';
import { AuthModal } from '../../auth';
import { useAuth } from '../../../hooks/useAuth';
import styles from './MeetingLobby.module.css';

interface MeetingLobbyProps {
  meetingId: string;
  onJoin: (settings: JoinSettings) => void;
  onCancel: () => void;
}

export interface JoinSettings {
  displayName: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
  selectedDevices: {
    audioInput?: string;
    audioOutput?: string;
    videoInput?: string;
  };
}

export const MeetingLobby: React.FC<MeetingLobbyProps> = ({
  meetingId,
  onJoin,
  onCancel,
}) => {
  const [displayName, setDisplayName] = useState('');
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [showDeviceSelector, setShowDeviceSelector] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  
  const { isAuthenticated, identity } = useAuth();

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const {
    devices,
    selectedDevices,
    selectDevice,
    hasPermissions,
    requestPermissions,
  } = useMediaDevices();

  useEffect(() => {
    // Request permissions on mount
    if (!hasPermissions.audio || !hasPermissions.video) {
      requestPermissions();
    }
  }, [hasPermissions, requestPermissions]);

  useEffect(() => {
    // Pre-fill display name with authenticated identity
    if (isAuthenticated && identity && !displayName) {
      setDisplayName(identity);
    }
  }, [isAuthenticated, identity, displayName]);

  useEffect(() => {
    // Update video preview when settings change
    const updateVideoPreview = async () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      if (videoEnabled && selectedDevices.videoInput) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: selectedDevices.videoInput },
            audio: false,
          });
          
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
          streamRef.current = stream;
        } catch (error) {
          console.error('Error accessing video:', error);
        }
      }
    };

    updateVideoPreview();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [videoEnabled, selectedDevices.videoInput]);

  const handleJoin = () => {
    if (!displayName.trim()) {
      return;
    }

    setIsJoining(true);
    onJoin({
      displayName: displayName.trim(),
      audioEnabled,
      videoEnabled,
      selectedDevices,
    });
  };

  const isFormValid = displayName.trim().length > 0;

  return (
    <div className={styles.lobbyContainer}>
      <div className={styles.lobbyContent}>
        <div className={styles.header}>
          <h1 className={styles.title}>Join Meeting</h1>
          <p className={styles.meetingId}>Meeting ID: {meetingId}</p>
        </div>

        <div className={styles.mainContent}>
          <VideoPreview
            videoRef={videoRef}
            videoEnabled={videoEnabled}
            displayName={displayName || 'Your Name'}
          />

          <div className={styles.controls}>
            {/* Authentication status */}
            <div className={styles.authStatus}>
              {isAuthenticated ? (
                <div className={styles.authenticated}>
                  <span className={styles.authIcon}>✓</span>
                  <span>Logged in as <strong>{identity}</strong></span>
                </div>
              ) : (
                <div className={styles.anonymous}>
                  <span className={styles.authIcon}>👤</span>
                  <span>Joining as guest</span>
                  <button 
                    className={styles.loginButton}
                    onClick={() => setShowAuthModal(true)}
                  >
                    Login for premium features
                  </button>
                </div>
              )}
            </div>
            <div className={styles.nameInput}>
              <label htmlFor="displayName" className={styles.label}>
                Your Name
              </label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter your name"
                className={styles.input}
                maxLength={50}
                autoFocus
              />
            </div>

            <div className={styles.mediaControls}>
              <button
                className={`${styles.mediaToggle} ${!audioEnabled && styles.disabled}`}
                onClick={() => setAudioEnabled(!audioEnabled)}
                aria-label={audioEnabled ? 'Disable microphone' : 'Enable microphone'}
              >
                <span className={styles.mediaIcon}>
                  {audioEnabled ? '🎤' : '🔇'}
                </span>
                <span className={styles.mediaLabel}>
                  {audioEnabled ? 'Mic On' : 'Mic Off'}
                </span>
              </button>

              <button
                className={`${styles.mediaToggle} ${!videoEnabled && styles.disabled}`}
                onClick={() => setVideoEnabled(!videoEnabled)}
                aria-label={videoEnabled ? 'Disable camera' : 'Enable camera'}
              >
                <span className={styles.mediaIcon}>
                  {videoEnabled ? '📹' : '📷'}
                </span>
                <span className={styles.mediaLabel}>
                  {videoEnabled ? 'Camera On' : 'Camera Off'}
                </span>
              </button>

              <button
                className={styles.settingsButton}
                onClick={() => setShowDeviceSelector(!showDeviceSelector)}
                aria-label="Device settings"
              >
                <span className={styles.mediaIcon}>⚙️</span>
                <span className={styles.mediaLabel}>Settings</span>
              </button>
            </div>

            {showDeviceSelector && (
              <DeviceSelector
                devices={devices}
                selectedDevices={selectedDevices}
                onSelectDevice={selectDevice}
                onClose={() => setShowDeviceSelector(false)}
              />
            )}

            <div className={styles.actions}>
              <Button
                variant="secondary"
                onClick={onCancel}
                disabled={isJoining}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleJoin}
                disabled={!isFormValid || isJoining}
                loading={isJoining}
              >
                Join Meeting
              </Button>
            </div>
          </div>
        </div>
      </div>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={() => setShowAuthModal(false)}
      />
    </div>
  );
};