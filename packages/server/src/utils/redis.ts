import Redis from 'ioredis';
import { logger } from './logger';

// Create Redis client instance
const redisOptions: any = {
  host: process.env['REDIS_HOST'] || 'redis',
  port: Number(process.env['REDIS_PORT']) || 6379,
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    logger.warn(`Redis connection failed, retrying in ${delay}ms...`);
    return delay;
  },
  maxRetriesPerRequest: 3,
};

if (process.env['REDIS_PASSWORD']) {
  redisOptions.password = process.env['REDIS_PASSWORD'];
}

export const redis = new Redis(redisOptions);

// Redis pub/sub client for signaling
export const redisPub = redis.duplicate();
export const redisSub = redis.duplicate();

// Handle Redis connection events
redis.on('connect', () => {
  logger.info('Redis client connected');
});

redis.on('error', (error: Error) => {
  logger.error('Redis client error:', error);
});

redis.on('ready', () => {
  logger.info('Redis client ready');
});

// Graceful shutdown
export async function closeRedisConnections(): Promise<void> {
  await Promise.all([
    redis.quit(),
    redisPub.quit(),
    redisSub.quit(),
  ]);
  logger.info('Redis connections closed');
}