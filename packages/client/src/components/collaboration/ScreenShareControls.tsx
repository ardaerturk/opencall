import React, { useState, useRef, useEffect } from 'react';
import { EnhancedScreenShareService, ScreenShare, LayoutMode } from '../../services/screenShare/EnhancedScreenShareService';
import styles from './ScreenShareControls.module.css';

interface ScreenShareControlsProps {
  screenShareService: EnhancedScreenShareService;
  currentUserId: string;
  currentUserName: string;
  onLayoutChange?: (layout: LayoutMode) => void;
}

export const ScreenShareControls: React.FC<ScreenShareControlsProps> = ({
  screenShareService,
  currentUserId,
  currentUserName,
  onLayoutChange
}) => {
  const [activeShares, setActiveShares] = useState<ScreenShare[]>([]);
  const [isSharing, setIsSharing] = useState(false);
  const [selectedQuality, setSelectedQuality] = useState<ScreenShare['quality']>('auto');
  const [currentLayout, setCurrentLayout] = useState<LayoutMode>('focus');
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [annotationColor, setAnnotationColor] = useState('#FF0000');
  const [annotationType, setAnnotationType] = useState<'drawing' | 'pointer'>('drawing');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // Subscribe to screen share events
    screenShareService.on('screenShareStarted', handleScreenShareStarted);
    screenShareService.on('screenShareStopped', handleScreenShareStopped);
    screenShareService.on('layoutChanged', handleLayoutChanged);
    screenShareService.on('qualityChanged', handleQualityChanged);

    // Initialize annotation canvas if available
    if (canvasRef.current) {
      screenShareService.initializeAnnotationCanvas(canvasRef.current);
    }

    return () => {
      screenShareService.off('screenShareStarted', handleScreenShareStarted);
      screenShareService.off('screenShareStopped', handleScreenShareStopped);
      screenShareService.off('layoutChanged', handleLayoutChanged);
      screenShareService.off('qualityChanged', handleQualityChanged);
    };
  }, []);

  const handleScreenShareStarted = (share: ScreenShare) => {
    setActiveShares(screenShareService.getActiveShares());
    if (share.userId === currentUserId) {
      setIsSharing(true);
    }
  };

  const handleScreenShareStopped = (shareId: string) => {
    setActiveShares(screenShareService.getActiveShares());
    const wasMyShare = activeShares.some(s => s.id === shareId && s.userId === currentUserId);
    if (wasMyShare) {
      setIsSharing(false);
      setIsAnnotating(false);
    }
  };

  const handleLayoutChanged = (layout: LayoutMode) => {
    setCurrentLayout(layout);
    onLayoutChange?.(layout);
  };

  const handleQualityChanged = (shareId: string, quality: ScreenShare['quality']) => {
    const myShare = activeShares.find(s => s.id === shareId && s.userId === currentUserId);
    if (myShare) {
      setSelectedQuality(quality);
    }
  };

  const startScreenShare = async () => {
    try {
      const qualityOptions = {
        low: { video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 15 } } },
        medium: { video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } } },
        high: { video: { width: { ideal: 2560 }, height: { ideal: 1440 }, frameRate: { ideal: 30 } } },
        '4k': { video: { width: { ideal: 3840 }, height: { ideal: 2160 }, frameRate: { ideal: 30 } } },
        auto: undefined
      };

      const share = await screenShareService.startScreenShare(
        currentUserId,
        currentUserName,
        selectedQuality !== 'auto' ? qualityOptions[selectedQuality] : undefined
      );

      if (selectedQuality !== 'auto') {
        screenShareService.changeQuality(share.id, selectedQuality);
      }
    } catch (error) {
      console.error('Failed to start screen share:', error);
    }
  };

  const stopScreenShare = () => {
    const myShare = activeShares.find(s => s.userId === currentUserId);
    if (myShare) {
      screenShareService.stopScreenShare(myShare.id);
    }
  };

  const toggleAnnotation = () => {
    const myShare = activeShares.find(s => s.userId === currentUserId);
    if (!myShare) return;

    if (isAnnotating) {
      screenShareService.stopAnnotation(myShare.id);
      setIsAnnotating(false);
    } else {
      screenShareService.startAnnotation(myShare.id, annotationType, annotationColor);
      setIsAnnotating(true);
    }
  };

  const handleQualityChange = (quality: ScreenShare['quality']) => {
    setSelectedQuality(quality);
    const myShare = activeShares.find(s => s.userId === currentUserId);
    if (myShare) {
      screenShareService.changeQuality(myShare.id, quality);
    }
  };

  const handleLayoutSelect = (layout: LayoutMode) => {
    screenShareService.setLayout(layout);
  };

  const clearAnnotations = () => {
    const myShare = activeShares.find(s => s.userId === currentUserId);
    if (myShare) {
      screenShareService.clearAnnotations(myShare.id);
    }
  };

  const colors = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#000000', '#FFFFFF'];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3>Screen Sharing</h3>
        <span className={styles.shareCount}>{activeShares.length} active</span>
      </div>

      <div className={styles.controls}>
        {!isSharing ? (
          <button
            className={styles.shareButton}
            onClick={startScreenShare}
            disabled={activeShares.length >= 4}
          >
            Start Screen Share
          </button>
        ) : (
          <button
            className={`${styles.shareButton} ${styles.stopButton}`}
            onClick={stopScreenShare}
          >
            Stop Sharing
          </button>
        )}

        {isSharing && (
          <>
            <div className={styles.qualitySelector}>
              <label>Quality:</label>
              <select
                value={selectedQuality}
                onChange={(e) => handleQualityChange(e.target.value as ScreenShare['quality'])}
                className={styles.select}
              >
                <option value="auto">Auto</option>
                <option value="low">Low (720p)</option>
                <option value="medium">Medium (1080p)</option>
                <option value="high">High (1440p)</option>
                <option value="4k">4K (2160p)</option>
              </select>
            </div>

            <div className={styles.annotationControls}>
              <button
                className={`${styles.annotationButton} ${isAnnotating ? styles.active : ''}`}
                onClick={toggleAnnotation}
                title="Toggle annotation"
              >
                ✏️
              </button>

              {isAnnotating && (
                <>
                  <div className={styles.annotationTypes}>
                    <button
                      className={`${styles.typeButton} ${annotationType === 'drawing' ? styles.active : ''}`}
                      onClick={() => setAnnotationType('drawing')}
                      title="Drawing tool"
                    >
                      ✏️
                    </button>
                    <button
                      className={`${styles.typeButton} ${annotationType === 'pointer' ? styles.active : ''}`}
                      onClick={() => setAnnotationType('pointer')}
                      title="Pointer tool"
                    >
                      👆
                    </button>
                  </div>

                  <div className={styles.colorPicker}>
                    {colors.map(color => (
                      <button
                        key={color}
                        className={`${styles.colorButton} ${annotationColor === color ? styles.selected : ''}`}
                        style={{ backgroundColor: color }}
                        onClick={() => setAnnotationColor(color)}
                      />
                    ))}
                  </div>

                  <button
                    className={styles.clearButton}
                    onClick={clearAnnotations}
                    title="Clear annotations"
                  >
                    Clear
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {activeShares.length > 1 && (
        <div className={styles.layoutControls}>
          <h4>Layout</h4>
          <div className={styles.layoutButtons}>
            <button
              className={`${styles.layoutButton} ${currentLayout === 'focus' ? styles.active : ''}`}
              onClick={() => handleLayoutSelect('focus')}
              title="Focus view"
            >
              <div className={styles.layoutIcon}>
                <div className={styles.focusLayout} />
              </div>
              Focus
            </button>
            <button
              className={`${styles.layoutButton} ${currentLayout === 'grid' ? styles.active : ''}`}
              onClick={() => handleLayoutSelect('grid')}
              title="Grid view"
            >
              <div className={styles.layoutIcon}>
                <div className={styles.gridLayout} />
              </div>
              Grid
            </button>
            <button
              className={`${styles.layoutButton} ${currentLayout === 'side-by-side' ? styles.active : ''}`}
              onClick={() => handleLayoutSelect('side-by-side')}
              title="Side by side"
            >
              <div className={styles.layoutIcon}>
                <div className={styles.sideBySideLayout} />
              </div>
              Side
            </button>
          </div>
        </div>
      )}

      {activeShares.length > 0 && (
        <div className={styles.activeShares}>
          <h4>Active Shares</h4>
          <div className={styles.sharesList}>
            {activeShares.map(share => (
              <div key={share.id} className={styles.shareItem}>
                <div className={styles.shareInfo}>
                  <span className={styles.userName}>{share.userName}</span>
                  <span className={styles.quality}>{share.quality}</span>
                </div>
                {share.isAnnotating && (
                  <span className={styles.annotatingIndicator}>✏️</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <canvas
        ref={canvasRef}
        className={styles.annotationCanvas}
        style={{ display: isAnnotating ? 'block' : 'none' }}
      />
    </div>
  );
};