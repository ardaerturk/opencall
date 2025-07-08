import { useRef, useEffect, useCallback, useState } from 'react';
import { ReconnectionManager } from '../services/reconnectionManager';
import { WebSocketService } from '../services/websocket';
import { PeerConnectionService } from '../services/peerConnection';
import { useConnectionStore } from '../stores/connectionStore';

export interface UseReconnectionOptions {
  enabled?: boolean;
  maxAttempts?: number;
  onReconnectStart?: () => void;
  onReconnectSuccess?: () => void;
  onReconnectFail?: (error: Error) => void;
}

export interface UseReconnectionResult {
  isReconnecting: boolean;
  reconnectAttempts: number;
  nextReconnectDelay: number;
  stopReconnection: () => void;
  triggerReconnection: () => void;
}

export function useReconnection(
  wsService: WebSocketService | null,
  peerService: PeerConnectionService | null,
  options: UseReconnectionOptions = {}
): UseReconnectionResult {
  const {
    enabled = true,
    maxAttempts = 5,
    onReconnectStart,
    onReconnectSuccess,
    onReconnectFail,
  } = options;

  const reconnectionManagerRef = useRef<ReconnectionManager | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [nextReconnectDelay, setNextReconnectDelay] = useState(0);

  const meetingState = useConnectionStore((state) => state.meetingState);

  // Initialize reconnection manager
  useEffect(() => {
    if (!enabled) return;

    reconnectionManagerRef.current = new ReconnectionManager({ maxAttempts });
    
    reconnectionManagerRef.current.setCallbacks({
      onStart: () => {
        setIsReconnecting(true);
        onReconnectStart?.();
      },
      onSuccess: () => {
        setIsReconnecting(false);
        setReconnectAttempts(0);
        setNextReconnectDelay(0);
        onReconnectSuccess?.();
      },
      onFail: (error) => {
        setIsReconnecting(false);
        onReconnectFail?.(error);
      },
    });

    // Update state periodically during reconnection
    const interval = setInterval(() => {
      if (reconnectionManagerRef.current?.isActive()) {
        setReconnectAttempts(reconnectionManagerRef.current.getAttemptCount());
        setNextReconnectDelay(reconnectionManagerRef.current.getNextDelay());
      }
    }, 100);

    return () => {
      clearInterval(interval);
      reconnectionManagerRef.current?.stopReconnection();
    };
  }, [enabled, maxAttempts, onReconnectStart, onReconnectSuccess, onReconnectFail]);

  // Monitor WebSocket disconnection
  useEffect(() => {
    if (!enabled || !wsService || !peerService || !reconnectionManagerRef.current) return;

    const handleDisconnect = () => {
      // Only reconnect if we were in a connected state
      if (meetingState.type === 'connected') {
        const roomId = meetingState.meetingId;
        reconnectionManagerRef.current!.startReconnection(wsService, peerService, roomId);
      }
    };

    wsService.onDisconnected(handleDisconnect);
  }, [enabled, wsService, peerService, meetingState]);

  // Stop reconnection
  const stopReconnection = useCallback(() => {
    reconnectionManagerRef.current?.stopReconnection();
    setIsReconnecting(false);
    setReconnectAttempts(0);
    setNextReconnectDelay(0);
  }, []);

  // Manually trigger reconnection
  const triggerReconnection = useCallback(() => {
    if (!wsService || !peerService || !reconnectionManagerRef.current) return;
    
    if (meetingState.type === 'connected' || meetingState.type === 'error') {
      const roomId = meetingState.type === 'connected' ? meetingState.meetingId : null;
      if (roomId) {
        reconnectionManagerRef.current.startReconnection(wsService, peerService, roomId);
      }
    }
  }, [wsService, peerService, meetingState]);

  return {
    isReconnecting,
    reconnectAttempts,
    nextReconnectDelay,
    stopReconnection,
    triggerReconnection,
  };
}