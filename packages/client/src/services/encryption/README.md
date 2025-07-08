# OpenCall End-to-End Encryption

This directory contains the implementation of end-to-end encryption for OpenCall using the MLS (Message Layer Security) protocol and WebRTC Encoded Transform (formerly Insertable Streams).

## Architecture Overview

### Core Components

1. **MLSEncryptionService** - Manages MLS groups, key distribution, and rotation
2. **FrameEncryptor/FrameDecryptor** - Handles frame-level encryption/decryption
3. **EncryptedPeerConnection** - WebRTC peer connection with encryption support
4. **Performance Monitor** - Tracks encryption overhead and performance metrics

### How It Works

1. **Initialization**: When a user joins a meeting, an MLS group is created or joined
2. **Key Exchange**: MLS key packages are exchanged during peer connection setup
3. **Frame Encryption**: Video/audio frames are encrypted using AES-GCM before transmission
4. **Frame Decryption**: Received frames are decrypted using the sender's key
5. **Key Rotation**: Keys are automatically rotated when members join/leave

### Frame Format

Each encrypted frame has a 26-byte header:
```
[1 byte: version] [1 byte: keyId] [8 bytes: senderId hash] [4 bytes: timestamp] [12 bytes: IV]
```

## Usage

### Basic Setup

```typescript
import { useEncryptedWebRTC } from './hooks/useEncryptedWebRTC';

function VideoCall() {
  const {
    isConnected,
    isEncrypted,
    encryptionStatus,
    connect,
    disconnect
  } = useEncryptedWebRTC({
    roomId: 'my-room',
    userId: 'user-123',
    displayName: 'John Doe',
    enableEncryption: true
  });
  
  // Use the connection...
}
```

### Performance Monitoring

```typescript
import { performanceMonitor } from './services/encryption';

// Start monitoring
performanceMonitor.startMonitoring(5000); // Report every 5 seconds

// Get current metrics
const metrics = performanceMonitor.getMetrics();
console.log(`Average encryption time: ${metrics.avgEncryptionTime}ms`);
```

## Browser Support

Requires browsers with RTCRtpScriptTransform support:
- Chrome 94+
- Edge 94+
- Safari 15.4+
- Firefox (with flag enabled)

The implementation includes automatic fallback for unsupported browsers.

## Security Considerations

1. **Key Storage**: Keys are only stored in memory, never persisted
2. **Forward Secrecy**: Key rotation ensures forward secrecy
3. **Authentication**: MLS provides cryptographic authentication of members
4. **Performance**: Designed to maintain <10ms encryption overhead

## Performance Targets

- Encryption overhead: <10ms per frame
- Key rotation: <100ms
- Member addition: <200ms
- Zero dropped frames under normal conditions

## Development

### Building Workers

Workers need to be built separately:
```bash
npm run build:workers
```

### Testing Encryption

1. Open the app with `?encryption=true` (default)
2. Join a room with multiple participants
3. Check the encryption indicator (lock icon)
4. Monitor performance stats panel

### Debugging

Enable verbose logging:
```javascript
localStorage.setItem('opencall:debug:encryption', 'true');
```

## API Reference

### MLSEncryptionService

- `initialize(userId)` - Initialize the service
- `createGroup(groupId)` - Create a new MLS group
- `addMember(groupId, memberId, keyPackage)` - Add member to group
- `removeMember(groupId, memberId)` - Remove member and rotate keys
- `getEncryptionKey(groupId, memberId)` - Get current encryption key

### EncryptedPeerConnection

- `exchangeKeyPackage(remotePackage)` - Exchange MLS key packages
- `isEncrypted` - Check if connection is encrypted
- `getStats()` - Get WebRTC statistics including encryption metrics

## Troubleshooting

### Common Issues

1. **"Encryption not supported"** - Browser doesn't support RTCRtpScriptTransform
2. **"Key exchange failed"** - Check WebSocket connection for key exchange messages
3. **High encryption overhead** - Check CPU usage and consider reducing video quality
4. **Frames being dropped** - Usually indicates decryption key issues

### Performance Optimization

1. Use hardware acceleration when available
2. Batch frame processing in workers
3. Monitor and adjust video bitrate if overhead is too high
4. Consider using simulcast for better performance