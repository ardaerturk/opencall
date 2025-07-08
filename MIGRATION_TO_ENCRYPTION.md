# Migration Guide: Adding Encryption to Existing OpenCall Implementation

This guide helps you migrate from the standard WebRTC implementation to the encrypted version.

## Overview

The encrypted implementation provides:
- End-to-end encryption using MLS protocol
- Frame-level encryption with AES-GCM
- Automatic key rotation
- Performance monitoring
- Backward compatibility

## Migration Steps

### 1. Update Dependencies

```bash
cd packages/client
npm install
npm run build:workers
```

### 2. Replace Hooks

#### Before:
```typescript
import { useWebRTC } from '@opencall/client';

function VideoCall() {
  const { connect, disconnect } = useWebRTC({
    roomId: 'my-room',
    userId: 'user-123',
    displayName: 'John Doe'
  });
}
```

#### After:
```typescript
import { useEncryptedWebRTC } from '@opencall/client';

function VideoCall() {
  const { 
    connect, 
    disconnect,
    isEncrypted,
    encryptionStatus 
  } = useEncryptedWebRTC({
    roomId: 'my-room',
    userId: 'user-123',
    displayName: 'John Doe',
    enableEncryption: true // New option
  });
}
```

### 3. Update Peer Connection Service

#### Before:
```typescript
import { PeerConnectionService } from '@opencall/client';

const peerService = new PeerConnectionService(wsService);
```

#### After:
```typescript
import { EncryptedPeerConnectionService } from '@opencall/client';

const peerService = new EncryptedPeerConnectionService(wsService, config, {
  enableEncryption: true,
  encryptionFallback: true // Allows fallback for unsupported browsers
});
```

### 4. Add Encryption UI Indicators

```typescript
import { EncryptionIndicator, PeerEncryptionIndicator } from '@opencall/client';

// In your UI
<EncryptionIndicator status={encryptionStatus} showDetails />

// On video tiles
<PeerEncryptionIndicator isEncrypted={peer.encrypted} peerId={peer.id} />
```

### 5. Update Server Signaling

Add support for key exchange messages in your signaling server:

```typescript
// Add to your message handlers
case 'key-exchange':
  await this.handleKeyExchange(socketId, message);
  break;
case 'encryption-status':
  await this.handleEncryptionStatus(socketId, message);
  break;
```

### 6. Environment Configuration

Update your environment variables:

```bash
# Enable encryption by default
REACT_APP_ENABLE_ENCRYPTION=true

# Optional: Custom worker path
REACT_APP_WORKER_PATH=/workers
```

## Compatibility Mode

For gradual migration, you can run both encrypted and non-encrypted connections:

```typescript
const shouldEncrypt = checkBrowserSupport() && userPreference;

const { connect } = useEncryptedWebRTC({
  // ... other options
  enableEncryption: shouldEncrypt
});
```

## Performance Considerations

### Before Migration
- Measure baseline performance
- Note average latency and CPU usage
- Document current video quality settings

### After Migration
- Monitor encryption overhead (<10ms target)
- Adjust video quality if needed
- Enable performance monitoring:

```typescript
import { performanceMonitor } from '@opencall/client';

performanceMonitor.startMonitoring(5000);
```

## Rollback Plan

If issues arise, you can quickly rollback:

1. Set `enableEncryption: false` in configuration
2. Revert to original hooks/services
3. Remove encryption UI indicators

## Testing Checklist

- [ ] Verify encryption indicators appear
- [ ] Test with multiple participants
- [ ] Check performance metrics
- [ ] Verify fallback for unsupported browsers
- [ ] Test key rotation (member join/leave)
- [ ] Monitor CPU usage
- [ ] Verify audio/video quality

## Common Issues

### 1. Workers Not Loading
```
Error: Failed to load encryption worker
```
**Solution**: Ensure workers are built and served from correct path

### 2. High CPU Usage
```
Warning: Encryption overhead exceeds 10ms
```
**Solution**: Reduce video resolution or bitrate

### 3. Browser Compatibility
```
Error: RTCRtpScriptTransform not supported
```
**Solution**: Update browser or enable fallback mode

## API Changes

### New Types
- `EncryptionStatus` - Encryption state information
- `MLSKeyPackage` - Key exchange data
- `PerformanceMetrics` - Performance monitoring data

### New Events
- `onEncryptionStatus` - Encryption state changes
- `onKeyExchange` - Key package exchange
- `performance` - Performance metrics updates

### New Methods
- `getEncryptionStats()` - Get encryption statistics
- `exportKeyPackage()` - Export MLS key package
- `measurePerformance()` - Measure operation performance

## Best Practices

1. **Gradual Rollout**
   - Start with a small group
   - Monitor performance metrics
   - Gather user feedback

2. **Performance Monitoring**
   - Set up alerts for high overhead
   - Track dropped frames
   - Monitor key rotation frequency

3. **User Communication**
   - Clearly indicate encryption status
   - Provide fallback options
   - Document browser requirements

4. **Security Considerations**
   - Regular security audits
   - Key rotation policies
   - Incident response plan

## Support

For migration assistance:
- Check the [Encryption README](./packages/client/src/services/encryption/README.md)
- Review [Integration Guide](./ENCRYPTION_INTEGRATION.md)
- Open an issue for specific problems