import React from 'react';
import { ConnectionMode, ConnectionQualityMetrics } from '../../services/hybridConnection';
import styles from './HybridConnectionIndicator.module.css';

interface HybridConnectionIndicatorProps {
  mode: ConnectionMode;
  isTransitioning: boolean;
  quality: ConnectionQualityMetrics | null;
  participantCount: number;
}

export const HybridConnectionIndicator: React.FC<HybridConnectionIndicatorProps> = ({
  mode,
  isTransitioning,
  quality,
  participantCount
}) => {
  const getModeIcon = () => {
    if (isTransitioning) return '🔄';
    return mode === 'p2p' ? '🔗' : '🌐';
  };

  const getModeLabel = () => {
    if (isTransitioning) return 'Switching...';
    return mode === 'p2p' ? 'Peer-to-Peer' : 'Server Mode';
  };

  const getQualityColor = () => {
    if (!quality) return styles.good;
    if (quality.packetLoss > 5 || quality.rtt > 200) return styles.poor;
    if (quality.packetLoss > 2 || quality.rtt > 100) return styles.fair;
    return styles.good;
  };

  return (
    <div className={styles.container}>
      <div className={`${styles.modeIndicator} ${isTransitioning ? styles.transitioning : ''}`}>
        <span className={styles.icon}>{getModeIcon()}</span>
        <span className={styles.label}>{getModeLabel()}</span>
      </div>
      
      {quality && (
        <div className={`${styles.qualityIndicator} ${getQualityColor()}`}>
          <span className={styles.metric}>
            {quality.rtt}ms
          </span>
          <span className={styles.metric}>
            {quality.packetLoss.toFixed(1)}% loss
          </span>
        </div>
      )}
      
      <div className={styles.participantCount}>
        <span className={styles.icon}>👥</span>
        <span>{participantCount}</span>
      </div>
    </div>
  );
};