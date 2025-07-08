import { useEffect, useState, useCallback } from 'react';
import { useMediaStore } from '../stores/mediaStore';
import { enumerateDevices, checkMediaPermissions } from '../utils/media';

export interface DeviceInfo {
  deviceId: string;
  label: string;
  kind: MediaDeviceKind;
  isDefault?: boolean;
}

export interface UseDevicesResult {
  audioInputs: DeviceInfo[];
  audioOutputs: DeviceInfo[];
  videoInputs: DeviceInfo[];
  selectedAudioInput: string | null;
  selectedAudioOutput: string | null;
  selectedVideoInput: string | null;
  permissions: { audio: boolean; video: boolean };
  hasPermissions: boolean;
  refreshDevices: () => Promise<void>;
  requestPermissions: () => Promise<boolean>;
}

export function useDevices(): UseDevicesResult {
  const {
    audioInputDevices,
    audioOutputDevices,
    videoInputDevices,
    selectedAudioInput,
    selectedAudioOutput,
    selectedVideoInput,
    setDevices,
  } = useMediaStore();

  const [permissions, setPermissions] = useState({ audio: false, video: false });
  const [hasPermissions, setHasPermissions] = useState(false);

  // Check permissions on mount
  useEffect(() => {
    checkMediaPermissions().then(perms => {
      setPermissions(perms);
      setHasPermissions(perms.audio || perms.video);
    });
  }, []);

  // Refresh device list
  const refreshDevices = useCallback(async () => {
    try {
      const devices = await enumerateDevices();
      setDevices(devices);
      
      // Check if we have permissions based on device labels
      const hasLabels = devices.some(d => d.label !== '');
      setHasPermissions(hasLabels);
      
      if (hasLabels) {
        const perms = await checkMediaPermissions();
        setPermissions(perms);
      }
    } catch (error) {
      console.error('Failed to enumerate devices:', error);
    }
  }, [setDevices]);

  // Request permissions
  const requestPermissions = useCallback(async (): Promise<boolean> => {
    try {
      // Request both audio and video permissions
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: true 
      });
      
      // Stop the stream immediately after getting permissions
      stream.getTracks().forEach(track => track.stop());
      
      // Refresh devices and permissions
      await refreshDevices();
      const perms = await checkMediaPermissions();
      setPermissions(perms);
      setHasPermissions(true);
      
      return true;
    } catch (error) {
      console.error('Failed to request permissions:', error);
      return false;
    }
  }, [refreshDevices]);

  // Auto-refresh devices when they change
  useEffect(() => {
    const handleDeviceChange = () => {
      refreshDevices();
    };

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    
    // Initial refresh
    refreshDevices();

    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [refreshDevices]);

  // Find default devices
  const findDefaultDevice = useCallback((devices: DeviceInfo[], kind: MediaDeviceKind): DeviceInfo | undefined => {
    // Look for device with "default" in label
    const defaultDevice = devices.find(d => 
      d.label.toLowerCase().includes('default') && d.kind === kind
    );
    
    // Or just return the first device
    return defaultDevice || devices.find(d => d.kind === kind);
  }, []);

  // Enhance device info with default status
  const enhancedAudioInputs = audioInputDevices.map(device => ({
    ...device,
    isDefault: device.deviceId === selectedAudioInput || 
              device.deviceId === findDefaultDevice(audioInputDevices, 'audioinput')?.deviceId,
  }));

  const enhancedAudioOutputs = audioOutputDevices.map(device => ({
    ...device,
    isDefault: device.deviceId === selectedAudioOutput || 
              device.deviceId === findDefaultDevice(audioOutputDevices, 'audiooutput')?.deviceId,
  }));

  const enhancedVideoInputs = videoInputDevices.map(device => ({
    ...device,
    isDefault: device.deviceId === selectedVideoInput || 
              device.deviceId === findDefaultDevice(videoInputDevices, 'videoinput')?.deviceId,
  }));

  return {
    audioInputs: enhancedAudioInputs,
    audioOutputs: enhancedAudioOutputs,
    videoInputs: enhancedVideoInputs,
    selectedAudioInput,
    selectedAudioOutput,
    selectedVideoInput,
    permissions,
    hasPermissions,
    refreshDevices,
    requestPermissions,
  };
}