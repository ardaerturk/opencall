import { useMemo } from 'react';
import { usePeerStore, PeerInfo } from '../stores/peerStore';
import { ParticipantMedia } from '@opencall/core';

export interface PeerWithMedia extends PeerInfo {
  media?: ParticipantMedia;
}

export interface UsePeersResult {
  peers: Map<string, PeerWithMedia>;
  connectedPeers: PeerWithMedia[];
  peerCount: number;
  connectedCount: number;
  currentPeerId: string | null;
  currentUserId: string | null;
  getPeerById: (peerId: string) => PeerWithMedia | undefined;
  getMediaByPeerId: (peerId: string) => ParticipantMedia | undefined;
}

export function usePeers(): UsePeersResult {
  const {
    peers,
    participantMedia,
    currentPeerId,
    currentUserId,
    getPeer,
  } = usePeerStore();

  // Combine peers with their media
  const peersWithMedia = useMemo(() => {
    const combined = new Map<string, PeerWithMedia>();
    
    peers.forEach((peer, peerId) => {
      const media = participantMedia.get(peerId);
      combined.set(peerId, {
        ...peer,
        media,
      });
    });
    
    return combined;
  }, [peers, participantMedia]);

  // Get only connected peers
  const connectedPeers = useMemo(() => {
    return Array.from(peersWithMedia.values()).filter(peer => peer.connected);
  }, [peersWithMedia]);

  // Count statistics
  const peerCount = peers.size;
  const connectedCount = connectedPeers.length;

  // Get peer by ID with media
  const getPeerById = (peerId: string): PeerWithMedia | undefined => {
    const peer = getPeer(peerId);
    if (!peer) return undefined;
    
    const media = participantMedia.get(peerId);
    return {
      ...peer,
      media,
    };
  };

  // Get media by peer ID
  const getMediaByPeerId = (peerId: string): ParticipantMedia | undefined => {
    return participantMedia.get(peerId);
  };

  return {
    peers: peersWithMedia,
    connectedPeers,
    peerCount,
    connectedCount,
    currentPeerId,
    currentUserId,
    getPeerById,
    getMediaByPeerId,
  };
}