import React, { useEffect, useState } from 'react';
import { WebSocketProvider } from './hooks/useWebSocketContext';
import { WebSocketService } from './services/websocket';
import { EncryptedMeetingRoom } from './components/EncryptedMeetingRoom';

// Configuration - in production, these would come from environment variables
const WS_URL = process.env.REACT_APP_WS_URL || 'ws://localhost:3001';

function App() {
  const [wsService, setWsService] = useState<WebSocketService | null>(null);
  const [isConnecting, setIsConnecting] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  
  // URL parameters for demo purposes
  const urlParams = new URLSearchParams(window.location.search);
  const roomId = urlParams.get('room') || 'demo-room';
  const userId = urlParams.get('user') || `user-${Math.random().toString(36).substr(2, 9)}`;
  const displayName = urlParams.get('name') || 'Anonymous User';
  const enableEncryption = urlParams.get('encryption') !== 'false';

  useEffect(() => {
    // Initialize WebSocket connection
    const service = new WebSocketService(WS_URL);
    
    service.connect()
      .then(() => {
        console.log('WebSocket connected successfully');
        setWsService(service);
        setIsConnecting(false);
      })
      .catch((error) => {
        console.error('Failed to connect to WebSocket:', error);
        setConnectionError('Failed to connect to server. Please check if the server is running.');
        setIsConnecting(false);
      });

    // Cleanup on unmount
    return () => {
      service.disconnect();
    };
  }, []);

  if (isConnecting) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-white">Connecting to server...</p>
        </div>
      </div>
    );
  }

  if (connectionError) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <div className="bg-red-900 text-white p-6 rounded-lg max-w-md text-center">
          <h2 className="text-xl font-bold mb-2">Connection Error</h2>
          <p className="mb-4">{connectionError}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-red-700 hover:bg-red-600 rounded"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!wsService) {
    return null;
  }

  return (
    <WebSocketProvider value={wsService}>
      <div className="App">
        <EncryptedMeetingRoom
          roomId={roomId}
          userId={userId}
          displayName={displayName}
          enableEncryption={enableEncryption}
        />
      </div>
    </WebSocketProvider>
  );
}

export default App;
