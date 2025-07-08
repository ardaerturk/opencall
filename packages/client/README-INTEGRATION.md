# OpenCall Video Meeting Integration

This document explains the integrated 2-person video call application implementation.

## Architecture Overview

The application consists of:

1. **HomePage** (`/`) - Landing page with options to create or join meetings
2. **MeetingPage** (`/meeting/:roomId`) - Main meeting interface with:
   - **MeetingLobby** - Pre-join screen for device setup and preview
   - **VideoGrid** - Displays local and remote video streams
   - **MediaControls** - Audio/video/screen share toggles and end call
   - **ConnectionStatus** - Shows WebRTC connection quality
   - **MeetingInfo** - Displays meeting ID, participant count, and duration

## Key Features

- **P2P WebRTC Communication**: Direct peer-to-peer video calls
- **Device Selection**: Choose camera and microphone before joining
- **Media Controls**: Toggle audio/video, share screen
- **Connection Management**: Automatic reconnection on network issues
- **Responsive Design**: Works on desktop and mobile devices

## How to Run

1. Start the signaling server:
   ```bash
   cd packages/server
   pnpm dev
   ```

2. Start the client application:
   ```bash
   cd packages/client
   pnpm dev
   ```

3. Open http://localhost:3003 in your browser

## User Flow

1. **Create Meeting**: Click "Create Meeting" on the home page
2. **Join Meeting**: Enter a room ID and click "Join Meeting"
3. **Pre-Join Lobby**: 
   - Enter your display name
   - Select camera and microphone
   - Preview your video
   - Configure audio/video settings
4. **In Meeting**:
   - See local and remote video streams
   - Control audio/video/screen share
   - Monitor connection quality
   - End call to leave

## WebRTC Integration

The application uses:
- **WebSocket** for signaling (offer/answer/ICE candidates)
- **Simple-peer** for WebRTC connection management
- **Zustand** stores for state management:
  - `connectionStore` - Meeting and socket state
  - `mediaStore` - Local media stream and device management
  - `peerStore` - Remote peer connections

## Configuration

- WebSocket URL: Set `VITE_WS_URL` in `.env.local`
- Default: `ws://localhost:3001`

## Next Steps

To enhance the application:
1. Add STUN/TURN server configuration for NAT traversal
2. Implement proper error handling and user feedback
3. Add meeting recording capabilities
4. Support for more than 2 participants
5. Add chat functionality
6. Implement virtual backgrounds
7. Add meeting scheduling and invitations