import React, { memo, useCallback, useMemo, useRef, useEffect } from 'react';
import { ParticipantVirtualList } from '../common/VirtualList';
import { usePerformanceMonitor, throttle } from '../../utils/performance';
import styles from './VideoGrid.module.css';

interface Participant {
  id: string;
  name: string;
  videoStream?: MediaStream;
  audioStream?: MediaStream;
  isMuted: boolean;
  isVideoOff: boolean;
  isSpeaking: boolean;
  connectionQuality: 'good' | 'medium' | 'poor';
}

interface OptimizedVideoGridProps {
  participants: Participant[];
  localParticipant: Participant;
  layout: 'grid' | 'speaker' | 'gallery';
  maxVisibleParticipants?: number;
  onParticipantClick?: (participant: Participant) => void;
}

// Memoized video tile component
const VideoTile = memo(({ 
  participant, 
  isLarge = false,
  onClick 
}: { 
  participant: Participant;
  isLarge?: boolean;
  onClick?: () => void;
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();

  // Use canvas for better performance with many videos
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !participant.videoStream) return;

    const ctx = canvas.getContext('2d', { 
      alpha: false,
      desynchronized: true 
    });
    if (!ctx) return;

    video.srcObject = participant.videoStream;
    video.play().catch(console.error);

    // Throttle canvas updates based on tile size
    const fps = isLarge ? 30 : 15;
    const frameDelay = 1000 / fps;
    let lastFrameTime = 0;

    const drawFrame = (timestamp: number) => {
      if (timestamp - lastFrameTime >= frameDelay) {
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        }
        lastFrameTime = timestamp;
      }
      
      animationFrameRef.current = requestAnimationFrame(drawFrame);
    };

    animationFrameRef.current = requestAnimationFrame(drawFrame);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      video.srcObject = null;
    };
  }, [participant.videoStream, isLarge]);

  const tileClassName = useMemo(() => {
    const classes = [styles.videoTile];
    if (isLarge) classes.push(styles.large);
    if (participant.isSpeaking) classes.push(styles.speaking);
    if (participant.connectionQuality === 'poor') classes.push(styles.poorConnection);
    return classes.join(' ');
  }, [isLarge, participant.isSpeaking, participant.connectionQuality]);

  return (
    <div className={tileClassName} onClick={onClick}>
      <video 
        ref={videoRef}
        style={{ display: 'none' }}
        muted
        playsInline
      />
      
      {participant.videoStream && !participant.isVideoOff ? (
        <canvas 
          ref={canvasRef}
          className={styles.videoCanvas}
          width={isLarge ? 1280 : 320}
          height={isLarge ? 720 : 180}
        />
      ) : (
        <div className={styles.avatarContainer}>
          <div className={styles.avatar}>
            {participant.name.charAt(0).toUpperCase()}
          </div>
        </div>
      )}
      
      <div className={styles.participantInfo}>
        <span className={styles.participantName}>{participant.name}</span>
        <div className={styles.indicators}>
          {participant.isMuted && <span className={styles.mutedIcon}>🔇</span>}
          {participant.isVideoOff && <span className={styles.videoOffIcon}>📷</span>}
          <span className={`${styles.connectionIndicator} ${styles[participant.connectionQuality]}`} />
        </div>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for better performance
  return (
    prevProps.participant.id === nextProps.participant.id &&
    prevProps.participant.isMuted === nextProps.participant.isMuted &&
    prevProps.participant.isVideoOff === nextProps.participant.isVideoOff &&
    prevProps.participant.isSpeaking === nextProps.participant.isSpeaking &&
    prevProps.participant.connectionQuality === nextProps.participant.connectionQuality &&
    prevProps.participant.videoStream === nextProps.participant.videoStream &&
    prevProps.isLarge === nextProps.isLarge
  );
});

VideoTile.displayName = 'VideoTile';

// Main optimized video grid component
export const OptimizedVideoGrid: React.FC<OptimizedVideoGridProps> = memo(({
  participants,
  localParticipant,
  layout,
  maxVisibleParticipants = 25,
  onParticipantClick
}) => {
  const { renderCount, getMetrics } = usePerformanceMonitor('OptimizedVideoGrid');

  // Combine and sort participants
  const allParticipants = useMemo(() => {
    const combined = [localParticipant, ...participants];
    
    // Sort by: speaking > video on > alphabetical
    return combined.sort((a, b) => {
      if (a.isSpeaking !== b.isSpeaking) return a.isSpeaking ? -1 : 1;
      if (a.isVideoOff !== b.isVideoOff) return a.isVideoOff ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
  }, [participants, localParticipant]);

  // Determine active speaker for speaker layout
  const activeSpeaker = useMemo(() => {
    return allParticipants.find(p => p.isSpeaking) || localParticipant;
  }, [allParticipants, localParticipant]);

  // Calculate grid layout
  const gridLayout = useMemo(() => {
    const count = Math.min(allParticipants.length, maxVisibleParticipants);
    let columns = 1;
    let rows = 1;

    if (count <= 1) {
      columns = 1;
      rows = 1;
    } else if (count <= 4) {
      columns = 2;
      rows = Math.ceil(count / 2);
    } else if (count <= 9) {
      columns = 3;
      rows = Math.ceil(count / 3);
    } else if (count <= 16) {
      columns = 4;
      rows = Math.ceil(count / 4);
    } else {
      columns = 5;
      rows = Math.ceil(count / 5);
    }

    return { columns, rows };
  }, [allParticipants.length, maxVisibleParticipants]);

  // Render participant tile
  const renderParticipant = useCallback((participant: Participant, index: number) => {
    return (
      <VideoTile
        key={participant.id}
        participant={participant}
        isLarge={layout === 'speaker' && participant.id === activeSpeaker.id}
        onClick={() => onParticipantClick?.(participant)}
      />
    );
  }, [layout, activeSpeaker.id, onParticipantClick]);

  // Handle scroll for lazy loading
  const handleScroll = useCallback(
    throttle((scrollTop: number) => {
      // Log scroll performance
      performanceMetrics.recordMetric('video-grid-scroll', scrollTop);
    }, 100),
    []
  );

  if (layout === 'speaker') {
    return (
      <div className={styles.speakerLayout}>
        <div className={styles.mainSpeaker}>
          <VideoTile
            participant={activeSpeaker}
            isLarge
            onClick={() => onParticipantClick?.(activeSpeaker)}
          />
        </div>
        
        <div className={styles.thumbnailStrip}>
          {allParticipants
            .filter(p => p.id !== activeSpeaker.id)
            .slice(0, 5)
            .map(participant => (
              <VideoTile
                key={participant.id}
                participant={participant}
                onClick={() => onParticipantClick?.(participant)}
              />
            ))}
        </div>
      </div>
    );
  }

  if (allParticipants.length > maxVisibleParticipants) {
    // Use virtual scrolling for large meetings
    return (
      <div className={styles.virtualGridContainer}>
        <ParticipantVirtualList
          participants={allParticipants}
          renderParticipant={renderParticipant}
          className={styles.virtualGrid}
        />
      </div>
    );
  }

  // Regular grid layout for smaller meetings
  return (
    <div 
      className={styles.gridLayout}
      style={{
        gridTemplateColumns: `repeat(${gridLayout.columns}, 1fr)`,
        gridTemplateRows: `repeat(${gridLayout.rows}, 1fr)`
      }}
    >
      {allParticipants.slice(0, maxVisibleParticipants).map((participant, index) => (
        <VideoTile
          key={participant.id}
          participant={participant}
          onClick={() => onParticipantClick?.(participant)}
        />
      ))}
    </div>
  );
});

OptimizedVideoGrid.displayName = 'OptimizedVideoGrid';

// Performance metrics hook
import { performanceMetrics } from '../../utils/performance';

export function useVideoGridMetrics() {
  useEffect(() => {
    performanceMetrics.startObserving('measure', (entries) => {
      entries.forEach(entry => {
        if (entry.name.includes('video-grid')) {
          console.log(`Video Grid Performance: ${entry.name} - ${entry.duration}ms`);
        }
      });
    });

    return () => {
      performanceMetrics.stopObserving('measure');
    };
  }, []);

  return {
    getScrollMetrics: () => performanceMetrics.getMetrics('video-grid-scroll'),
    getRenderMetrics: () => performanceMetrics.getMetrics('OptimizedVideoGrid-render')
  };
}