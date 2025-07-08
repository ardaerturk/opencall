import React, { useState } from 'react';
import { IconButton } from '../../common/IconButton';
import styles from './MeetingInfo.module.css';

interface MeetingInfoProps {
  meetingId: string;
  participantCount: number;
  duration: number; // in seconds
  onCopyMeetingId?: () => void;
}

export const MeetingInfo: React.FC<MeetingInfoProps> = ({
  meetingId,
  participantCount,
  duration,
  onCopyMeetingId,
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs
        .toString()
        .padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const handleCopyMeetingId = async () => {
    try {
      await navigator.clipboard.writeText(meetingId);
      setCopied(true);
      onCopyMeetingId?.();
      
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (error) {
      console.error('Failed to copy meeting ID:', error);
    }
  };

  return (
    <div className={styles.infoContainer}>
      <button
        className={styles.infoButton}
        onClick={() => setShowDetails(!showDetails)}
        aria-label="Meeting information"
      >
        <span className={styles.infoIcon}>ℹ️</span>
        <span className={styles.infoText}>Meeting Info</span>
      </button>

      {showDetails && (
        <div className={styles.detailsPanel}>
          <div className={styles.header}>
            <h3 className={styles.title}>Meeting Details</h3>
            <IconButton
              icon="✕"
              size="small"
              variant="ghost"
              onClick={() => setShowDetails(false)}
              aria-label="Close"
            />
          </div>

          <div className={styles.content}>
            <div className={styles.infoItem}>
              <span className={styles.label}>Meeting ID</span>
              <div className={styles.valueGroup}>
                <span className={styles.value}>{meetingId}</span>
                <button
                  className={styles.copyButton}
                  onClick={handleCopyMeetingId}
                  aria-label="Copy meeting ID"
                >
                  {copied ? '✓' : '📋'}
                </button>
              </div>
            </div>

            <div className={styles.infoItem}>
              <span className={styles.label}>Participants</span>
              <span className={styles.value}>
                {participantCount} {participantCount === 1 ? 'person' : 'people'}
              </span>
            </div>

            <div className={styles.infoItem}>
              <span className={styles.label}>Duration</span>
              <span className={styles.value}>{formatDuration(duration)}</span>
            </div>
          </div>

          <div className={styles.actions}>
            <button className={styles.inviteButton}>
              <span className={styles.buttonIcon}>🔗</span>
              <span>Invite Others</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};