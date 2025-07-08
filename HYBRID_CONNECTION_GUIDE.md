# Hybrid Connection Manager Guide

This document describes the hybrid connection system that seamlessly switches between P2P and SFU modes based on participant count and network conditions.

## Overview

The hybrid connection manager intelligently manages WebRTC connections, automatically switching between:
- **P2P mode** for 2-3 participants (lower latency, better privacy)
- **SFU mode** for 4+ participants (better scalability, bandwidth efficiency)

## Architecture

### Server Components

#### HybridMeeting Class
Located in `packages/server/src/meetings/HybridMeeting.ts`

Key features:
- Automatic mode detection based on participant count
- Seamless transitions without call interruption
- Connection quality monitoring
- Pre-warming of SFU resources
- Fallback mechanisms for failed transitions

#### ConnectionManager
Located in `packages/server/src/connection/ConnectionManager.ts`

- Creates and manages HybridMeeting instances
- Handles mediasoup worker allocation
- Forwards transition events to SignalingHandler

### Client Components

#### HybridConnectionService
Located in `packages/client/src/services/hybridConnection.ts`

Manages:
- Mode transition coordination
- Quality metrics collection
- Stream continuity during transitions
- Client-side state synchronization

#### HybridConnectionIndicator UI
Located in `packages/client/src/components/meeting/HybridConnectionIndicator/`

Displays:
- Current connection mode
- Transition progress
- Connection quality metrics
- Participant count

## Mode Switching Logic

### P2P to SFU Transition
Triggered when:
1. 4th participant joins
2. Connection quality degrades in P2P mode with 3 participants

### SFU to P2P Transition
Triggered when:
1. Participants drop to 3 or fewer
2. At least 10 seconds have passed since last transition (prevents flapping)

## Transition Process

1. **Pre-transition**
   - Save current media states
   - Pause quality monitoring
   - Notify all clients

2. **During transition**
   - Create new meeting instance (P2P or SFU)
   - Transfer participant states
   - Maintain stream continuity
   - Show progress to users

3. **Post-transition**
   - Clean up old connections
   - Resume quality monitoring
   - Update UI indicators

## Quality Monitoring

The system continuously monitors:
- Bitrate
- Packet loss
- Round-trip time (RTT)
- Jitter

Poor quality thresholds:
- Packet loss > 5%
- RTT > 200ms
- Bitrate < 100kbps

## Configuration

### Environment Variables

Server:
```bash
MEDIASOUP_NUM_WORKERS=4  # Number of mediasoup workers
MEDIASOUP_LISTEN_IP=0.0.0.0
MEDIASOUP_ANNOUNCED_IP=<public-ip>  # For production
```

Client:
```bash
VITE_WS_URL=ws://localhost:8080  # WebSocket server URL
```

### Constants

In `packages/core/src/constants.ts`:
- `P2P_PARTICIPANT_LIMIT`: Maximum participants for P2P mode (default: 3)

## Usage Example

```typescript
// Client-side implementation
import { useHybridConnection } from './hooks/useHybridConnection';

function MeetingComponent() {
  const {
    mode,
    isTransitioning,
    quality,
    joinRoom,
    participantCount
  } = useHybridConnection({
    serverUrl: 'ws://localhost:8080',
    enableAudio: true,
    enableVideo: true
  });

  // Mode automatically switches based on participant count
  // UI updates to show current mode and transition status
}
```

## Performance Considerations

1. **Pre-warming**: SFU resources are pre-warmed when P2P meeting has 3 participants
2. **Transition time**: Target < 2 seconds for mode switches
3. **State preservation**: All media states, chat history, and user preferences preserved
4. **Bandwidth optimization**: SFU mode uses simulcast for efficient bandwidth usage

## Edge Cases Handled

1. **Rapid join/leave**: Minimum time between transitions prevents mode flapping
2. **Failed transitions**: Automatic fallback to previous mode
3. **Network interruptions**: Connection recovery with state refresh
4. **Resource exhaustion**: Graceful degradation when workers unavailable

## Monitoring and Debugging

The system emits events for monitoring:
- `meeting:transition:started`
- `meeting:transition:completed`
- `meeting:transition:failed`
- `quality-update`

Enable debug logging:
```bash
DEBUG=opencall:* npm start
```

## Future Enhancements

1. **Machine learning**: Predict optimal switching points based on historical data
2. **Regional optimization**: Choose mode based on geographic distribution
3. **Custom thresholds**: Allow per-meeting configuration of switching rules
4. **Advanced metrics**: Add video quality assessment (VMAF scores)