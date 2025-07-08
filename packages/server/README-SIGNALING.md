# WebSocket Signaling Server

This document describes the WebSocket signaling server implementation for WebRTC connections in the OpenCall project.

## Architecture Overview

The signaling server consists of several key components:

- **SignalingHandler**: Main WebSocket connection handler that manages peer connections and message routing
- **RoomManager**: Redis-backed room state management for persistence and scalability
- **ConnectionManager**: Manages WebRTC meeting lifecycle (P2P and SFU modes)
- **Redis Integration**: Used for room state persistence and potential future pub/sub for multi-server deployments

## WebSocket Protocol

### Connection

Connect to the WebSocket endpoint: `ws://localhost:4000/ws`

### Message Types

All messages follow this base structure:
```typescript
{
  type: string;
  timestamp: number;
  // ... additional fields based on message type
}
```

#### 1. Join Room
```json
{
  "type": "join-room",
  "roomId": "abc123",
  "peerId": "peer-unique-id",
  "displayName": "John Doe",
  "mediaState": {
    "audio": true,
    "video": false,
    "screen": false
  },
  "timestamp": 1234567890
}
```

Response:
```json
{
  "type": "room-joined",
  "roomId": "abc123",
  "peerId": "peer-unique-id",
  "peers": [
    {
      "peerId": "other-peer-id",
      "displayName": "Jane Smith",
      "mediaState": {
        "audio": true,
        "video": true,
        "screen": false
      }
    }
  ],
  "iceServers": [
    {
      "urls": ["stun:stun.l.google.com:19302"]
    },
    {
      "urls": ["turn:turn.example.com:3478"],
      "username": "user",
      "credential": "pass",
      "credentialType": "password"
    }
  ],
  "timestamp": 1234567891
}
```

#### 2. Leave Room
```json
{
  "type": "leave-room",
  "roomId": "abc123",
  "peerId": "peer-unique-id",
  "timestamp": 1234567890
}
```

#### 3. WebRTC Offer
```json
{
  "type": "offer",
  "roomId": "abc123",
  "fromPeerId": "peer1",
  "toPeerId": "peer2",
  "offer": {
    "type": "offer",
    "sdp": "..."
  },
  "timestamp": 1234567890
}
```

#### 4. WebRTC Answer
```json
{
  "type": "answer",
  "roomId": "abc123",
  "fromPeerId": "peer2",
  "toPeerId": "peer1",
  "answer": {
    "type": "answer",
    "sdp": "..."
  },
  "timestamp": 1234567890
}
```

#### 5. ICE Candidate
```json
{
  "type": "ice-candidate",
  "roomId": "abc123",
  "fromPeerId": "peer1",
  "toPeerId": "peer2",
  "candidate": {
    "candidate": "...",
    "sdpMLineIndex": 0,
    "sdpMid": "0"
  },
  "timestamp": 1234567890
}
```

#### 6. Media State Changed
```json
{
  "type": "media-state-changed",
  "roomId": "abc123",
  "peerId": "peer-unique-id",
  "mediaState": {
    "audio": false,
    "video": true,
    "screen": false
  },
  "timestamp": 1234567890
}
```

### Broadcast Messages

These messages are sent to all peers in a room:

#### Peer Joined
```json
{
  "type": "peer-joined",
  "roomId": "abc123",
  "peerId": "new-peer-id",
  "displayName": "New User",
  "mediaState": {
    "audio": true,
    "video": false,
    "screen": false
  },
  "timestamp": 1234567890
}
```

#### Peer Left
```json
{
  "type": "peer-left",
  "roomId": "abc123",
  "peerId": "leaving-peer-id",
  "timestamp": 1234567890
}
```

### Error Messages
```json
{
  "type": "error",
  "error": "Room not found",
  "code": "ROOM_NOT_FOUND",
  "timestamp": 1234567890
}
```

## REST API Endpoints

### Create Room
```http
POST /api/rooms
Content-Type: application/json

{
  "hostPeerId": "host-unique-id",
  "maxParticipants": 10,
  "encryption": "none"
}

Response: 201 Created
{
  "roomId": "abc123",
  "joinLink": "http://localhost:3000/meeting/abc123",
  "hostPeerId": "host-unique-id",
  "maxParticipants": 10,
  "encryption": "none",
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

### Get Room Info
```http
GET /api/rooms/:roomId

Response: 200 OK
{
  "roomId": "abc123",
  "meetingInfo": {...},
  "connectionMode": "p2p",
  "participantCount": 2,
  "peers": [...]
}
```

### Close Room
```http
DELETE /api/rooms/:roomId

Response: 204 No Content
```

### List All Rooms (Admin)
```http
GET /api/rooms

Response: 200 OK
{
  "totalRooms": 5,
  "totalPeers": 12,
  "rooms": [...],
  "serverStats": {...}
}
```

## Configuration

Set these environment variables:

```bash
# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=optional-password

# STUN/TURN
STUN_URLS=stun:stun.l.google.com:19302
TURN_URL=turn:your-turn-server:3478
TURN_USERNAME=username
TURN_CREDENTIAL=password

# Client URL for CORS
CLIENT_URL=http://localhost:3000
```

## Features

- **Room Management**: Create, join, leave rooms with Redis persistence
- **P2P/SFU Auto-switching**: Automatically upgrades from P2P to SFU when needed
- **Peer Discovery**: Automatic peer announcement when joining rooms
- **WebRTC Signaling**: Full support for offer/answer/ICE candidate exchange
- **Media State Tracking**: Track audio/video/screen sharing states
- **Heartbeat/Keepalive**: Automatic cleanup of disconnected peers
- **Error Handling**: Comprehensive error messages and logging
- **Graceful Shutdown**: Proper cleanup of connections and Redis

## Security Considerations

1. **Authentication**: Currently no authentication - add JWT or session-based auth
2. **Rate Limiting**: Basic rate limiting is implemented via Fastify
3. **Input Validation**: Messages are validated but could be enhanced with Zod schemas
4. **CORS**: Configured for the client URL only
5. **Room Access Control**: No access control - any peer can join any room

## Future Enhancements

1. **Multi-server Support**: Use Redis pub/sub for server-to-server communication
2. **Recording Support**: Add recording initiation/control messages
3. **Breakout Rooms**: Support for sub-rooms within a meeting
4. **Waiting Room**: Hold peers before allowing them into the meeting
5. **Chat Messages**: Add text chat support through the signaling channel
6. **File Transfer**: Support for file sharing between peers
7. **Authentication**: Add proper authentication and authorization
8. **Metrics**: Prometheus metrics for monitoring