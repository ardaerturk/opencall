import React, { useRef, useEffect } from 'react';
import { Participant } from './VideoGrid';
import styles from './VideoTile.module.css';

interface VideoTileProps {
  participant: Participant;
  onClick?: () => void;
}

export const VideoTile: React.FC<VideoTileProps> = ({
  participant,
  onClick,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && participant.stream) {
      videoRef.current.srcObject = participant.stream;
    }
  }, [participant.stream]);

  const initials = participant.name
    .split(' ')
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const getQualityIndicator = () => {
    switch (participant.connectionQuality) {
      case 'excellent':
        return { icon: '●●●', color: 'var(--color-success)' };
      case 'good':
        return { icon: '●●○', color: 'var(--color-warning)' };
      case 'poor':
        return { icon: '●○○', color: 'var(--color-danger)' };
      default:
        return null;
    }
  };

  const qualityIndicator = getQualityIndicator();

  return (
    <div
      className={`${styles.tileContainer} ${participant.isSpeaking ? styles.speaking : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`${participant.name}'s video`}
    >
      {participant.videoEnabled && participant.stream ? (
        <video
          ref={videoRef}
          className={`${styles.video} ${participant.isLocal ? styles.mirrored : ''}`}
          autoPlay
          playsInline
          muted={participant.isLocal}
        />
      ) : (
        <div className={styles.noVideo}>
          <div className={styles.avatar}>
            <span className={styles.initials}>{initials}</span>
          </div>
        </div>
      )}

      <div className={styles.overlay}>
        <div className={styles.info}>
          <span className={styles.name}>
            {participant.name}
            {participant.isLocal && ' (You)'}
          </span>
          
          <div className={styles.indicators}>
            {!participant.audioEnabled && (
              <span className={styles.mutedIcon} aria-label="Muted">
                🔇
              </span>
            )}
            {qualityIndicator && (
              <span
                className={styles.qualityIcon}
                style={{ color: qualityIndicator.color }}
                aria-label={`Connection: ${participant.connectionQuality}`}
              >
                {qualityIndicator.icon}
              </span>
            )}
          </div>
        </div>
      </div>

      {participant.isSpeaking && (
        <div className={styles.speakingIndicator} aria-label="Speaking" />
      )}
    </div>
  );
};