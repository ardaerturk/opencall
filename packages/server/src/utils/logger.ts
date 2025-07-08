import pino from 'pino';

const isDevelopment = process.env['NODE_ENV'] === 'development';

const loggerOptions: pino.LoggerOptions = {
  level: process.env['LOG_LEVEL'] || 'info',
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },
  base: {
    env: process.env['NODE_ENV'],
  },
  timestamp: pino.stdTimeFunctions.isoTime,
};

if (isDevelopment) {
  loggerOptions.transport = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss Z',
      ignore: 'pid,hostname',
    },
  };
}

export const logger = pino(loggerOptions);