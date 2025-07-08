/**
 * Authentication routes for SRP zero-knowledge authentication
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AuthenticationManager } from '../auth/AuthenticationManager';
import { redis } from '../utils/redis';
import { logger } from '../utils/logger';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';

interface RegisterBody {
  identity: string;
  password: string;
}

interface ChallengeBody {
  identity: string;
  publicKey: string;
}

interface VerifyBody {
  sessionId: string;
  clientPublicKey: string;
  proof: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      identity?: string;
      sessionId?: string;
      type?: string;
      authenticated: boolean;
    };
  }
}

export async function authRoutes(fastify: FastifyInstance, options: any) {
  const authManager = new AuthenticationManager(redis);

  // Register required plugins
  await fastify.register(cookie, {
    secret: process.env['COOKIE_SECRET'] || 'opencall-cookie-secret-change-me',
  });

  await fastify.register(jwt, {
    secret: process.env['JWT_SECRET'] || 'opencall-srp-secret-change-me',
    cookie: {
      cookieName: 'opencall-auth',
      signed: false,
    },
  });

  /**
   * POST /api/auth/register
   * Register a new user with SRP verifier
   */
  fastify.post<{ Body: RegisterBody }>('/register', async (request, reply) => {
    try {
      const { identity, password } = request.body;

      if (!identity || !password) {
        return reply.status(400).send({
          error: 'Identity and password are required',
        });
      }

      // Validate identity format (email or username)
      const identityRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$|^[a-zA-Z0-9._-]{3,30}$/;
      if (!identityRegex.test(identity)) {
        return reply.status(400).send({
          error: 'Invalid identity format. Use email or username (3-30 characters)',
        });
      }

      // Validate password strength
      if (password.length < 8) {
        return reply.status(400).send({
          error: 'Password must be at least 8 characters long',
        });
      }

      const result = await authManager.registerUser(identity, password);

      if (!result.success) {
        return reply.status(400).send({
          error: result.error || 'Registration failed',
        });
      }

      reply.status(201).send({
        success: true,
        message: 'User registered successfully',
      });
    } catch (error) {
      logger.error('Registration error:', error);
      reply.status(500).send({
        error: 'Internal server error',
      });
    }
  });

  /**
   * POST /api/auth/challenge
   * Get authentication challenge
   */
  fastify.post<{ Body: ChallengeBody }>('/challenge', async (request, reply) => {
    try {
      const { identity, publicKey } = request.body;

      if (!identity || !publicKey) {
        return reply.status(400).send({
          error: 'Identity and public key are required',
        });
      }

      const challenge = await authManager.createChallenge({
        identity,
        publicKey,
      });

      if (!challenge) {
        return reply.status(401).send({
          error: 'Authentication failed',
        });
      }

      reply.send(challenge);
    } catch (error) {
      logger.error('Challenge error:', error);
      reply.status(500).send({
        error: 'Internal server error',
      });
    }
  });

  /**
   * POST /api/auth/verify
   * Verify SRP proof
   */
  fastify.post<{ Body: VerifyBody }>('/verify', async (request, reply) => {
    try {
      const { sessionId, clientPublicKey, proof } = request.body;

      if (!sessionId || !clientPublicKey || !proof) {
        return reply.status(400).send({
          error: 'Session ID, client public key, and proof are required',
        });
      }

      const response = await authManager.verifyProof({
        sessionId,
        clientPublicKey,
        proof,
      });

      if (!response.success) {
        return reply.status(401).send({
          error: 'Authentication failed',
        });
      }

      // Set secure HTTP-only cookie with JWT token
      reply.setCookie('opencall-auth', response.token!, {
        httpOnly: true,
        secure: process.env['NODE_ENV'] === 'production',
        sameSite: 'strict',
        maxAge: response.expiresIn! * 1000,
        path: '/',
      });

      reply.send({
        success: response.success,
        sessionKey: response.sessionKey,
        serverProof: response.serverProof,
        expiresIn: response.expiresIn,
      });
    } catch (error) {
      logger.error('Verification error:', error);
      reply.status(500).send({
        error: 'Internal server error',
      });
    }
  });

  /**
   * POST /api/auth/ephemeral
   * Generate ephemeral identity for anonymous users
   */
  fastify.post('/ephemeral', async (request, reply) => {
    try {
      const { identity, token } = await authManager.generateEphemeralIdentity();

      // Set secure HTTP-only cookie with JWT token
      reply.setCookie('opencall-auth', token, {
        httpOnly: true,
        secure: process.env['NODE_ENV'] === 'production',
        sameSite: 'strict',
        maxAge: 4 * 60 * 60 * 1000, // 4 hours
        path: '/',
      });

      reply.send({
        identity,
        type: 'ephemeral',
        expiresIn: 14400, // 4 hours
      });
    } catch (error) {
      logger.error('Ephemeral identity error:', error);
      reply.status(500).send({
        error: 'Internal server error',
      });
    }
  });

  /**
   * POST /api/auth/logout
   * End session
   */
  fastify.post('/logout', async (request, reply) => {
    try {
      const token = request.cookies['opencall-auth'] || 
        request.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return reply.status(400).send({
          error: 'No active session',
        });
      }

      const session = await authManager.verifyToken(token);
      if (session.valid && session.sessionId) {
        await authManager.logout(session.sessionId);
      }

      // Clear cookie
      reply.clearCookie('opencall-auth');

      reply.send({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (error) {
      logger.error('Logout error:', error);
      reply.status(500).send({
        error: 'Internal server error',
      });
    }
  });

  /**
   * GET /api/auth/me
   * Get current user info
   */
  fastify.get('/me', async (request, reply) => {
    try {
      const token = request.cookies['opencall-auth'] || 
        request.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return reply.status(401).send({
          error: 'Not authenticated',
        });
      }

      const session = await authManager.verifyToken(token);

      if (!session.valid) {
        return reply.status(401).send({
          error: 'Invalid session',
        });
      }

      reply.send({
        identity: session.identity,
        sessionId: session.sessionId,
        authenticated: true,
      });
    } catch (error) {
      logger.error('Me error:', error);
      reply.status(500).send({
        error: 'Internal server error',
      });
    }
  });

  return authManager;
}

/**
 * Authentication decorator for routes
 */
export function createAuthDecorator(authManager: AuthenticationManager) {
  return async function authenticate(request: FastifyRequest, reply: FastifyReply) {
    try {
      const token = request.cookies['opencall-auth'] || 
        request.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        // Allow anonymous access, generate ephemeral identity
        const ephemeral = await authManager.generateEphemeralIdentity();
        request.user = {
          identity: ephemeral.identity,
          type: 'ephemeral',
          authenticated: false,
        };
        
        // Set ephemeral token cookie
        reply.setCookie('opencall-auth', ephemeral.token, {
          httpOnly: true,
          secure: process.env['NODE_ENV'] === 'production',
          sameSite: 'strict',
          maxAge: 4 * 60 * 60 * 1000, // 4 hours
          path: '/',
        });
        
        return;
      }

      const session = await authManager.verifyToken(token);

      if (!session.valid) {
        return reply.status(401).send({
          error: 'Invalid session',
        });
      }

      request.user = {
        identity: session.identity,
        sessionId: session.sessionId,
        authenticated: true,
      };
    } catch (error) {
      logger.error('Auth decorator error:', error);
      reply.status(500).send({
        error: 'Internal server error',
      });
    }
  };
}