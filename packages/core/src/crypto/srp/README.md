# SRP (Secure Remote Password) Authentication

This module implements the SRP-6a protocol for zero-knowledge authentication in OpenCall. The implementation ensures that passwords never leave the client device and are never transmitted or stored on the server.

## Features

- **Zero-Knowledge Proof**: Server never sees or stores user passwords
- **Secure Session Keys**: Derives shared session keys for E2E encryption
- **WebCrypto API**: Uses browser's native crypto for all operations
- **Ephemeral Identities**: Supports anonymous users with temporary identities
- **JWT Sessions**: Issues JWT tokens for authenticated sessions

## Usage

### Client-Side

```typescript
import { AuthService } from '@opencall/client/services/auth';

const authService = new AuthService();

// Register a new user
const result = await authService.register('user@example.com', 'securePassword123');

// Login
const loginResult = await authService.authenticate('user@example.com', 'securePassword123');

// Get session key for E2E encryption
const sessionKey = authService.getSessionKey();
```

### Server-Side

```typescript
import { AuthenticationManager } from '@opencall/server/auth';

const authManager = new AuthenticationManager(redis);

// Register user
await authManager.registerUser(identity, password);

// Create challenge
const challenge = await authManager.createChallenge({ identity, publicKey });

// Verify proof
const result = await authManager.verifyProof({ sessionId, clientPublicKey, proof });
```

## Security Considerations

1. **Password Requirements**: Minimum 8 characters enforced
2. **Session Management**: Sessions expire after configurable TTL
3. **Rate Limiting**: Applied to prevent brute force attacks
4. **Secure Cookies**: HTTP-only, secure cookies for session tokens
5. **Constant-Time Comparisons**: Prevents timing attacks

## Protocol Flow

1. **Registration**:
   - Client generates salt and computes verifier
   - Server stores only salt and verifier

2. **Authentication**:
   - Client requests challenge with identity
   - Server returns salt and server public key
   - Client computes proof and sends to server
   - Server verifies proof and issues session token
   - Both derive shared session key

## Configuration

```typescript
// Server configuration
const authConfig = {
  sessionTTL: 3600,        // 1 hour
  challengeTTL: 300,       // 5 minutes
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: '24h'
};
```

## Integration with Meetings

Authentication is optional for joining meetings:
- Anonymous users get ephemeral identities
- Authenticated users unlock premium features
- Session keys enable E2E encryption for authenticated users