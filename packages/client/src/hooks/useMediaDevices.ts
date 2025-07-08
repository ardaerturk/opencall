import { useState, useEffect, useCallback } from 'react';

interface MediaDeviceInfo {
  deviceId: string;
  label: string;
  kind: MediaDeviceKind;
}

interface UseMediaDevicesResult {
  devices: {
    audioInputs: MediaDeviceInfo[];
    audioOutputs: MediaDeviceInfo[];
    videoInputs: MediaDeviceInfo[];
  };
  selectedDevices: {
    audioInput?: string;
    audioOutput?: string;
    videoInput?: string;
  };
  selectDevice: (kind: MediaDeviceKind, deviceId: string) => void;
  refreshDevices: () => Promise<void>;
  hasPermissions: {
    audio: boolean;
    video: boolean;
  };
  requestPermissions: () => Promise<void>;
}

export function useMediaDevices(): UseMediaDevicesResult {
  const [devices, setDevices] = useState<UseMediaDevicesResult['devices']>({
    audioInputs: [],
    audioOutputs: [],
    videoInputs: [],
  });

  const [selectedDevices, setSelectedDevices] = useState<UseMediaDevicesResult['selectedDevices']>({});
  
  const [hasPermissions, setHasPermissions] = useState({
    audio: false,
    video: false,
  });

  const refreshDevices = useCallback(async () => {
    try {
      const deviceList = await navigator.mediaDevices.enumerateDevices();
      
      const audioInputs = deviceList
        .filter(device => device.kind === 'audioinput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Microphone ${device.deviceId.slice(0, 5)}`,
          kind: device.kind,
        }));

      const audioOutputs = deviceList
        .filter(device => device.kind === 'audiooutput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Speaker ${device.deviceId.slice(0, 5)}`,
          kind: device.kind,
        }));

      const videoInputs = deviceList
        .filter(device => device.kind === 'videoinput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Camera ${device.deviceId.slice(0, 5)}`,
          kind: device.kind,
        }));

      setDevices({ audioInputs, audioOutputs, videoInputs });

      // Set default selected devices if not already set
      setSelectedDevices(prev => ({
        audioInput: prev.audioInput || audioInputs[0]?.deviceId,
        audioOutput: prev.audioOutput || audioOutputs[0]?.deviceId,
        videoInput: prev.videoInput || videoInputs[0]?.deviceId,
      }));

      // Check if we have labels (indicates permissions granted)
      const hasAudioPermission = audioInputs.some(device => device.label && device.label !== '');
      const hasVideoPermission = videoInputs.some(device => device.label && device.label !== '');
      
      setHasPermissions({
        audio: hasAudioPermission,
        video: hasVideoPermission,
      });
    } catch (error) {
      console.error('Error enumerating devices:', error);
    }
  }, []);

  const requestPermissions = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });
      
      // Stop all tracks after getting permissions
      stream.getTracks().forEach(track => track.stop());
      
      // Refresh devices after getting permissions
      await refreshDevices();
    } catch (error) {
      console.error('Error requesting permissions:', error);
    }
  }, [refreshDevices]);

  const selectDevice = useCallback((kind: MediaDeviceKind, deviceId: string) => {
    setSelectedDevices(prev => {
      if (kind === 'audioinput') {
        return { ...prev, audioInput: deviceId };
      } else if (kind === 'audiooutput') {
        return { ...prev, audioOutput: deviceId };
      } else if (kind === 'videoinput') {
        return { ...prev, videoInput: deviceId };
      }
      return prev;
    });
  }, []);

  useEffect(() => {
    refreshDevices();

    // Listen for device changes
    navigator.mediaDevices.addEventListener('devicechange', refreshDevices);

    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', refreshDevices);
    };
  }, [refreshDevices]);

  return {
    devices,
    selectedDevices,
    selectDevice,
    refreshDevices,
    hasPermissions,
    requestPermissions,
  };
}