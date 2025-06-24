import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';

const server = Fastify({
  logger: true,
  trustProxy: true,
});

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
      };
    });

    // WebSocket endpoint
    server.register(async function (fastify) {
      fastify.get('/ws', { websocket: true }, (connection) => {
        console.log('WebSocket connected');

        connection.on('message', async (message) => {
          try {
            const data = JSON.parse(message.toString());
            console.log('Received message:', data);
            
            // Echo the message back
            connection.send(JSON.stringify({
              type: 'echo',
              data: data,
              timestamp: new Date().toISOString()
            }));
          } catch (error) {
            console.error('Error handling WebSocket message', error);
          }
        });

        connection.on('close', () => {
          console.log('WebSocket disconnected');
        });
      });
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('SIGTERM received, shutting down gracefully');
      await server.close();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      console.log('SIGINT received, shutting down gracefully');
      await server.close();
      process.exit(0);
    });

    // Start server
    const port = Number(process.env['PORT']) || 4000;
    await server.listen({ port, host: '0.0.0.0' });
    
    console.log(`Server listening on port ${port}`);
  } catch (error) {
    console.error('Failed to start server', error);
    process.exit(1);
  }
}

// Start the server
start();