import React from 'react';
import { useResponsive } from '../../../hooks/useResponsive';
import { VideoTile } from './VideoTile';
import styles from './VideoGrid.module.css';

export interface Participant {
  id: string;
  name: string;
  stream?: MediaStream;
  audioEnabled: boolean;
  videoEnabled: boolean;
  isLocal?: boolean;
  isSpeaking?: boolean;
  connectionQuality?: 'excellent' | 'good' | 'poor';
}

interface VideoGridProps {
  participants: Participant[];
  onParticipantClick?: (participant: Participant) => void;
}

export const VideoGrid: React.FC<VideoGridProps> = ({
  participants,
  onParticipantClick,
}) => {
  const { isSmallScreen } = useResponsive();

  // Determine grid layout based on number of participants and screen size
  const getGridClassName = () => {
    const participantCount = participants.length;
    
    if (isSmallScreen) {
      return styles.gridMobile;
    }
    
    if (participantCount === 1) {
      return styles.gridSingle;
    } else if (participantCount === 2) {
      return styles.gridTwo;
    } else if (participantCount === 3) {
      return styles.gridThree;
    } else if (participantCount === 4) {
      return styles.gridFour;
    } else {
      return styles.gridMany;
    }
  };

  // Sort participants to show local participant first
  const sortedParticipants = [...participants].sort((a, b) => {
    if (a.isLocal) return -1;
    if (b.isLocal) return 1;
    return 0;
  });

  return (
    <div className={styles.gridContainer}>
      <div className={`${styles.grid} ${getGridClassName()}`}>
        {sortedParticipants.map((participant) => (
          <VideoTile
            key={participant.id}
            participant={participant}
            onClick={() => onParticipantClick?.(participant)}
          />
        ))}
      </div>
    </div>
  );
};