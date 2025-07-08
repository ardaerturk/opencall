import { UserPreferences } from '../stores/mediaStore';

export interface MediaConstraints {
  video?: boolean | MediaTrackConstraints;
  audio?: boolean | MediaTrackConstraints;
}

export const DEFAULT_VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30 },
};

export const DEFAULT_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

export async function getUserMedia(
  constraints: MediaConstraints = { video: true, audio: true },
  preferences?: UserPreferences,
  selectedDevices?: {
    audioInput?: string;
    videoInput?: string;
  }
): Promise<MediaStream> {
  const audioConstraints: MediaTrackConstraints = {
    ...DEFAULT_AUDIO_CONSTRAINTS,
    ...(preferences && {
      echoCancellation: preferences.enableEchoCancellation,
      noiseSuppression: preferences.enableNoiseSuppression,
      autoGainControl: preferences.enableAutoGainControl,
    }),
    ...(selectedDevices?.audioInput && {
      deviceId: { exact: selectedDevices.audioInput },
    }),
  };

  const videoConstraints: MediaTrackConstraints = {
    ...DEFAULT_VIDEO_CONSTRAINTS,
    ...(selectedDevices?.videoInput && {
      deviceId: { exact: selectedDevices.videoInput },
    }),
    ...(preferences?.defaultVideoQuality && getVideoQualityConstraints(preferences.defaultVideoQuality)),
  };

  const finalConstraints: MediaConstraints = {
    audio: constraints.audio === false ? false : audioConstraints,
    video: constraints.video === false ? false : videoConstraints,
  };

  try {
    return await navigator.mediaDevices.getUserMedia(finalConstraints);
  } catch (error) {
    console.error('Failed to get user media:', error);
    throw error;
  }
}

export async function getDisplayMedia(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getDisplayMedia({
      video: {
        displaySurface: 'window',
      },
      audio: false,
    });
  } catch (error) {
    console.error('Failed to get display media:', error);
    throw error;
  }
}

export async function enumerateDevices(): Promise<MediaDeviceInfo[]> {
  try {
    return await navigator.mediaDevices.enumerateDevices();
  } catch (error) {
    console.error('Failed to enumerate devices:', error);
    return [];
  }
}

export function getVideoQualityConstraints(quality: 'low' | 'medium' | 'high' | 'auto'): Partial<MediaTrackConstraints> {
  switch (quality) {
    case 'low':
      return {
        width: { ideal: 640 },
        height: { ideal: 360 },
        frameRate: { ideal: 15 },
      };
    case 'medium':
      return {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
      };
    case 'high':
      return {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30 },
      };
    case 'auto':
    default:
      return DEFAULT_VIDEO_CONSTRAINTS;
  }
}

export function stopMediaStream(stream: MediaStream): void {
  stream.getTracks().forEach(track => track.stop());
}

export function setAudioOutputDevice(videoElement: HTMLVideoElement, deviceId: string): Promise<void> {
  if ('setSinkId' in videoElement) {
    return (videoElement as any).setSinkId(deviceId);
  }
  return Promise.reject(new Error('setSinkId not supported'));
}

export function checkMediaPermissions(): Promise<{ audio: boolean; video: boolean }> {
  return new Promise((resolve) => {
    Promise.all([
      navigator.permissions.query({ name: 'microphone' as PermissionName }),
      navigator.permissions.query({ name: 'camera' as PermissionName }),
    ])
      .then(([audioPermission, videoPermission]) => {
        resolve({
          audio: audioPermission.state === 'granted',
          video: videoPermission.state === 'granted',
        });
      })
      .catch(() => {
        // Fallback if permissions API is not available
        resolve({ audio: false, video: false });
      });
  });
}

export function getMediaStreamInfo(stream: MediaStream): {
  hasAudio: boolean;
  hasVideo: boolean;
  audioTracks: MediaStreamTrack[];
  videoTracks: MediaStreamTrack[];
} {
  const audioTracks = stream.getAudioTracks();
  const videoTracks = stream.getVideoTracks();
  
  return {
    hasAudio: audioTracks.length > 0,
    hasVideo: videoTracks.length > 0,
    audioTracks,
    videoTracks,
  };
}