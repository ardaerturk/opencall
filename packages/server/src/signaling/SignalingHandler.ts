import { nanoid } from 'nanoid';
import { EventEmitter } from 'events';
import { WebSocket } from 'ws';
import { logger } from '../utils/logger';
import { RoomManager } from './RoomManager';
import { ConnectionManager } from '../connection/ConnectionManager';
import {
  SignalingMessage,
  JoinRoomMessage,
  LeaveRoomMessage,
  OfferMessage,
  AnswerMessage,
  IceCandidateMessage,
  MediaStateChangedMessage,
  KeyExchangeMessage,
  EncryptionStatusMessage,
  RoomJoinedMessage,
  ErrorMessage,
  IceServerConfig,
} from '@opencall/core';

interface SocketInfo {
  id: string;
  socket: WebSocket;
  peerId?: string;
  roomId?: string;
  isAlive: boolean;
}

export class SignalingHandler extends EventEmitter {
  private sockets = new Map<string, SocketInfo>();
  private roomManager: RoomManager;
  private connectionManager: ConnectionManager;
  private heartbeatInterval?: NodeJS.Timeout;

  constructor(connectionManager: ConnectionManager) {
    super();
    this.roomManager = new RoomManager();
    this.connectionManager = connectionManager;
    this.setupRoomManagerListeners();
    this.setupConnectionManagerListeners();
    this.startHeartbeat();
  }

  getRoomManager(): RoomManager {
    return this.roomManager;
  }

  private setupRoomManagerListeners(): void {
    this.roomManager.on('peer:joined', ({ roomId, peerInfo }) => {
      this.broadcastToRoom(roomId, {
        type: 'peer-joined',
        roomId,
        peerId: peerInfo.peerId,
        displayName: peerInfo.displayName,
        mediaState: peerInfo.mediaState,
        timestamp: Date.now(),
      }, peerInfo.peerId);
    });

    this.roomManager.on('peer:left', ({ roomId, peerId }) => {
      this.broadcastToRoom(roomId, {
        type: 'peer-left',
        roomId,
        peerId,
        timestamp: Date.now(),
      }, peerId);
    });

    this.roomManager.on('peer:media-changed', ({ roomId, peerId, mediaState }) => {
      this.broadcastToRoom(roomId, {
        type: 'media-state-changed',
        roomId,
        peerId,
        mediaState,
        timestamp: Date.now(),
      }, peerId);
    });
  }

  private setupConnectionManagerListeners(): void {
    // Handle mode transition events
    this.connectionManager.on('meeting:transition:started', ({ meetingId, ...data }) => {
      this.broadcastToRoom(meetingId, {
        type: 'mode-transition-started',
        roomId: meetingId,
        ...data,
        timestamp: Date.now(),
      });
    });

    this.connectionManager.on('meeting:transition:info', ({ meetingId, ...data }) => {
      this.broadcastToRoom(meetingId, {
        type: 'mode-transition-info',
        roomId: meetingId,
        ...data,
        timestamp: Date.now(),
      });
    });

    this.connectionManager.on('meeting:transition:completed', ({ meetingId, ...data }) => {
      this.broadcastToRoom(meetingId, {
        type: 'mode-transition-completed',
        roomId: meetingId,
        ...data,
        timestamp: Date.now(),
      });
    });

    this.connectionManager.on('meeting:transition:failed', ({ meetingId, ...data }) => {
      this.broadcastToRoom(meetingId, {
        type: 'mode-transition-failed',
        roomId: meetingId,
        ...data,
        timestamp: Date.now(),
      });
    });
  }

  handleConnection(socket: WebSocket): void {
    const socketId = nanoid();
    const socketInfo: SocketInfo = {
      id: socketId,
      socket,
      isAlive: true,
    };

    this.sockets.set(socketId, socketInfo);
    logger.info(`WebSocket connected: ${socketId}`);

    socket.on('pong', () => {
      socketInfo.isAlive = true;
    });

    socket.on('message', async (data: Buffer | ArrayBuffer | Buffer[]) => {
      try {
        const message = JSON.parse(data.toString()) as SignalingMessage;
        await this.handleMessage(socketId, message);
      } catch (error) {
        logger.error(`Error handling WebSocket message: ${socketId}`, error);
        this.sendError(socket, 'Invalid message format');
      }
    });

    socket.on('close', () => {
      this.handleDisconnect(socketId);
    });

    socket.on('error', (error: Error) => {
      logger.error(`WebSocket error: ${socketId}`, error);
    });
  }

  private async handleMessage(socketId: string, message: SignalingMessage): Promise<void> {
    const socketInfo = this.sockets.get(socketId);
    if (!socketInfo) {
      return;
    }

    logger.debug(`Handling message: ${message.type}`, { socketId, peerId: socketInfo.peerId });

    switch (message.type) {
      case 'join-room':
        await this.handleJoinRoom(socketId, message);
        break;
      case 'leave-room':
        await this.handleLeaveRoom(socketId, message);
        break;
      case 'offer':
        await this.handleOffer(socketId, message);
        break;
      case 'answer':
        await this.handleAnswer(socketId, message);
        break;
      case 'ice-candidate':
        await this.handleIceCandidate(socketId, message);
        break;
      case 'media-state-changed':
        await this.handleMediaStateChanged(socketId, message);
        break;
      case 'key-exchange':
        await this.handleKeyExchange(socketId, message);
        break;
      case 'encryption-status':
        await this.handleEncryptionStatus(socketId, message);
        break;
      case 'transition-acknowledged':
        await this.handleTransitionAcknowledged(socketId, message);
        break;
      case 'request-connection-refresh':
        await this.handleConnectionRefresh(socketId, message);
        break;
      case 'sfu-offer':
        await this.handleSfuOffer(socketId, message);
        break;
      case 'ping':
        // Ping is handled at WebSocket level, just acknowledge
        break;
      default:
        this.sendError(socketInfo.socket, `Unknown message type: ${message.type}`);
    }
  }

  private async handleJoinRoom(socketId: string, message: JoinRoomMessage): Promise<void> {
    const socketInfo = this.sockets.get(socketId);
    if (!socketInfo) {
      return;
    }

    const { roomId, peerId, displayName, mediaState } = message;

    // Check if meeting exists in ConnectionManager
    let meeting = this.connectionManager.getMeeting(roomId);
    if (!meeting) {
      // Create new meeting if it doesn't exist
      try {
        meeting = await this.connectionManager.createMeeting(
          roomId,
          { type: 'instant', encryption: 'none' },
          peerId
        );
      } catch (error) {
        logger.error(`Failed to create meeting: ${roomId}`, error);
        this.sendError(socketInfo.socket, 'Failed to create meeting');
        return;
      }
    }

    // Update socket info
    socketInfo.peerId = peerId;
    socketInfo.roomId = roomId;

    // Join room
    const room = await this.roomManager.joinRoom(roomId, peerId, socketId, displayName);
    if (!room) {
      this.sendError(socketInfo.socket, 'Room not found');
      return;
    }

    // Update media state
    await this.roomManager.updatePeerMediaState(roomId, peerId, mediaState);

    // Get existing peers
    const peers = await this.roomManager.getRoomPeers(roomId);
    const otherPeers = peers
      .filter(p => p.peerId !== peerId)
      .map(p => ({
        peerId: p.peerId,
        ...(p.displayName !== undefined && { displayName: p.displayName }),
        mediaState: p.mediaState,
      }));

    // Send room joined confirmation
    const response: RoomJoinedMessage = {
      type: 'room-joined',
      roomId,
      peerId,
      peers: otherPeers,
      iceServers: this.getIceServers(),
      timestamp: Date.now(),
    };

    this.sendMessage(socketInfo.socket, response);
    logger.info(`Peer joined room: ${roomId}/${peerId}`);
  }

  private async handleLeaveRoom(socketId: string, message: LeaveRoomMessage): Promise<void> {
    const socketInfo = this.sockets.get(socketId);
    if (!socketInfo || !socketInfo.peerId || !socketInfo.roomId) {
      return;
    }

    const { roomId, peerId } = message;

    // Verify the peer is leaving their own room
    if (roomId !== socketInfo.roomId || peerId !== socketInfo.peerId) {
      this.sendError(socketInfo.socket, 'Invalid room or peer ID');
      return;
    }

    await this.roomManager.leaveRoom(roomId, peerId);
    delete socketInfo.roomId;
    delete socketInfo.peerId;

    // Send confirmation
    this.sendMessage(socketInfo.socket, {
      type: 'room-left',
      roomId,
      peerId,
      timestamp: Date.now(),
    });

    logger.info(`Peer left room: ${roomId}/${peerId}`);
  }

  private async handleOffer(socketId: string, message: OfferMessage): Promise<void> {
    const socketInfo = this.sockets.get(socketId);
    if (!socketInfo || !socketInfo.roomId) {
      return;
    }

    const { roomId, fromPeerId, toPeerId } = message;

    // Verify sender
    if (fromPeerId !== socketInfo.peerId || roomId !== socketInfo.roomId) {
      this.sendError(socketInfo.socket, 'Invalid sender or room');
      return;
    }

    // Forward to target peer
    const targetSocket = this.findSocketByPeerId(roomId, toPeerId);
    if (targetSocket) {
      this.sendMessage(targetSocket.socket, message);
      logger.debug(`Forwarded offer: ${fromPeerId} -> ${toPeerId}`);
    }
  }

  private async handleAnswer(socketId: string, message: AnswerMessage): Promise<void> {
    const socketInfo = this.sockets.get(socketId);
    if (!socketInfo || !socketInfo.roomId) {
      return;
    }

    const { roomId, fromPeerId, toPeerId } = message;

    // Verify sender
    if (fromPeerId !== socketInfo.peerId || roomId !== socketInfo.roomId) {
      this.sendError(socketInfo.socket, 'Invalid sender or room');
      return;
    }

    // Forward to target peer
    const targetSocket = this.findSocketByPeerId(roomId, toPeerId);
    if (targetSocket) {
      this.sendMessage(targetSocket.socket, message);
      logger.debug(`Forwarded answer: ${fromPeerId} -> ${toPeerId}`);
    }
  }

  private async handleIceCandidate(socketId: string, message: IceCandidateMessage): Promise<void> {
    const socketInfo = this.sockets.get(socketId);
    if (!socketInfo || !socketInfo.roomId) {
      return;
    }

    const { roomId, fromPeerId, toPeerId } = message;

    // Verify sender
    if (fromPeerId !== socketInfo.peerId || roomId !== socketInfo.roomId) {
      this.sendError(socketInfo.socket, 'Invalid sender or room');
      return;
    }

    // Forward to target peer
    const targetSocket = this.findSocketByPeerId(roomId, toPeerId);
    if (targetSocket) {
      this.sendMessage(targetSocket.socket, message);
      logger.debug(`Forwarded ICE candidate: ${fromPeerId} -> ${toPeerId}`);
    }
  }

  private async handleMediaStateChanged(socketId: string, message: MediaStateChangedMessage): Promise<void> {
    const socketInfo = this.sockets.get(socketId);
    if (!socketInfo || !socketInfo.roomId || !socketInfo.peerId) {
      return;
    }

    const { roomId, peerId, mediaState } = message;

    // Verify sender
    if (peerId !== socketInfo.peerId || roomId !== socketInfo.roomId) {
      this.sendError(socketInfo.socket, 'Invalid sender or room');
      return;
    }

    // Update media state
    await this.roomManager.updatePeerMediaState(roomId, peerId, mediaState);
  }

  private async handleKeyExchange(socketId: string, message: KeyExchangeMessage): Promise<void> {
    const socketInfo = this.sockets.get(socketId);
    if (!socketInfo || !socketInfo.roomId) {
      return;
    }

    const { roomId, fromPeerId, toPeerId } = message;

    // Verify sender
    if (fromPeerId !== socketInfo.peerId || roomId !== socketInfo.roomId) {
      this.sendError(socketInfo.socket, 'Invalid sender or room');
      return;
    }

    // Forward to target peer
    const targetSocket = this.findSocketByPeerId(roomId, toPeerId);
    if (targetSocket) {
      this.sendMessage(targetSocket.socket, message);
      logger.debug(`Forwarded key exchange: ${fromPeerId} -> ${toPeerId}`);
    }
  }

  private async handleEncryptionStatus(socketId: string, message: EncryptionStatusMessage): Promise<void> {
    const socketInfo = this.sockets.get(socketId);
    if (!socketInfo || !socketInfo.roomId || !socketInfo.peerId) {
      return;
    }

    const { roomId, peerId, encrypted } = message;

    // Verify sender
    if (peerId !== socketInfo.peerId || roomId !== socketInfo.roomId) {
      this.sendError(socketInfo.socket, 'Invalid sender or room');
      return;
    }

    // Broadcast encryption status to other peers in the room
    this.broadcastToRoom(roomId, message, peerId);
    logger.debug(`Updated encryption status for ${peerId}: ${encrypted}`);
  }

  private async handleTransitionAcknowledged(socketId: string, message: any): Promise<void> {
    const socketInfo = this.sockets.get(socketId);
    if (!socketInfo || !socketInfo.roomId || !socketInfo.peerId) {
      return;
    }

    const { roomId, peerId } = message;

    // Verify sender
    if (peerId !== socketInfo.peerId || roomId !== socketInfo.roomId) {
      this.sendError(socketInfo.socket, 'Invalid sender or room');
      return;
    }

    // Forward to meeting manager for tracking
    const meeting = this.connectionManager.getMeeting(roomId);
    if (meeting) {
      meeting.emit('client:transition-acknowledged', { peerId });
    }

    logger.debug(`Transition acknowledged by ${peerId} in room ${roomId}`);
  }

  private async handleConnectionRefresh(socketId: string, message: any): Promise<void> {
    const socketInfo = this.sockets.get(socketId);
    if (!socketInfo || !socketInfo.roomId || !socketInfo.peerId) {
      return;
    }

    const { roomId, peerId } = message;

    // Verify sender
    if (peerId !== socketInfo.peerId || roomId !== socketInfo.roomId) {
      this.sendError(socketInfo.socket, 'Invalid sender or room');
      return;
    }

    // Get current connection info
    const meeting = this.connectionManager.getMeeting(roomId);
    if (!meeting) {
      this.sendError(socketInfo.socket, 'Meeting not found');
      return;
    }

    // Send current connection info
    const connectionInfo = meeting.getConnectionInfo();
    this.sendMessage(socketInfo.socket, {
      type: 'connection-refresh',
      roomId,
      connectionInfo,
      timestamp: Date.now(),
    });

    logger.debug(`Connection refresh sent to ${peerId} in room ${roomId}`);
  }

  private async handleSfuOffer(socketId: string, message: any): Promise<void> {
    const socketInfo = this.sockets.get(socketId);
    if (!socketInfo || !socketInfo.roomId || !socketInfo.peerId) {
      return;
    }

    const { roomId, peerId, offer } = message;

    // Verify sender
    if (peerId !== socketInfo.peerId || roomId !== socketInfo.roomId) {
      this.sendError(socketInfo.socket, 'Invalid sender or room');
      return;
    }

    // Forward to meeting for SFU handling
    const meeting = this.connectionManager.getMeeting(roomId);
    if (meeting) {
      meeting.emit('sfu:offer', { peerId, offer });
    }

    logger.debug(`SFU offer received from ${peerId} in room ${roomId}`);
  }

  private async handleDisconnect(socketId: string): Promise<void> {
    const socketInfo = this.sockets.get(socketId);
    if (!socketInfo) {
      return;
    }

    logger.info(`WebSocket disconnected: ${socketId}`, { 
      peerId: socketInfo.peerId, 
      roomId: socketInfo.roomId 
    });

    // Remove from room if in one
    await this.roomManager.disconnectSocket(socketId);

    // Remove socket
    this.sockets.delete(socketId);
  }

  private broadcastToRoom(
    roomId: string, 
    message: SignalingMessage, 
    excludePeerId?: string
  ): void {
    for (const [_, socketInfo] of this.sockets) {
      if (socketInfo.roomId === roomId && 
          socketInfo.peerId !== excludePeerId &&
          socketInfo.socket.readyState === WebSocket.OPEN) {
        this.sendMessage(socketInfo.socket, message);
      }
    }
  }

  private findSocketByPeerId(roomId: string, peerId: string): SocketInfo | undefined {
    for (const [_, socketInfo] of this.sockets) {
      if (socketInfo.roomId === roomId && socketInfo.peerId === peerId) {
        return socketInfo;
      }
    }
    return undefined;
  }

  private sendMessage(socket: WebSocket, message: SignalingMessage): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  private sendError(socket: WebSocket, error: string, code?: string): void {
    const errorMessage: ErrorMessage = {
      type: 'error',
      error,
      ...(code !== undefined && { code }),
      timestamp: Date.now(),
    };
    this.sendMessage(socket, errorMessage);
  }

  private getIceServers(): IceServerConfig[] {
    const iceServers: IceServerConfig[] = [];

    // Add STUN servers
    const stunUrls = process.env['STUN_URLS']?.split(',') || [
      'stun:stun.l.google.com:19302',
      'stun:stun1.l.google.com:19302',
    ];
    
    iceServers.push({
      urls: stunUrls,
    });

    // Add TURN server if configured
    if (process.env['TURN_URL']) {
      iceServers.push({
        urls: process.env['TURN_URL'].split(','),
        username: process.env['TURN_USERNAME'] || 'opencall',
        credential: process.env['TURN_CREDENTIAL'] || 'opencall123',
        credentialType: 'password',
      });
    }

    return iceServers;
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      for (const [socketId, socketInfo] of this.sockets) {
        if (!socketInfo.isAlive) {
          logger.warn(`WebSocket ping timeout: ${socketId}`);
          socketInfo.socket.terminate();
          this.handleDisconnect(socketId);
        } else {
          socketInfo.isAlive = false;
          socketInfo.socket.ping();
        }
      }
    }, 30000); // 30 seconds
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down SignalingHandler');

    // Stop heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Close all WebSocket connections
    for (const [_, socketInfo] of this.sockets) {
      if (socketInfo.socket.readyState === WebSocket.OPEN) {
        socketInfo.socket.close();
      }
    }

    this.sockets.clear();
    logger.info('SignalingHandler shutdown complete');
  }

  getStats() {
    const socketStats = Array.from(this.sockets.values()).map(socket => ({
      id: socket.id,
      peerId: socket.peerId,
      roomId: socket.roomId,
      isAlive: socket.isAlive,
      state: socket.socket.readyState,
    }));

    return {
      totalSockets: this.sockets.size,
      connectedSockets: socketStats.filter(s => s.state === 1).length, // 1 = OPEN
      sockets: socketStats,
    };
  }
}