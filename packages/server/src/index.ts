import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { ConnectionManager } from './connection/ConnectionManager';
import { SignalingHandler } from './signaling/SignalingHandler';
import { MediasoupSignalingHandler } from './signaling/MediasoupSignalingHandler';
import { closeRedisConnections } from './utils/redis';
import { logger } from './utils/logger';
import { roomRoutes } from './routes/rooms';
import { authRoutes, createAuthDecorator } from './routes/auth';
import { AuthenticationManager } from './auth/AuthenticationManager';

const server = Fastify({
  logger: true,
  trustProxy: true,
});

// Initialize managers
const connectionManager = new ConnectionManager();
const signalingHandler = new SignalingHandler(connectionManager);
const mediasoupHandler = new MediasoupSignalingHandler(connectionManager);

async function start() {
  try {
    // Register plugins
    await server.register(cors, {
      origin: process.env['CLIENT_URL'] || 'http://localhost:3000',
      credentials: true,
    });

    await server.register(helmet, {
      contentSecurityPolicy: false,
    });

    await server.register(rateLimit, {
      max: 100,
      timeWindow: '1 minute',
    });

    await server.register(websocket);

    // Register authentication routes
    const authManager = await server.register(authRoutes, { prefix: '/api/auth' });

    // Create authentication decorator
    const authenticate = createAuthDecorator(authManager as any);
    server.decorate('authenticate', authenticate);

    // Health check endpoint
    server.get('/health', async () => {
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      };
    });

    // Basic API endpoint
    server.get('/api/status', async () => {
      return {
        message: 'OpenCall server is running',
        version: '0.1.0',
        stats: {
          connections: connectionManager.getStats(),
          signaling: signalingHandler.getStats(),
        },
      };
    });

    // WebSocket signaling endpoint
    server.register(async function (fastify) {
      fastify.get('/ws', { websocket: true }, (connection) => {
        const socket = connection as any;
        
        // Create a message router
        const originalOn = socket.on.bind(socket);
        socket.on = function(event: string, handler: Function) {
          if (event === 'message') {
            // Intercept messages to route mediasoup messages
            originalOn('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
              try {
                const message = JSON.parse(data.toString());
                
                // Route mediasoup messages to MediasoupSignalingHandler
                if (message.type && message.type.startsWith('mediasoup:')) {
                  mediasoupHandler.handleConnection(socket);
                  return;
                }
              } catch (error) {
                // Not JSON or error parsing, let default handler handle it
              }
              
              // Pass non-mediasoup messages to original handler
              handler(data);
            });
          } else {
            originalOn(event, handler);
          }
        };
        
        // Pass the WebSocket connection to the SignalingHandler
        signalingHandler.handleConnection(socket);
      });
    });

    // Register room management routes
    await server.register(roomRoutes, {
      connectionManager,
      roomManager: signalingHandler.getRoomManager(),
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`${signal} received, shutting down gracefully`);
      
      try {
        // Stop accepting new connections
        await server.close();
        
        // Shutdown signaling handler
        await signalingHandler.shutdown();
        
        // Shutdown connection manager
        await connectionManager.shutdown();
        
        // Close Redis connections
        await closeRedisConnections();
        
        logger.info('Graceful shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Start server
    const port = Number(process.env['PORT']) || 4000;
    await server.listen({ port, host: '0.0.0.0' });
    
    logger.info(`Server listening on port ${port}`);
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

// Start the server
start();