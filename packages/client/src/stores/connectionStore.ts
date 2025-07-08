import { create } from 'zustand';
import { MeetingState } from '@opencall/core';

export type ConnectionMode = 'p2p' | 'sfu';

interface ConnectionStore {
  // Meeting state
  meetingState: MeetingState;
  connectionMode: ConnectionMode;
  
  // WebSocket connection
  socketConnected: boolean;
  socketUrl: string | null;
  
  // Actions
  setMeetingState: (state: MeetingState) => void;
  setConnectionMode: (mode: ConnectionMode) => void;
  setSocketConnected: (connected: boolean) => void;
  setSocketUrl: (url: string | null) => void;
  
  // Lifecycle
  reset: () => void;
}

const initialState = {
  meetingState: { type: 'idle' } as MeetingState,
  connectionMode: 'p2p' as ConnectionMode,
  socketConnected: false,
  socketUrl: null,
};

export const useConnectionStore = create<ConnectionStore>((set) => ({
  ...initialState,
  
  setMeetingState: (state) => set({ meetingState: state }),
  setConnectionMode: (mode) => set({ connectionMode: mode }),
  setSocketConnected: (connected) => set({ socketConnected: connected }),
  setSocketUrl: (url) => set({ socketUrl: url }),
  
  reset: () => set(initialState),
}));