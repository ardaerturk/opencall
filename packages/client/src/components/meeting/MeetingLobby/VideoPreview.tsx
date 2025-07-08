import React from 'react';
import styles from './VideoPreview.module.css';

interface VideoPreviewProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  videoEnabled: boolean;
  displayName: string;
}

export const VideoPreview: React.FC<VideoPreviewProps> = ({
  videoRef,
  videoEnabled,
  displayName,
}) => {
  const initials = displayName
    .split(' ')
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className={styles.previewContainer}>
      {videoEnabled ? (
        <video
          ref={videoRef}
          className={styles.video}
          autoPlay
          playsInline
          muted
        />
      ) : (
        <div className={styles.placeholder}>
          <div className={styles.avatar}>
            <span className={styles.initials}>{initials || 'YN'}</span>
          </div>
          <p className={styles.cameraOff}>Camera is off</p>
        </div>
      )}
      <div className={styles.nameTag}>
        <span className={styles.name}>{displayName || 'Your Name'}</span>
      </div>
    </div>
  );
};