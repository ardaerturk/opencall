import React from 'react';
import styles from './ConnectionStatus.module.css';

export type ConnectionQuality = 'excellent' | 'good' | 'poor' | 'connecting' | 'disconnected';

interface ConnectionStatusProps {
  quality: ConnectionQuality;
  latency?: number;
  showDetails?: boolean;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  quality,
  latency,
  showDetails = false,
}) => {
  const getStatusInfo = () => {
    switch (quality) {
      case 'excellent':
        return {
          icon: '●●●',
          label: 'Excellent',
          color: 'var(--color-success)',
          description: 'Crystal clear connection',
        };
      case 'good':
        return {
          icon: '●●○',
          label: 'Good',
          color: 'var(--color-warning)',
          description: 'Stable connection',
        };
      case 'poor':
        return {
          icon: '●○○',
          label: 'Poor',
          color: 'var(--color-danger)',
          description: 'Unstable connection',
        };
      case 'connecting':
        return {
          icon: '⟳',
          label: 'Connecting',
          color: 'var(--color-primary)',
          description: 'Establishing connection...',
        };
      case 'disconnected':
        return {
          icon: '✕',
          label: 'Disconnected',
          color: 'var(--color-danger)',
          description: 'No connection',
        };
    }
  };

  const statusInfo = getStatusInfo();

  return (
    <div className={styles.statusContainer}>
      <div className={styles.statusIndicator}>
        <span
          className={`${styles.icon} ${quality === 'connecting' ? styles.rotating : ''}`}
          style={{ color: statusInfo.color }}
          aria-label={`Connection: ${statusInfo.label}`}
        >
          {statusInfo.icon}
        </span>
        
        {showDetails && (
          <div className={styles.details}>
            <span className={styles.label}>{statusInfo.label}</span>
            {latency !== undefined && quality !== 'disconnected' && (
              <span className={styles.latency}>{latency}ms</span>
            )}
          </div>
        )}
      </div>

      {showDetails && (
        <div className={styles.tooltip}>
          <p className={styles.description}>{statusInfo.description}</p>
          {latency !== undefined && quality !== 'disconnected' && (
            <p className={styles.metric}>Latency: {latency}ms</p>
          )}
        </div>
      )}
    </div>
  );
};