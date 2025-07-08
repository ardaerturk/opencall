import React from 'react';
import styles from './DeviceSelector.module.css';

interface DeviceSelectorProps {
  devices: {
    audioInputs: Array<{ deviceId: string; label: string }>;
    audioOutputs: Array<{ deviceId: string; label: string }>;
    videoInputs: Array<{ deviceId: string; label: string }>;
  };
  selectedDevices: {
    audioInput?: string;
    audioOutput?: string;
    videoInput?: string;
  };
  onSelectDevice: (kind: MediaDeviceKind, deviceId: string) => void;
  onClose: () => void;
}

export const DeviceSelector: React.FC<DeviceSelectorProps> = ({
  devices,
  selectedDevices,
  onSelectDevice,
  onClose,
}) => {
  return (
    <div className={styles.deviceSelector}>
      <div className={styles.header}>
        <h3 className={styles.title}>Device Settings</h3>
        <button
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Close settings"
        >
          ✕
        </button>
      </div>

      <div className={styles.deviceGroups}>
        <div className={styles.deviceGroup}>
          <label className={styles.label}>Microphone</label>
          <select
            className={styles.select}
            value={selectedDevices.audioInput || ''}
            onChange={(e) => onSelectDevice('audioinput', e.target.value)}
          >
            {devices.audioInputs.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.deviceGroup}>
          <label className={styles.label}>Speaker</label>
          <select
            className={styles.select}
            value={selectedDevices.audioOutput || ''}
            onChange={(e) => onSelectDevice('audiooutput', e.target.value)}
          >
            {devices.audioOutputs.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.deviceGroup}>
          <label className={styles.label}>Camera</label>
          <select
            className={styles.select}
            value={selectedDevices.videoInput || ''}
            onChange={(e) => onSelectDevice('videoinput', e.target.value)}
          >
            {devices.videoInputs.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};