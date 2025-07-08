# OpenCall Quick Start Guide

## Overview
OpenCall is a decentralized, zero-knowledge meeting platform with military-grade security. This guide helps you get started with 2-person video calls.

## Prerequisites
- Node.js 18+ and pnpm
- Docker (for Redis)
- Modern browser with WebRTC support

## Setup Instructions

### 1. Start Docker Services
```bash
docker-compose up -d redis
```

### 2. Install Dependencies
```bash
# From project root
pnpm install
```

### 3. Build Core Package
```bash
cd packages/core
pnpm build
```

### 4. Start the Server
```bash
cd packages/server
pnpm dev
```
The server will start on http://localhost:4000

### 5. Start the Client
In a new terminal:
```bash
cd packages/client
pnpm dev
```
The client will start on http://localhost:3003

## Using OpenCall

### Creating a Meeting
1. Visit http://localhost:3003
2. Click "Start New Meeting"
3. Allow camera/microphone permissions
4. Configure your devices in the lobby
5. Enter your name and join

### Joining a Meeting
1. Get the meeting ID from the meeting creator
2. Visit http://localhost:3003
3. Enter the meeting ID and click "Join Meeting"
4. Configure devices and join

### During the Meeting
- **Audio**: Click microphone icon to mute/unmute
- **Video**: Click camera icon to turn on/off
- **Screen Share**: Click screen icon to share
- **End Call**: Click red phone icon to leave

## Architecture Overview
- **P2P WebRTC**: Direct peer connections for 2-3 participants
- **WebSocket Signaling**: Room management and peer discovery
- **React PWA**: Progressive web app with offline support
- **Zero Signup**: No accounts required

## Troubleshooting

### Connection Issues
- Ensure both server and client are running
- Check firewall allows WebRTC connections
- Verify Redis is running: `docker ps`

### Media Issues
- Check browser permissions for camera/microphone
- Try different browser (Chrome/Firefox recommended)
- Ensure no other app is using camera/microphone

## Next Features (Coming Soon)
- End-to-end encryption with MLS protocol
- Group calls (4+ participants) with SFU
- File sharing via IPFS
- Zero gas fees with Vite blockchain
- Enterprise SSO integration

## Development
See individual package READMEs for development details:
- `/packages/server/README.md` - Server documentation
- `/packages/client/README.md` - Client documentation
- `/packages/core/README.md` - Shared types and utilities