import { useConnectionStore } from '../stores/connectionStore';
import { usePeers } from '../hooks/usePeers';

export function ConnectionStatus() {
  const meetingState = useConnectionStore((state) => state.meetingState);
  const socketConnected = useConnectionStore((state) => state.socketConnected);
  const { connectedCount, peerCount } = usePeers();

  const getStatusColor = () => {
    if (meetingState.type === 'error') return '#ff4444';
    if (meetingState.type === 'connected') return '#44ff44';
    if (meetingState.type === 'connecting') return '#ffaa44';
    return '#888888';
  };

  const getStatusText = () => {
    switch (meetingState.type) {
      case 'idle':
        return 'Not in a call';
      case 'connecting':
        return 'Connecting...';
      case 'connected':
        return `Connected (${connectedCount}/${peerCount} peers)`;
      case 'error':
        return `Error: ${meetingState.error}`;
      default:
        return 'Unknown';
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '10px',
      background: '#f0f0f0',
      borderRadius: '5px',
      fontSize: '14px',
    }}>
      <div style={{
        width: '10px',
        height: '10px',
        borderRadius: '50%',
        background: socketConnected ? '#44ff44' : '#ff4444',
      }} />
      <span>WebSocket: {socketConnected ? 'Connected' : 'Disconnected'}</span>
      
      <div style={{
        width: '10px',
        height: '10px',
        borderRadius: '50%',
        background: getStatusColor(),
        marginLeft: '20px',
      }} />
      <span>{getStatusText()}</span>
    </div>
  );
}