import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { nanoid } from 'nanoid';
import { ConnectionManager } from '../connection/ConnectionManager';
import { RoomManager } from '../signaling/RoomManager';
import { logger } from '../utils/logger';
import { MeetingIdSchema } from '@opencall/core';

interface CreateRoomBody {
  hostPeerId: string;
  maxParticipants?: number;
  encryption?: 'e2e' | 'none';
}

interface RoomParams {
  roomId: string;
}

export async function roomRoutes(
  fastify: FastifyInstance,
  options: {
    connectionManager: ConnectionManager;
    roomManager: RoomManager;
  }
) {
  const { connectionManager, roomManager } = options;

  // Create a new room
  fastify.post<{ Body: CreateRoomBody }>('/api/rooms', {
    schema: {
      body: {
        type: 'object',
        required: ['hostPeerId'],
        properties: {
          hostPeerId: { type: 'string', minLength: 1 },
          maxParticipants: { type: 'number', minimum: 2, maximum: 100 },
          encryption: { type: 'string', enum: ['e2e', 'none'] },
        },
      },
    },
  }, async (request: FastifyRequest<{ Body: CreateRoomBody }>, reply: FastifyReply) => {
    try {
      const { hostPeerId, maxParticipants = 10, encryption = 'none' } = request.body;
      
      // Generate room ID
      const roomId = nanoid(12);
      
      // Validate room ID
      const validationResult = MeetingIdSchema.safeParse(roomId);
      if (!validationResult.success) {
        return reply.code(400).send({ error: 'Invalid room ID generated' });
      }

      // Create meeting in ConnectionManager
      const meeting = await connectionManager.createMeeting(
        roomId,
        {
          type: 'instant',
          encryption,
          maxParticipants,
        },
        hostPeerId
      );

      // Create room in RoomManager
      await roomManager.createRoom(roomId, hostPeerId);

      const response = {
        roomId,
        joinLink: `${process.env['CLIENT_URL'] || 'http://localhost:3000'}/meeting/${roomId}`,
        hostPeerId,
        maxParticipants,
        encryption,
        createdAt: meeting.getMeetingInfo().createdAt,
      };

      logger.info('Room created via API', response);
      return reply.code(201).send(response);
    } catch (error) {
      logger.error('Failed to create room', error);
      return reply.code(500).send({ error: 'Failed to create room' });
    }
  });

  // Get room information
  fastify.get<{ Params: RoomParams }>('/api/rooms/:roomId', async (request, reply) => {
    try {
      const { roomId } = request.params;
      
      const meeting = connectionManager.getMeeting(roomId);
      if (!meeting) {
        return reply.code(404).send({ error: 'Room not found' });
      }

      const room = await roomManager.getRoom(roomId);
      if (!room) {
        return reply.code(404).send({ error: 'Room state not found' });
      }

      const peers = await roomManager.getRoomPeers(roomId);
      
      const response = {
        roomId,
        meetingInfo: meeting.getMeetingInfo(),
        connectionMode: meeting.getConnectionInfo().mode,
        participantCount: meeting.getParticipantCount(),
        peers: peers.map(p => ({
          peerId: p.peerId,
          displayName: p.displayName,
          joinedAt: p.joinedAt,
          mediaState: p.mediaState,
        })),
      };

      return reply.send(response);
    } catch (error) {
      logger.error('Failed to get room info', error);
      return reply.code(500).send({ error: 'Failed to get room information' });
    }
  });

  // Close a room
  fastify.delete<{ Params: RoomParams }>('/api/rooms/:roomId', async (request, reply) => {
    try {
      const { roomId } = request.params;
      
      // Close meeting
      await connectionManager.closeMeeting(roomId);
      
      // Room will be automatically cleaned up when all peers leave
      
      logger.info('Room closed via API', { roomId });
      return reply.code(204).send();
    } catch (error) {
      logger.error('Failed to close room', error);
      return reply.code(500).send({ error: 'Failed to close room' });
    }
  });

  // Get all rooms (admin endpoint)
  fastify.get('/api/rooms', async (_request, reply) => {
    try {
      const stats = await roomManager.getRoomStats();
      const meetings = connectionManager.getStats();
      
      const response = {
        totalRooms: stats.totalRooms,
        totalPeers: stats.totalPeers,
        rooms: stats.roomDetails.map(room => {
          const meeting = connectionManager.getMeeting(room.roomId);
          return {
            ...room,
            mode: meeting?.getConnectionInfo().mode || 'unknown',
          };
        }),
        serverStats: meetings,
      };

      return reply.send(response);
    } catch (error) {
      logger.error('Failed to get rooms list', error);
      return reply.code(500).send({ error: 'Failed to get rooms list' });
    }
  });
}