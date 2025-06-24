import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { ConnectionManager } from './connection/ConnectionManager';
import { logger } from './utils/logger';

const server = Fastify({
  logger: logger as any,
  trustProxy: true,
});

// Initialize connection manager
const connectionManager = new ConnectionManager();

async function start() {
  try {
    // Register plugins
    await server.register(cors, {
      origin: process.env.CLIENT_URL || 'http://localhost:3000',
      credentials: true,
    });

    await server.register(helmet, {
      contentSecurityPolicy: false, // We'll configure this properly later
    });

    await server.register(rateLimit, {
      max: 100,
      timeWindow: '1 minute',
    });

    await server.register(websocket);

    // Health check endpoint
    server.get('/health', async () => {
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        stats: connectionManager.getStats(),
      };
    });

    // Meeting endpoints
    server.post('/api/meetings', async (request, reply) => {
      const { options, hostId } = request.body as any;
      const meetingId = generateMeetingId();
      
      try {
        const meeting = await connectionManager.createMeeting(meetingId, options, hostId);
        return {
          success: true,
          meeting: meeting.getMeetingInfo(),
          connectionInfo: meeting.getConnectionInfo(),
        };
      } catch (error) {
        logger.error('Failed to create meeting', error);
        reply.code(500).send({ success: false, error: 'Failed to create meeting' });
      }
    });

    server.get('/api/meetings/:meetingId', async (request, reply) => {
      const { meetingId } = request.params as any;
      const meeting = connectionManager.getMeeting(meetingId);
      
      if (!meeting) {
        reply.code(404).send({ success: false, error: 'Meeting not found' });
        return;
      }

      return {
        success: true,
        meeting: meeting.getMeetingInfo(),
        connectionInfo: meeting.getConnectionInfo(),
        participants: meeting.getParticipants(),
      };
    });

    // WebSocket endpoint for signaling
    server.register(async function (fastify) {
      fastify.get('/ws/:meetingId', { websocket: true }, (connection, request) => {
        const { meetingId } = request.params as any;
        const meeting = connectionManager.getMeeting(meetingId);
        
        if (!meeting) {
          connection.socket.close(1008, 'Meeting not found');
          return;
        }

        logger.info(`WebSocket connected for meeting ${meetingId}`);

        connection.socket.on('message', async (message) => {
          try {
            const data = JSON.parse(message.toString());
            // Handle signaling messages
            handleSignalingMessage(meeting, connection, data);
          } catch (error) {
            logger.error('Error handling WebSocket message', error);
          }
        });

        connection.socket.on('close', () => {
          logger.info(`WebSocket disconnected for meeting ${meetingId}`);
        });
      });
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully');
      await connectionManager.shutdown();
      await server.close();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT received, shutting down gracefully');
      await connectionManager.shutdown();
      await server.close();
      process.exit(0);
    });

    // Start server
    const port = Number(process.env.PORT) || 4000;
    await server.listen({ port, host: '0.0.0.0' });
    
    logger.info(`Server listening on port ${port}`);
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

function generateMeetingId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 9; i++) {
    if (i === 3 || i === 6) id += '-';
    else id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

function handleSignalingMessage(meeting: any, connection: any, data: any) {
  // This will be implemented with full signaling logic
  // For now, just broadcast to other participants
  logger.info('Signaling message received', { type: data.type });
}

// Start the server
start();