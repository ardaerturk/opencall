import React, { useEffect, useState } from 'react';
import { ConnectionMode, ConnectionQualityMetrics } from '../../../services/hybridConnection';
import styles from './HybridConnectionIndicator.module.css';

interface HybridConnectionIndicatorProps {
  mode: ConnectionMode;
  isTransitioning: boolean;
  quality?: ConnectionQualityMetrics | null;
  participantCount: number;
}

export const HybridConnectionIndicator: React.FC<HybridConnectionIndicatorProps> = ({
  mode,
  isTransitioning,
  quality,
  participantCount,
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const [transitionProgress, setTransitionProgress] = useState(0);

  useEffect(() => {
    if (isTransitioning) {
      const interval = setInterval(() => {
        setTransitionProgress((prev) => Math.min(prev + 10, 90));
      }, 200);
      return () => clearInterval(interval);
    } else {
      setTransitionProgress(0);
    }
  }, [isTransitioning]);

  const getQualityIndicator = () => {
    if (!quality) return 'unknown';
    
    const { packetLoss, rtt } = quality;
    
    if (packetLoss > 5 || rtt > 200) return 'poor';
    if (packetLoss > 2 || rtt > 100) return 'fair';
    return 'excellent';
  };

  const qualityLevel = getQualityIndicator();

  return (
    <div className={styles.container}>
      <div 
        className={styles.indicator}
        onClick={() => setShowDetails(!showDetails)}
      >
        <div className={styles.modeInfo}>
          <span className={styles.modeLabel}>
            {mode === 'p2p' ? 'P2P' : 'SFU'}
          </span>
          {isTransitioning && (
            <span className={styles.transitioning}>
              Switching...
            </span>
          )}
        </div>
        
        <div className={styles.participants}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12.5 14c0-2.5-2-4.5-4.5-4.5S3.5 11.5 3.5 14"/>
          </svg>
          <span>{participantCount}</span>
        </div>

        <div className={`${styles.quality} ${styles[qualityLevel]}`}>
          <div className={styles.qualityDot} />
        </div>
      </div>

      {showDetails && (
        <div className={styles.details}>
          <h4>Connection Details</h4>
          
          <div className={styles.detailRow}>
            <span>Mode:</span>
            <span>{mode === 'p2p' ? 'Peer-to-Peer' : 'Server (SFU)'}</span>
          </div>
          
          <div className={styles.detailRow}>
            <span>Participants:</span>
            <span>{participantCount}</span>
          </div>

          {quality && (
            <>
              <div className={styles.detailRow}>
                <span>Bitrate:</span>
                <span>{Math.round(quality.bitrate / 1000)} kbps</span>
              </div>
              
              <div className={styles.detailRow}>
                <span>Packet Loss:</span>
                <span>{quality.packetLoss.toFixed(1)}%</span>
              </div>
              
              <div className={styles.detailRow}>
                <span>Latency:</span>
                <span>{Math.round(quality.rtt)} ms</span>
              </div>
            </>
          )}

          {isTransitioning && (
            <div className={styles.transitionInfo}>
              <div className={styles.progressBar}>
                <div 
                  className={styles.progressFill}
                  style={{ width: `${transitionProgress}%` }}
                />
              </div>
              <p className={styles.transitionText}>
                Optimizing connection for {participantCount} participants...
              </p>
            </div>
          )}

          <div className={styles.modeExplanation}>
            {mode === 'p2p' ? (
              <p>
                Direct peer-to-peer connection. Best for small groups (2-3 people) 
                with lower latency and better privacy.
              </p>
            ) : (
              <p>
                Server-mediated connection. Optimal for larger groups (4+ people) 
                with better bandwidth efficiency and stability.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};