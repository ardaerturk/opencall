import React, { useState, useEffect, useRef } from 'react';
import { useEncryptedWebRTC } from '../hooks/useEncryptedWebRTC';
import { usePeers } from '../hooks/usePeers';
import { useMediaStore } from '../stores/mediaStore';
import { EncryptionIndicator, PeerEncryptionIndicator } from './EncryptionIndicator';
import { performanceMonitor } from '../services/encryption';

interface EncryptedMeetingRoomProps {
  roomId: string;
  userId: string;
  displayName: string;
  enableEncryption?: boolean;
}

export const EncryptedMeetingRoom: React.FC<EncryptedMeetingRoomProps> = ({
  roomId,
  userId,
  displayName,
  enableEncryption = true
}) => {
  const [isJoined, setIsJoined] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [performanceStats, setPerformanceStats] = useState<any>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);

  const {
    isConnected,
    isEncrypted,
    encryptionStatus,
    connect,
    disconnect,
    toggleAudio,
    toggleVideo,
    isAudioEnabled,
    isVideoEnabled,
    error
  } = useEncryptedWebRTC({
    roomId,
    userId,
    displayName,
    enableEncryption,
    onPeerJoined: (peerId) => {
      console.log('Peer joined:', peerId);
    },
    onPeerLeft: (peerId) => {
      console.log('Peer left:', peerId);
    },
    onError: (error) => {
      console.error('WebRTC error:', error);
    },
    onEncryptionStatus: (status) => {
      console.log('Encryption status updated:', status);
    }
  });

  const { connectedPeers } = usePeers();
  const { localStream } = useMediaStore();

  // Update local video when stream changes
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Performance monitoring
  useEffect(() => {
    if (isEncrypted && showStats) {
      const interval = setInterval(() => {
        const stats = performanceMonitor.getMetrics();
        setPerformanceStats(stats);
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [isEncrypted, showStats]);

  const handleJoin = async () => {
    try {
      await connect();
      setIsJoined(true);
    } catch (error) {
      console.error('Failed to join meeting:', error);
    }
  };

  const handleLeave = () => {
    disconnect();
    setIsJoined(false);
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <div className="bg-red-900 text-white p-6 rounded-lg max-w-md">
          <h2 className="text-xl font-bold mb-2">Connection Error</h2>
          <p>{error.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-red-700 hover:bg-red-600 rounded"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  if (!isJoined) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <div className="bg-gray-800 p-8 rounded-lg shadow-lg max-w-md w-full">
          <h1 className="text-2xl font-bold text-white mb-6 text-center">
            Join Encrypted Meeting
          </h1>
          
          <div className="mb-4">
            <label className="block text-gray-300 mb-2">Room ID</label>
            <input
              type="text"
              value={roomId}
              disabled
              className="w-full px-3 py-2 bg-gray-700 text-gray-300 rounded"
            />
          </div>
          
          <div className="mb-4">
            <label className="block text-gray-300 mb-2">Display Name</label>
            <input
              type="text"
              value={displayName}
              disabled
              className="w-full px-3 py-2 bg-gray-700 text-gray-300 rounded"
            />
          </div>
          
          <div className="mb-6">
            <label className="flex items-center text-gray-300">
              <input
                type="checkbox"
                checked={enableEncryption}
                disabled
                className="mr-2"
              />
              Enable End-to-End Encryption
            </label>
            {!encryptionStatus.supported && (
              <p className="text-sm text-yellow-500 mt-1">
                Your browser doesn't support encryption features
              </p>
            )}
          </div>
          
          <button
            onClick={handleJoin}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded transition duration-200"
          >
            Join Meeting
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="bg-gray-800 p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-white font-medium">Room: {roomId}</h1>
          <EncryptionIndicator status={encryptionStatus} showDetails />
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowStats(!showStats)}
            className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded"
          >
            {showStats ? 'Hide' : 'Show'} Stats
          </button>
          
          <button
            onClick={handleLeave}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded"
          >
            Leave Meeting
          </button>
        </div>
      </div>
      
      {/* Main content */}
      <div className="flex-1 flex">
        {/* Video grid */}
        <div className="flex-1 p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 h-full">
            {/* Local video */}
            <div className="relative bg-gray-800 rounded-lg overflow-hidden">
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 px-2 py-1 rounded text-white text-sm">
                You ({displayName})
              </div>
              {isEncrypted && <PeerEncryptionIndicator isEncrypted={true} peerId="local" />}
            </div>
            
            {/* Remote peers */}
            {connectedPeers.map(peer => (
              <div key={peer.peerId} className="relative bg-gray-800 rounded-lg overflow-hidden">
                {peer.remoteStream && (
                  <video
                    autoPlay
                    playsInline
                    ref={(video) => {
                      if (video && peer.remoteStream) video.srcObject = peer.remoteStream;
                    }}
                    className="w-full h-full object-cover"
                  />
                )}
                <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 px-2 py-1 rounded text-white text-sm">
                  {peer.displayName || peer.peerId}
                </div>
                <PeerEncryptionIndicator 
                  isEncrypted={peer.encrypted || false} 
                  peerId={peer.peerId} 
                />
              </div>
            ))}
          </div>
        </div>
        
        {/* Stats panel */}
        {showStats && performanceStats && (
          <div className="w-80 bg-gray-800 p-4 overflow-y-auto">
            <h2 className="text-white font-medium mb-4">Performance Stats</h2>
            
            <div className="space-y-3 text-sm">
              <div className="bg-gray-700 p-3 rounded">
                <div className="text-gray-400">Frames Processed</div>
                <div className="text-white font-mono">{performanceStats.frameCount}</div>
              </div>
              
              <div className="bg-gray-700 p-3 rounded">
                <div className="text-gray-400">Avg Encryption Time</div>
                <div className={`font-mono ${performanceStats.avgEncryptionTime > 10 ? 'text-red-400' : 'text-green-400'}`}>
                  {performanceStats.avgEncryptionTime.toFixed(2)}ms
                </div>
              </div>
              
              <div className="bg-gray-700 p-3 rounded">
                <div className="text-gray-400">Avg Decryption Time</div>
                <div className={`font-mono ${performanceStats.avgDecryptionTime > 10 ? 'text-red-400' : 'text-green-400'}`}>
                  {performanceStats.avgDecryptionTime.toFixed(2)}ms
                </div>
              </div>
              
              <div className="bg-gray-700 p-3 rounded">
                <div className="text-gray-400">Max Encryption Time</div>
                <div className={`font-mono ${performanceStats.maxEncryptionTime > 10 ? 'text-red-400' : 'text-green-400'}`}>
                  {performanceStats.maxEncryptionTime.toFixed(2)}ms
                </div>
              </div>
              
              <div className="bg-gray-700 p-3 rounded">
                <div className="text-gray-400">Max Decryption Time</div>
                <div className={`font-mono ${performanceStats.maxDecryptionTime > 10 ? 'text-red-400' : 'text-green-400'}`}>
                  {performanceStats.maxDecryptionTime.toFixed(2)}ms
                </div>
              </div>
              
              <div className="bg-gray-700 p-3 rounded">
                <div className="text-gray-400">Dropped Frames</div>
                <div className={`font-mono ${performanceStats.droppedFrames > 0 ? 'text-red-400' : 'text-green-400'}`}>
                  {performanceStats.droppedFrames}
                </div>
              </div>
              
              <div className="bg-gray-700 p-3 rounded">
                <div className="text-gray-400">Encryption Overhead</div>
                <div className="text-white font-mono">
                  {(performanceStats.avgEncryptionTime + performanceStats.avgDecryptionTime).toFixed(2)}ms
                </div>
              </div>
            </div>
            
            {(performanceStats.avgEncryptionTime + performanceStats.avgDecryptionTime) > 10 && (
              <div className="mt-4 p-3 bg-yellow-900 text-yellow-300 rounded text-sm">
                Warning: Encryption overhead exceeds 10ms target
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Controls */}
      <div className="bg-gray-800 p-4 flex justify-center gap-4">
        <button
          onClick={toggleAudio}
          className={`p-3 rounded-full ${
            isAudioEnabled ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-600 hover:bg-red-700'
          } text-white transition duration-200`}
        >
          {isAudioEnabled ? (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            </svg>
          )}
        </button>
        
        <button
          onClick={toggleVideo}
          className={`p-3 rounded-full ${
            isVideoEnabled ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-600 hover:bg-red-700'
          } text-white transition duration-200`}
        >
          {isVideoEnabled ? (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
};