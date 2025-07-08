# OpenCall End-to-End Encryption Integration Guide

This guide explains how to integrate and use the end-to-end encryption feature in OpenCall.

## Prerequisites

- Node.js 18+ with Web Crypto API support
- Browser with RTCRtpScriptTransform support (Chrome 94+, Safari 15.4+, Edge 94+)
- Docker for running the complete stack

## Setup

### 1. Install Dependencies

```bash
cd packages/client
npm install
npm run build:workers
```

### 2. Build the Project

```bash
# From project root
npm run build
```

### 3. Environment Configuration

Create `.env` files:

```bash
# packages/client/.env
REACT_APP_WS_URL=ws://localhost:3001
REACT_APP_ENABLE_ENCRYPTION=true

# packages/server/.env
PORT=3001
REDIS_URL=redis://localhost:6379
```

## Usage

### Basic Implementation

```typescript
import { useEncryptedWebRTC } from '@opencall/client';

function VideoCall() {
  const {
    isConnected,
    isEncrypted,
    encryptionStatus,
    connect,
    disconnect,
    toggleAudio,
    toggleVideo
  } = useEncryptedWebRTC({
    roomId: 'my-secure-room',
    userId: 'user-123',
    displayName: 'John Doe',
    enableEncryption: true
  });

  return (
    <div>
      {isEncrypted && <EncryptionIndicator status={encryptionStatus} />}
      <button onClick={connect}>Join Call</button>
    </div>
  );
}
```

### Advanced Configuration

```typescript
// Custom encryption configuration
const encryptionConfig = {
  algorithm: 'AES-GCM',
  keyLength: 256,
  pbkdfIterations: 100000,
  saltLength: 32
};

// Initialize with custom config
const service = new MLSEncryptionService(encryptionConfig);
```

## Server-Side Setup

The server needs to handle key exchange messages:

```typescript
// In your WebSocket handler
socket.on('key-exchange', async (data) => {
  // Forward key exchange to target peer
  const targetSocket = getSocketByPeerId(data.toPeerId);
  if (targetSocket) {
    targetSocket.emit('key-exchange', data);
  }
});
```

## Testing Encryption

### 1. Local Testing

```bash
# Terminal 1: Start server
cd packages/server
npm run dev

# Terminal 2: Start client
cd packages/client
npm run dev
```

### 2. Open Multiple Browser Windows

```
http://localhost:3000?room=test-room&name=User1
http://localhost:3000?room=test-room&name=User2
```

### 3. Verify Encryption

- Look for the lock icon on video tiles
- Check the encryption status in the header
- Monitor performance stats (optional)

## Performance Optimization

### 1. Worker Configuration

Workers are automatically built and loaded from `/public/workers/`:
- `encryptionWorker.js` - Handles frame encryption
- `decryptionWorker.js` - Handles frame decryption

### 2. Performance Monitoring

```typescript
import { performanceMonitor } from '@opencall/client';

// Start monitoring
performanceMonitor.startMonitoring(5000);

// Get metrics
const metrics = performanceMonitor.getMetrics();
console.log(`Encryption overhead: ${metrics.avgEncryptionTime}ms`);
```

### 3. Optimization Tips

- Use hardware acceleration when available
- Reduce video resolution if encryption overhead is high
- Enable simulcast for adaptive quality
- Monitor CPU usage and adjust accordingly

## Troubleshooting

### Common Issues

1. **"RTCRtpScriptTransform is not defined"**
   - Browser doesn't support encoded transform
   - Solution: Update browser or use fallback mode

2. **"Failed to initialize encryption"**
   - Web Crypto API not available
   - Solution: Use HTTPS or localhost

3. **High encryption overhead**
   - CPU-intensive encryption on slow devices
   - Solution: Reduce video quality or disable for specific users

4. **Key exchange failures**
   - WebSocket connection issues
   - Solution: Check server logs and network connectivity

### Debug Mode

Enable debug logging:

```javascript
// In browser console
localStorage.setItem('opencall:debug:encryption', 'true');
```

## Security Considerations

1. **Key Storage**: Keys are never persisted, only kept in memory
2. **Forward Secrecy**: Keys rotate when members join/leave
3. **Authentication**: MLS provides cryptographic member authentication
4. **Frame Integrity**: Each frame includes authentication tag

## Browser Compatibility

| Browser | Minimum Version | Notes |
|---------|----------------|-------|
| Chrome | 94+ | Full support |
| Edge | 94+ | Full support |
| Safari | 15.4+ | Full support |
| Firefox | TBD | Behind flag |

## Production Deployment

### 1. Build for Production

```bash
npm run build
docker build -t opencall .
```

### 2. Environment Variables

```yaml
# docker-compose.yml
services:
  client:
    environment:
      - REACT_APP_WS_URL=wss://your-domain.com
      - REACT_APP_ENABLE_ENCRYPTION=true
```

### 3. HTTPS Configuration

Encryption requires secure contexts:
- Use HTTPS in production
- Configure WSS for WebSocket
- Set secure cookie flags

## API Reference

See [packages/client/src/services/encryption/README.md](./packages/client/src/services/encryption/README.md) for detailed API documentation.

## Contributing

When contributing encryption features:
1. Maintain <10ms overhead target
2. Add comprehensive tests
3. Update performance benchmarks
4. Document security implications

## License

The encryption implementation is part of OpenCall and follows the project's MIT license.