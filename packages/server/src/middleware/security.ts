import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import helmet from '@fastify/helmet';
import { randomBytes } from 'crypto';

/**
 * Security middleware for production hardening
 */

export async function setupSecurity(fastify: FastifyInstance) {
  // Generate nonce for each request
  fastify.addHook('onRequest', async (request, reply) => {
    request.nonce = randomBytes(16).toString('base64');
  });

  // Content Security Policy
  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'", // Required for React
          (req: FastifyRequest) => `'nonce-${req.nonce}'`,
          'https://cdn.jsdelivr.net', // For libraries
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'", // Required for styled components
          'https://fonts.googleapis.com',
        ],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        connectSrc: [
          "'self'",
          'wss:', // WebSocket connections
          'https://api.ipify.org', // IP detection
          process.env['IPFS_GATEWAY'] || 'https://ipfs.io',
        ],
        mediaSrc: ["'self'", 'blob:'], // For WebRTC media
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
        workerSrc: ["'self'", 'blob:'], // For Web Workers
        formAction: ["'self'"],
        upgradeInsecureRequests: process.env['NODE_ENV'] === 'production' ? [] : undefined,
      },
    },
    crossOriginEmbedderPolicy: false, // Required for some WebRTC features
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    originAgentCluster: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    strictTransportSecurity: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    xContentTypeOptions: true,
    xDnsPrefetchControl: { allow: false },
    xFrameOptions: { action: 'deny' },
    xPermittedCrossDomainPolicies: false,
    xPoweredBy: false,
    xXssProtection: true,
  });

  // Additional security headers
  fastify.addHook('onSend', async (request, reply, payload) => {
    // Feature Policy / Permissions Policy
    reply.header('Permissions-Policy', [
      'camera=(self)',
      'microphone=(self)',
      'geolocation=()',
      'payment=()',
      'usb=()',
      'magnetometer=()',
      'accelerometer=()',
      'gyroscope=()',
    ].join(', '));

    // Expect-CT for certificate transparency
    if (process.env['NODE_ENV'] === 'production') {
      reply.header('Expect-CT', 'max-age=86400, enforce');
    }

    // Clear Site Data on logout
    if (request.url === '/api/auth/logout' && request.method === 'POST') {
      reply.header('Clear-Site-Data', '"cache", "cookies", "storage"');
    }

    return payload;
  });

  // Request size limits
  fastify.addHook('preValidation', async (request, reply) => {
    const contentLength = parseInt(request.headers['content-length'] || '0', 10);
    const maxSize = getMaxSizeForRoute(request.url);

    if (contentLength > maxSize) {
      reply.code(413).send({
        error: 'Payload too large',
        message: `Request size ${contentLength} exceeds limit of ${maxSize} bytes`,
      });
    }
  });

  // Input sanitization
  fastify.addHook('preHandler', async (request, reply) => {
    // Sanitize common injection attempts
    if (request.body && typeof request.body === 'object') {
      sanitizeObject(request.body);
    }
    
    if (request.query && typeof request.query === 'object') {
      sanitizeObject(request.query);
    }
    
    if (request.params && typeof request.params === 'object') {
      sanitizeObject(request.params);
    }
  });

  // Anti-fingerprinting
  fastify.addHook('onSend', async (request, reply, payload) => {
    // Remove or obfuscate server information
    reply.removeHeader('x-powered-by');
    reply.removeHeader('server');
    
    // Add fake server headers to confuse attackers
    const fakeServers = ['nginx/1.18.0', 'Apache/2.4.41', 'Microsoft-IIS/10.0'];
    reply.header('Server', fakeServers[Math.floor(Math.random() * fakeServers.length)]);
    
    return payload;
  });

  // Security monitoring
  fastify.addHook('onResponse', async (request, reply) => {
    // Log security-relevant events
    if (reply.statusCode === 401 || reply.statusCode === 403) {
      await fastify.auditLogger?.log({
        eventType: 'ACCESS_DENIED',
        userId: request.user?.id,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        metadata: {
          url: request.url,
          method: request.method,
          statusCode: reply.statusCode,
        },
      });
    }

    // Detect potential attacks
    if (isSuspiciousRequest(request)) {
      await fastify.auditLogger?.log({
        eventType: 'SUSPICIOUS_ACTIVITY',
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        metadata: {
          url: request.url,
          method: request.method,
          reason: 'Potential attack detected',
        },
      });
    }
  });
}

/**
 * Get maximum allowed request size for a route
 */
function getMaxSizeForRoute(url: string): number {
  // File uploads
  if (url.includes('/upload') || url.includes('/files')) {
    return 100 * 1024 * 1024; // 100MB
  }
  
  // API routes
  if (url.startsWith('/api/')) {
    return 1 * 1024 * 1024; // 1MB
  }
  
  // Default
  return 100 * 1024; // 100KB
}

/**
 * Sanitize object to prevent injection attacks
 */
function sanitizeObject(obj: any): void {
  for (const key in obj) {
    if (typeof obj[key] === 'string') {
      // Remove null bytes
      obj[key] = obj[key].replace(/\0/g, '');
      
      // Limit string length
      if (obj[key].length > 10000) {
        obj[key] = obj[key].substring(0, 10000);
      }
      
      // Remove potential NoSQL injection patterns
      if (key.startsWith('$') || key.includes('.')) {
        delete obj[key];
      }
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      sanitizeObject(obj[key]);
    }
  }
}

/**
 * Detect suspicious request patterns
 */
function isSuspiciousRequest(request: FastifyRequest): boolean {
  const suspicious = [
    // SQL injection patterns
    /(\b(union|select|insert|update|delete|drop|create)\b.*\b(from|where|table)\b)/i,
    // XSS patterns
    /<script|<iframe|javascript:|onerror=/i,
    // Path traversal
    /\.\.[\/\\]/,
    // Command injection
    /[;&|`$]/,
  ];

  const checkString = `${request.url} ${JSON.stringify(request.body || {})} ${JSON.stringify(request.query || {})}`;
  
  return suspicious.some(pattern => pattern.test(checkString));
}

// Export security configuration
export const securityConfig = {
  rateLimit: {
    global: {
      max: 100,
      timeWindow: '1 minute',
    },
    auth: {
      max: 5,
      timeWindow: '15 minutes',
    },
    api: {
      max: 1000,
      timeWindow: '1 hour',
    },
  },
  
  cors: {
    origin: (origin: string, callback: Function) => {
      const allowedOrigins = (process.env['ALLOWED_ORIGINS'] || 'http://localhost:3000')
        .split(',')
        .map(o => o.trim());
      
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400, // 24 hours
  },
  
  // DDoS protection
  ddos: {
    maxRequestsPerIP: 10000, // per hour
    blockDuration: 3600, // 1 hour in seconds
    suspiciousRequestThreshold: 100, // requests per minute
  },
};