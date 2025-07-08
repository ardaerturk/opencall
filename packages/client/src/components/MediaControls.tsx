import { useMediaControls } from '../hooks/useMediaControls';
import { useDevices } from '../hooks/useDevices';

export function MediaControls() {
  const {
    audioEnabled,
    videoEnabled,
    screenShareEnabled,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    switchAudioInput,
    switchVideoInput,
    switchAudioOutput,
  } = useMediaControls();

  const {
    audioInputs,
    audioOutputs,
    videoInputs,
    selectedAudioInput,
    selectedAudioOutput,
    selectedVideoInput,
  } = useDevices();

  const buttonStyle = {
    padding: '10px 20px',
    margin: '5px',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontSize: '16px',
    transition: 'all 0.2s',
  };

  const activeStyle = {
    ...buttonStyle,
    background: '#4CAF50',
    color: 'white',
  };

  const inactiveStyle = {
    ...buttonStyle,
    background: '#f44336',
    color: 'white',
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: '10px',
      padding: '20px',
      background: '#f5f5f5',
      borderRadius: '8px',
    }}>
      {/* Main controls */}
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
        <button
          onClick={toggleAudio}
          style={audioEnabled ? activeStyle : inactiveStyle}
        >
          {audioEnabled ? '🎤 Mute' : '🔇 Unmute'}
        </button>
        
        <button
          onClick={toggleVideo}
          style={videoEnabled ? activeStyle : inactiveStyle}
        >
          {videoEnabled ? '📹 Stop Video' : '📷 Start Video'}
        </button>
        
        <button
          onClick={toggleScreenShare}
          style={screenShareEnabled ? activeStyle : buttonStyle}
        >
          {screenShareEnabled ? '🖥️ Stop Sharing' : '🖥️ Share Screen'}
        </button>
      </div>

      {/* Device selectors */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
        {/* Audio Input */}
        {audioInputs.length > 0 && (
          <div>
            <label style={{ fontSize: '14px', marginRight: '5px' }}>
              Microphone:
            </label>
            <select
              value={selectedAudioInput || ''}
              onChange={(e) => switchAudioInput(e.target.value)}
              style={{ padding: '5px', borderRadius: '4px', border: '1px solid #ccc' }}
            >
              {audioInputs.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Microphone ${device.deviceId.slice(0, 5)}`}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Video Input */}
        {videoInputs.length > 0 && (
          <div>
            <label style={{ fontSize: '14px', marginRight: '5px' }}>
              Camera:
            </label>
            <select
              value={selectedVideoInput || ''}
              onChange={(e) => switchVideoInput(e.target.value)}
              style={{ padding: '5px', borderRadius: '4px', border: '1px solid #ccc' }}
            >
              {videoInputs.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Camera ${device.deviceId.slice(0, 5)}`}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Audio Output */}
        {audioOutputs.length > 0 && (
          <div>
            <label style={{ fontSize: '14px', marginRight: '5px' }}>
              Speaker:
            </label>
            <select
              value={selectedAudioOutput || ''}
              onChange={(e) => switchAudioOutput(e.target.value)}
              style={{ padding: '5px', borderRadius: '4px', border: '1px solid #ccc' }}
            >
              {audioOutputs.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Speaker ${device.deviceId.slice(0, 5)}`}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}