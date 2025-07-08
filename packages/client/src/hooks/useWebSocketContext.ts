import { createContext, useContext } from 'react';
import { WebSocketService } from '../services/websocket';

const WebSocketContext = createContext<WebSocketService | null>(null);

export const WebSocketProvider = WebSocketContext.Provider;

export function useWebSocketContext(): WebSocketService {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return context;
}