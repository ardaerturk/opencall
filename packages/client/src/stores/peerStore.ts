import { create } from 'zustand';
import type { Instance } from 'simple-peer';
import { ParticipantMedia } from '@opencall/core';

export interface PeerInfo {
  peerId: string;
  userId?: string;
  displayName?: string;
  connection?: Instance;
  connected: boolean;
  initiator: boolean;
  remoteStream?: MediaStream;
  localStream?: MediaStream;
  encrypted?: boolean;
}

interface PeerStore {
  // Current user
  currentPeerId: string | null;
  currentUserId: string | null;
  
  // Peers
  peers: Map<string, PeerInfo>;
  
  // Media tracks
  participantMedia: Map<string, ParticipantMedia>;
  
  // Actions
  setCurrentPeerId: (peerId: string | null) => void;
  setCurrentUserId: (userId: string | null) => void;
  
  // Peer management
  addPeer: (peerId: string, info: Omit<PeerInfo, 'peerId'>) => void;
  updatePeer: (peerId: string, updates: Partial<PeerInfo>) => void;
  removePeer: (peerId: string) => void;
  getPeer: (peerId: string) => PeerInfo | undefined;
  
  // Media management
  setParticipantMedia: (participantId: string, media: ParticipantMedia) => void;
  removeParticipantMedia: (participantId: string) => void;
  
  // Lifecycle
  reset: () => void;
}

const initialState = {
  currentPeerId: null,
  currentUserId: null,
  peers: new Map<string, PeerInfo>(),
  participantMedia: new Map<string, ParticipantMedia>(),
};

export { type PeerInfo };

export const usePeerStore = create<PeerStore>((set, get) => ({
  ...initialState,
  
  setCurrentPeerId: (peerId) => set({ currentPeerId: peerId }),
  setCurrentUserId: (userId) => set({ currentUserId: userId }),
  
  addPeer: (peerId, info) => set((state) => {
    const newPeers = new Map(state.peers);
    newPeers.set(peerId, { peerId, ...info });
    return { peers: newPeers };
  }),
  
  updatePeer: (peerId, updates) => set((state) => {
    const newPeers = new Map(state.peers);
    const existing = newPeers.get(peerId);
    if (existing) {
      newPeers.set(peerId, { ...existing, ...updates });
    }
    return { peers: newPeers };
  }),
  
  removePeer: (peerId) => set((state) => {
    const newPeers = new Map(state.peers);
    const peer = newPeers.get(peerId);
    
    // Clean up peer connection
    if (peer?.connection) {
      peer.connection.destroy();
    }
    
    newPeers.delete(peerId);
    
    // Also remove participant media
    const newParticipantMedia = new Map(state.participantMedia);
    newParticipantMedia.delete(peerId);
    
    return { peers: newPeers, participantMedia: newParticipantMedia };
  }),
  
  getPeer: (peerId) => {
    return get().peers.get(peerId);
  },
  
  setParticipantMedia: (participantId, media) => set((state) => {
    const newParticipantMedia = new Map(state.participantMedia);
    newParticipantMedia.set(participantId, media);
    return { participantMedia: newParticipantMedia };
  }),
  
  removeParticipantMedia: (participantId) => set((state) => {
    const newParticipantMedia = new Map(state.participantMedia);
    newParticipantMedia.delete(participantId);
    return { participantMedia: newParticipantMedia };
  }),
  
  reset: () => {
    // Clean up all peer connections before resetting
    get().peers.forEach((peer) => {
      if (peer.connection) {
        peer.connection.destroy();
      }
    });
    
    set(initialState);
  },
}));