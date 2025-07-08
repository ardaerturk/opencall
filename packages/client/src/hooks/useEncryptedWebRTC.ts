import { useState, useEffect, useCallback, useRef } from 'react';
import { useWebSocketContext } from './useWebSocketContext';
import { useConnectionStore } from '../stores/connectionStore';
import { usePeerStore } from '../stores/peerStore';
import { useMediaStore } from '../stores/mediaStore';
import { EncryptedPeerConnectionService } from '../services/encryptedPeerConnectionService';
import { SignalData } from '../services/websocket';
import { ConnectionConfig } from '@opencall/core';

export interface UseEncryptedWebRTCOptions {
  roomId: string;
  userId: string;
  displayName?: string;
  config?: ConnectionConfig;
  enableEncryption?: boolean;
  onPeerJoined?: (peerId: string) => void;
  onPeerLeft?: (peerId: string) => void;
  onError?: (error: Error) => void;
  onEncryptionStatus?: (status: EncryptionStatus) => void;
}

export interface EncryptionStatus {
  enabled: boolean;
  supported: boolean;
  groupId: string | null;
  memberCount: number;
  currentEpoch: number;
  failureReason?: string;
}

export interface UseEncryptedWebRTCResult {
  isConnected: boolean;
  isEncrypted: boolean;
  encryptionStatus: EncryptionStatus;
  connect: () => Promise<void>;
  disconnect: () => void;
  toggleAudio: () => void;
  toggleVideo: () => void;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  error: Error | null;
}

export function useEncryptedWebRTC(options: UseEncryptedWebRTCOptions): UseEncryptedWebRTCResult {
  const { roomId, userId, displayName, config, enableEncryption = true, onPeerJoined, onPeerLeft, onError, onEncryptionStatus } = options;
  
  const wsService = useWebSocketContext();
  const connectionStore = useConnectionStore();
  const peerStore = usePeerStore();
  const mediaStore = useMediaStore();
  
  const [encryptionStatus, setEncryptionStatus] = useState<EncryptionStatus>({
    enabled: false,
    supported: false,
    groupId: null,
    memberCount: 0,
    currentEpoch: 0
  });
  const [error, setError] = useState<Error | null>(null);
  
  const peerServiceRef = useRef<EncryptedPeerConnectionService | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Check if encryption is supported
  useEffect(() => {
    const supported = 'RTCRtpScriptTransform' in window || 
                     (typeof RTCRtpSender !== 'undefined' && 'createEncodedStreams' in RTCRtpSender.prototype);
    
    setEncryptionStatus(prev => ({ ...prev, supported }));
  }, []);

  // Initialize peer connection service
  useEffect(() => {
    if (wsService && !peerServiceRef.current) {
      peerServiceRef.current = new EncryptedPeerConnectionService(
        wsService,
        config,
        {
          enableEncryption: enableEncryption && encryptionStatus.supported,
          encryptionFallback: true
        }
      );
    }
  }, [wsService, config, enableEncryption, encryptionStatus.supported]);

  // Handle signaling
  useEffect(() => {
    if (!wsService || !peerServiceRef.current) return;

    const handleOffer = async (data: SignalData) => {
      if (data.type === 'offer' && data.roomId === roomId) {
        await peerServiceRef.current!.handleSignal(data);
      }
    };

    const handleAnswer = async (data: SignalData) => {
      if (data.type === 'answer' && data.roomId === roomId) {
        await peerServiceRef.current!.handleSignal(data);
      }
    };

    const handleIceCandidate = async (data: SignalData) => {
      if (data.type === 'ice-candidate' && data.roomId === roomId) {
        await peerServiceRef.current!.handleSignal(data);
      }
    };

    const handleKeyExchange = async (data: SignalData) => {
      if (data.type === 'key-exchange' && data.roomId === roomId) {
        await peerServiceRef.current!.handleSignal(data);
      }
    };

    const handlePeerJoined = async (data: any) => {
      if (data.roomId === roomId && data.peerId !== peerStore.currentPeerId) {
        console.log('Peer joined:', data.peerId);
        
        // Connect to new peer
        await peerServiceRef.current!.connectToPeer(data.peerId, {
          userId: data.userId,
          displayName: data.displayName
        });
        
        onPeerJoined?.(data.peerId);
        updateEncryptionStatus();
      }
    };

    const handlePeerLeft = (data: any) => {
      if (data.roomId === roomId) {
        console.log('Peer left:', data.peerId);
        peerServiceRef.current!.disconnectFromPeer(data.peerId);
        onPeerLeft?.(data.peerId);
        updateEncryptionStatus();
      }
    };

    wsService.on('offer', handleOffer);
    wsService.on('answer', handleAnswer);
    wsService.on('ice-candidate', handleIceCandidate);
    wsService.on('key-exchange', handleKeyExchange);
    wsService.on('peer-joined', handlePeerJoined);
    wsService.on('peer-left', handlePeerLeft);

    cleanupRef.current = () => {
      wsService.off('offer', handleOffer);
      wsService.off('answer', handleAnswer);
      wsService.off('ice-candidate', handleIceCandidate);
      wsService.off('key-exchange', handleKeyExchange);
      wsService.off('peer-joined', handlePeerJoined);
      wsService.off('peer-left', handlePeerLeft);
    };

    return () => {
      cleanupRef.current?.();
    };
  }, [wsService, roomId, onPeerJoined, onPeerLeft, peerStore.currentPeerId]);

  const updateEncryptionStatus = useCallback(async () => {
    if (!peerServiceRef.current) return;

    const stats = await peerServiceRef.current.getEncryptionStats();
    
    setEncryptionStatus(prev => ({
      ...prev,
      enabled: stats.enabled,
      groupId: stats.groupId,
      memberCount: stats.memberCount,
      currentEpoch: stats.currentEpoch
    }));

    onEncryptionStatus?.(encryptionStatus);
  }, [encryptionStatus, onEncryptionStatus]);

  const connect = useCallback(async () => {
    try {
      if (!wsService || !peerServiceRef.current) {
        throw new Error('WebSocket service not initialized');
      }

      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true
      });
      
      mediaStore.setLocalStream(stream);
      mediaStore.setAudioEnabled(true);
      mediaStore.setVideoEnabled(true);

      // Initialize encryption and join room
      await peerServiceRef.current.initialize(userId, roomId);
      
      // Set peer ID
      const peerId = `${userId}-${Date.now()}`;
      peerStore.setCurrentPeerId(peerId);
      peerStore.setCurrentUserId(userId);

      // Join room via WebSocket
      wsService.send({
        type: 'join',
        roomId,
        peerId,
        userId,
        displayName,
        timestamp: Date.now()
      });

      connectionStore.setConnected(true);
      
      // Update encryption status
      await updateEncryptionStatus();
      
    } catch (err) {
      const error = err as Error;
      console.error('Failed to connect:', error);
      setError(error);
      onError?.(error);
      
      // Update encryption status with failure
      setEncryptionStatus(prev => ({
        ...prev,
        failureReason: error.message
      }));
    }
  }, [wsService, roomId, userId, displayName, connectionStore, peerStore, mediaStore, updateEncryptionStatus, onError]);

  const disconnect = useCallback(() => {
    // Leave room
    if (wsService && connectionStore.isConnected) {
      wsService.send({
        type: 'leave',
        roomId,
        peerId: peerStore.currentPeerId!,
        timestamp: Date.now()
      });
    }

    // Clean up peer connections
    peerServiceRef.current?.cleanup();

    // Stop local media
    const localStream = mediaStore.localStream;
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }

    // Reset stores
    connectionStore.reset();
    peerStore.reset();
    mediaStore.reset();
    
    setEncryptionStatus({
      enabled: false,
      supported: encryptionStatus.supported,
      groupId: null,
      memberCount: 0,
      currentEpoch: 0
    });
  }, [wsService, roomId, connectionStore, peerStore, mediaStore, encryptionStatus.supported]);

  const toggleAudio = useCallback(() => {
    const localStream = mediaStore.localStream;
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        mediaStore.setAudioEnabled(audioTrack.enabled);
      }
    }
  }, [mediaStore]);

  const toggleVideo = useCallback(() => {
    const localStream = mediaStore.localStream;
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        mediaStore.setVideoEnabled(videoTrack.enabled);
      }
    }
  }, [mediaStore]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (connectionStore.isConnected) {
        disconnect();
      }
    };
  }, []);

  return {
    isConnected: connectionStore.isConnected,
    isEncrypted: encryptionStatus.enabled,
    encryptionStatus,
    connect,
    disconnect,
    toggleAudio,
    toggleVideo,
    isAudioEnabled: mediaStore.isAudioEnabled,
    isVideoEnabled: mediaStore.isVideoEnabled,
    error
  };
}