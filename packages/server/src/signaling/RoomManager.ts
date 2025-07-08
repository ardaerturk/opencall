import { EventEmitter } from 'events';
import { redis } from '../utils/redis';
import { logger } from '../utils/logger';
import { RoomState, PeerInfo } from '@opencall/core';

export class RoomManager extends EventEmitter {
  private static readonly ROOM_PREFIX = 'room:';
  private static readonly ROOM_TTL = 86400; // 24 hours in seconds

  constructor() {
    super();
  }

  async createRoom(roomId: string, hostPeerId: string): Promise<RoomState> {
    const room: RoomState = {
      id: roomId,
      createdAt: new Date(),
      hostPeerId,
      peers: new Map(),
    };

    await this.saveRoom(room);
    logger.info(`Room created: ${roomId}`, { hostPeerId });
    
    return room;
  }

  async joinRoom(
    roomId: string, 
    peerId: string, 
    socketId: string,
    displayName?: string
  ): Promise<RoomState | null> {
    const room = await this.getRoom(roomId);
    if (!room) {
      logger.warn(`Room not found: ${roomId}`);
      return null;
    }

    const peerInfo: PeerInfo = {
      peerId,
      socketId,
      ...(displayName !== undefined && { displayName }),
      joinedAt: new Date(),
      mediaState: {
        audio: false,
        video: false,
        screen: false,
      },
    };

    room.peers.set(peerId, peerInfo);
    await this.saveRoom(room);

    logger.info(`Peer joined room: ${roomId}`, { peerId, displayName });
    this.emit('peer:joined', { roomId, peerInfo });

    return room;
  }

  async leaveRoom(roomId: string, peerId: string): Promise<boolean> {
    const room = await this.getRoom(roomId);
    if (!room) {
      return false;
    }

    const wasInRoom = room.peers.has(peerId);
    room.peers.delete(peerId);

    if (room.peers.size === 0) {
      // Delete empty room
      await this.deleteRoom(roomId);
      logger.info(`Room deleted (empty): ${roomId}`);
    } else {
      await this.saveRoom(room);
      logger.info(`Peer left room: ${roomId}`, { peerId });
    }

    if (wasInRoom) {
      this.emit('peer:left', { roomId, peerId });
    }

    return wasInRoom;
  }

  async updatePeerMediaState(
    roomId: string,
    peerId: string,
    mediaState: { audio: boolean; video: boolean; screen: boolean }
  ): Promise<boolean> {
    const room = await this.getRoom(roomId);
    if (!room) {
      return false;
    }

    const peer = room.peers.get(peerId);
    if (!peer) {
      return false;
    }

    peer.mediaState = mediaState;
    room.peers.set(peerId, peer);
    await this.saveRoom(room);

    logger.debug(`Peer media state updated: ${roomId}/${peerId}`, mediaState);
    this.emit('peer:media-changed', { roomId, peerId, mediaState });

    return true;
  }

  async getRoom(roomId: string): Promise<RoomState | null> {
    const key = this.getRoomKey(roomId);
    const data = await redis.get(key);
    
    if (!data) {
      return null;
    }

    try {
      const rawRoom = JSON.parse(data);
      const room: RoomState = {
        ...rawRoom,
        createdAt: new Date(rawRoom.createdAt),
        peers: new Map(
          Object.entries(rawRoom.peers).map(([id, peer]: [string, any]) => [
            id,
            {
              ...peer,
              joinedAt: new Date(peer.joinedAt),
            },
          ])
        ),
      };
      return room;
    } catch (error) {
      logger.error(`Failed to parse room data: ${roomId}`, error);
      return null;
    }
  }

  async getRoomPeers(roomId: string): Promise<PeerInfo[]> {
    const room = await this.getRoom(roomId);
    if (!room) {
      return [];
    }
    return Array.from(room.peers.values());
  }

  async disconnectSocket(socketId: string): Promise<void> {
    // Find and remove peer from all rooms by socket ID
    const keys = await redis.keys(`${RoomManager.ROOM_PREFIX}*`);
    
    for (const key of keys) {
      const roomId = key.replace(RoomManager.ROOM_PREFIX, '');
      const room = await this.getRoom(roomId);
      
      if (room) {
        let peerIdToRemove: string | null = null;
        
        for (const [peerId, peerInfo] of room.peers) {
          if (peerInfo.socketId === socketId) {
            peerIdToRemove = peerId;
            break;
          }
        }
        
        if (peerIdToRemove) {
          await this.leaveRoom(roomId, peerIdToRemove);
        }
      }
    }
  }

  private async saveRoom(room: RoomState): Promise<void> {
    const key = this.getRoomKey(room.id);
    const data = JSON.stringify({
      ...room,
      peers: Object.fromEntries(room.peers),
    });
    
    await redis.setex(key, RoomManager.ROOM_TTL, data);
  }

  private async deleteRoom(roomId: string): Promise<void> {
    const key = this.getRoomKey(roomId);
    await redis.del(key);
    this.emit('room:deleted', { roomId });
  }

  private getRoomKey(roomId: string): string {
    return `${RoomManager.ROOM_PREFIX}${roomId}`;
  }

  async getRoomStats(): Promise<{
    totalRooms: number;
    totalPeers: number;
    roomDetails: Array<{
      roomId: string;
      peerCount: number;
      createdAt: Date;
    }>;
  }> {
    const keys = await redis.keys(`${RoomManager.ROOM_PREFIX}*`);
    let totalPeers = 0;
    const roomDetails = [];

    for (const key of keys) {
      const roomId = key.replace(RoomManager.ROOM_PREFIX, '');
      const room = await this.getRoom(roomId);
      
      if (room) {
        const peerCount = room.peers.size;
        totalPeers += peerCount;
        roomDetails.push({
          roomId,
          peerCount,
          createdAt: room.createdAt,
        });
      }
    }

    return {
      totalRooms: keys.length,
      totalPeers,
      roomDetails,
    };
  }
}