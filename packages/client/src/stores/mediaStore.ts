import { create } from 'zustand';

export interface UserPreferences {
  audioInput?: string;
  audioOutput?: string;
  videoInput?: string;
  enableNoiseSuppression: boolean;
  enableEchoCancellation: boolean;
  enableAutoGainControl: boolean;
  defaultVideoQuality: 'low' | 'medium' | 'high' | 'auto';
}

interface MediaDevice {
  deviceId: string;
  label: string;
  kind: MediaDeviceKind;
}

interface MediaStore {
  // Local streams
  localStream: MediaStream | null;
  screenStream: MediaStream | null;
  
  // Media state
  audioEnabled: boolean;
  videoEnabled: boolean;
  screenShareEnabled: boolean;
  
  // Devices
  audioInputDevices: MediaDevice[];
  audioOutputDevices: MediaDevice[];
  videoInputDevices: MediaDevice[];
  
  // Selected devices
  selectedAudioInput: string | null;
  selectedAudioOutput: string | null;
  selectedVideoInput: string | null;
  
  // User preferences
  userPreferences: UserPreferences;
  
  // Actions - Streams
  setLocalStream: (stream: MediaStream | null) => void;
  setScreenStream: (stream: MediaStream | null) => void;
  
  // Actions - Media state
  setAudioEnabled: (enabled: boolean) => void;
  setVideoEnabled: (enabled: boolean) => void;
  setScreenShareEnabled: (enabled: boolean) => void;
  toggleAudio: () => void;
  toggleVideo: () => void;
  toggleScreenShare: () => void;
  
  // Actions - Devices
  setDevices: (devices: MediaDeviceInfo[]) => void;
  setSelectedAudioInput: (deviceId: string) => void;
  setSelectedAudioOutput: (deviceId: string) => void;
  setSelectedVideoInput: (deviceId: string) => void;
  
  // Actions - Preferences
  updateUserPreferences: (preferences: Partial<UserPreferences>) => void;
  
  // Lifecycle
  reset: () => void;
}

const defaultPreferences: UserPreferences = {
  enableNoiseSuppression: true,
  enableEchoCancellation: true,
  enableAutoGainControl: true,
  defaultVideoQuality: 'auto',
};

const initialState = {
  localStream: null,
  screenStream: null,
  audioEnabled: true,
  videoEnabled: true,
  screenShareEnabled: false,
  audioInputDevices: [],
  audioOutputDevices: [],
  videoInputDevices: [],
  selectedAudioInput: null,
  selectedAudioOutput: null,
  selectedVideoInput: null,
  userPreferences: defaultPreferences,
};

export const useMediaStore = create<MediaStore>((set, get) => ({
  ...initialState,
  
  setLocalStream: (stream) => set({ localStream: stream }),
  setScreenStream: (stream) => set({ screenStream: stream }),
  
  setAudioEnabled: (enabled) => {
    const { localStream } = get();
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
    set({ audioEnabled: enabled });
  },
  
  setVideoEnabled: (enabled) => {
    const { localStream } = get();
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
    set({ videoEnabled: enabled });
  },
  
  setScreenShareEnabled: (enabled) => set({ screenShareEnabled: enabled }),
  
  toggleAudio: () => {
    const { audioEnabled } = get();
    get().setAudioEnabled(!audioEnabled);
  },
  
  toggleVideo: () => {
    const { videoEnabled } = get();
    get().setVideoEnabled(!videoEnabled);
  },
  
  toggleScreenShare: () => {
    const { screenShareEnabled } = get();
    get().setScreenShareEnabled(!screenShareEnabled);
  },
  
  setDevices: (devices) => {
    const audioInputDevices = devices
      .filter(d => d.kind === 'audioinput')
      .map(d => ({ deviceId: d.deviceId, label: d.label, kind: d.kind }));
    
    const audioOutputDevices = devices
      .filter(d => d.kind === 'audiooutput')
      .map(d => ({ deviceId: d.deviceId, label: d.label, kind: d.kind }));
    
    const videoInputDevices = devices
      .filter(d => d.kind === 'videoinput')
      .map(d => ({ deviceId: d.deviceId, label: d.label, kind: d.kind }));
    
    set({ audioInputDevices, audioOutputDevices, videoInputDevices });
    
    // Auto-select first device if none selected
    const state = get();
    const updates: Partial<MediaStore> = {};
    
    if (!state.selectedAudioInput && audioInputDevices.length > 0) {
      updates.selectedAudioInput = audioInputDevices[0].deviceId;
    }
    if (!state.selectedAudioOutput && audioOutputDevices.length > 0) {
      updates.selectedAudioOutput = audioOutputDevices[0].deviceId;
    }
    if (!state.selectedVideoInput && videoInputDevices.length > 0) {
      updates.selectedVideoInput = videoInputDevices[0].deviceId;
    }
    
    if (Object.keys(updates).length > 0) {
      set(updates);
    }
  },
  
  setSelectedAudioInput: (deviceId) => set({ selectedAudioInput: deviceId }),
  setSelectedAudioOutput: (deviceId) => set({ selectedAudioOutput: deviceId }),
  setSelectedVideoInput: (deviceId) => set({ selectedVideoInput: deviceId }),
  
  updateUserPreferences: (preferences) => set((state) => ({
    userPreferences: { ...state.userPreferences, ...preferences }
  })),
  
  reset: () => {
    // Clean up streams before resetting
    const { localStream, screenStream } = get();
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    if (screenStream) {
      screenStream.getTracks().forEach(track => track.stop());
    }
    
    set(initialState);
  },
}));