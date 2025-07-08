import React, { useState } from 'react';
import { IconButton } from '../../common/IconButton';
import { useMediaDevices } from '../../../hooks/useMediaDevices';
import styles from './MediaControls.module.css';

interface MediaControlsProps {
  audioEnabled: boolean;
  videoEnabled: boolean;
  screenShareEnabled?: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onToggleScreenShare?: () => void;
  onEndCall: () => void;
  onOpenSettings?: () => void;
}

export const MediaControls: React.FC<MediaControlsProps> = ({
  audioEnabled,
  videoEnabled,
  screenShareEnabled = false,
  onToggleAudio,
  onToggleVideo,
  onToggleScreenShare,
  onEndCall,
  onOpenSettings,
}) => {
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const { devices, selectedDevices, selectDevice } = useMediaDevices();

  return (
    <div className={styles.controlsContainer}>
      <div className={styles.controls}>
        <div className={styles.mainControls}>
          <IconButton
            icon={audioEnabled ? '🎤' : '🔇'}
            size="large"
            variant={audioEnabled ? 'default' : 'danger'}
            onClick={onToggleAudio}
            aria-label={audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
          />

          <IconButton
            icon={videoEnabled ? '📹' : '📷'}
            size="large"
            variant={videoEnabled ? 'default' : 'danger'}
            onClick={onToggleVideo}
            aria-label={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
          />

          {onToggleScreenShare && (
            <IconButton
              icon="🖥️"
              size="large"
              variant={screenShareEnabled ? 'default' : 'ghost'}
              active={screenShareEnabled}
              onClick={onToggleScreenShare}
              aria-label={screenShareEnabled ? 'Stop sharing screen' : 'Share screen'}
            />
          )}

          <IconButton
            icon="☎️"
            size="large"
            variant="danger"
            onClick={onEndCall}
            aria-label="End call"
          />
        </div>

        <div className={styles.secondaryControls}>
          <div className={styles.optionsGroup}>
            <IconButton
              icon="⋯"
              size="medium"
              variant="ghost"
              onClick={() => setShowMoreOptions(!showMoreOptions)}
              aria-label="More options"
            />

            {showMoreOptions && (
              <div className={styles.moreOptions}>
                <button className={styles.optionItem} onClick={onOpenSettings}>
                  <span className={styles.optionIcon}>⚙️</span>
                  <span className={styles.optionLabel}>Settings</span>
                </button>
                
                <div className={styles.divider} />
                
                <div className={styles.deviceSelector}>
                  <label className={styles.deviceLabel}>Microphone</label>
                  <select
                    className={styles.deviceSelect}
                    value={selectedDevices.audioInput || ''}
                    onChange={(e) => selectDevice('audioinput', e.target.value)}
                  >
                    {devices.audioInputs.map((device) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.deviceSelector}>
                  <label className={styles.deviceLabel}>Camera</label>
                  <select
                    className={styles.deviceSelect}
                    value={selectedDevices.videoInput || ''}
                    onChange={(e) => selectDevice('videoinput', e.target.value)}
                  >
                    {devices.videoInputs.map((device) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};