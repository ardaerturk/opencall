import { useCallback, useEffect } from 'react';
import { useMediaStore } from '../stores/mediaStore';
import { getDisplayMedia, stopMediaStream, setAudioOutputDevice, enumerateDevices } from '../utils/media';

export function useMediaControls() {
  const {
    localStream,
    screenStream,
    audioEnabled,
    videoEnabled,
    screenShareEnabled,
    selectedAudioOutput,
    toggleAudio,
    toggleVideo,
    setScreenStream,
    setScreenShareEnabled,
    setDevices,
    setSelectedAudioInput,
    setSelectedAudioOutput,
    setSelectedVideoInput,
  } = useMediaStore();

  // Monitor device changes
  useEffect(() => {
    const handleDeviceChange = async () => {
      const devices = await enumerateDevices();
      setDevices(devices);
    };

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    
    // Initial device enumeration
    handleDeviceChange();

    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [setDevices]);

  // Toggle screen share
  const toggleScreenShare = useCallback(async () => {
    if (screenShareEnabled && screenStream) {
      // Stop screen share
      stopMediaStream(screenStream);
      setScreenStream(null);
      setScreenShareEnabled(false);
    } else {
      // Start screen share
      try {
        const stream = await getDisplayMedia();
        setScreenStream(stream);
        setScreenShareEnabled(true);

        // Listen for screen share ending
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.addEventListener('ended', () => {
            setScreenStream(null);
            setScreenShareEnabled(false);
          });
        }
      } catch (error) {
        console.error('Failed to start screen share:', error);
        throw error;
      }
    }
  }, [screenShareEnabled, screenStream, setScreenStream, setScreenShareEnabled]);

  // Switch audio input device
  const switchAudioInput = useCallback(async (deviceId: string) => {
    setSelectedAudioInput(deviceId);
    
    // If there's an active stream, update the audio track
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        try {
          await audioTrack.applyConstraints({
            deviceId: { exact: deviceId },
          });
        } catch (error) {
          console.error('Failed to switch audio input:', error);
          throw error;
        }
      }
    }
  }, [localStream, setSelectedAudioInput]);

  // Switch video input device
  const switchVideoInput = useCallback(async (deviceId: string) => {
    setSelectedVideoInput(deviceId);
    
    // If there's an active stream, update the video track
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        try {
          await videoTrack.applyConstraints({
            deviceId: { exact: deviceId },
          });
        } catch (error) {
          console.error('Failed to switch video input:', error);
          throw error;
        }
      }
    }
  }, [localStream, setSelectedVideoInput]);

  // Switch audio output device (for speaker selection)
  const switchAudioOutput = useCallback(async (deviceId: string, audioElement?: HTMLAudioElement | HTMLVideoElement) => {
    setSelectedAudioOutput(deviceId);
    
    // Apply to specific audio element if provided
    if (audioElement) {
      try {
        await setAudioOutputDevice(audioElement as HTMLVideoElement, deviceId);
      } catch (error) {
        console.error('Failed to switch audio output:', error);
        throw error;
      }
    }
  }, [setSelectedAudioOutput]);

  // Get current media state
  const getMediaState = useCallback(() => {
    return {
      hasAudio: localStream ? localStream.getAudioTracks().length > 0 : false,
      hasVideo: localStream ? localStream.getVideoTracks().length > 0 : false,
      audioEnabled,
      videoEnabled,
      screenShareEnabled,
    };
  }, [localStream, audioEnabled, videoEnabled, screenShareEnabled]);

  return {
    // State
    audioEnabled,
    videoEnabled,
    screenShareEnabled,
    selectedAudioOutput,
    
    // Actions
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    switchAudioInput,
    switchVideoInput,
    switchAudioOutput,
    getMediaState,
  };
}