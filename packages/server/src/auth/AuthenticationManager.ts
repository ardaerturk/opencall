/**
 * Server-side authentication manager for SRP zero-knowledge authentication
 */

import { Redis } from 'ioredis';
import { randomBytes } from 'crypto';
import * as jwt from 'jsonwebtoken';
import {
  SRP,
  SRPVerifier,
  SRPServerSession,
  SRPChallenge,
  SRPProof,
  bigIntToUint8Array,
  uint8ArrayToBigInt,
} from '@opencall/core';
import {
  AuthenticationRequest,
  AuthenticationChallenge,
  AuthenticationProof,
  AuthenticationResponse,
} from '@opencall/core';
import { logger } from '../utils/logger';

export interface AuthConfig {
  sessionTTL: number; // Session TTL in seconds
  challengeTTL: number; // Challenge TTL in seconds
  jwtSecret: string;
  jwtExpiresIn: string;
}

export class AuthenticationManager {
  private srp: SRP;
  private redis: Redis;
  private config: AuthConfig;

  constructor(redis: Redis, config: Partial<AuthConfig> = {}) {
    this.srp = new SRP();
    this.redis = redis;
    this.config = {
      sessionTTL: 3600, // 1 hour
      challengeTTL: 300, // 5 minutes
      jwtSecret: process.env.JWT_SECRET || 'opencall-srp-secret-change-me',
      jwtExpiresIn: '24h',
      ...config,
    };
  }

  /**
   * Register a new user with SRP verifier
   */
  public async registerUser(
    identity: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Check if user already exists
      const existingVerifier = await this.redis.get(`verifier:${identity}`);
      if (existingVerifier) {
        return { success: false, error: 'User already exists' };
      }

      // Create SRP verifier
      const verifier = await this.srp.createVerifier(identity, password);

      // Store verifier in Redis
      const verifierData = {
        identity: verifier.identity,
        salt: Buffer.from(verifier.salt).toString('base64'),
        verifier: verifier.verifier.toString(),
      };

      await this.redis.set(
        `verifier:${identity}`,
        JSON.stringify(verifierData),
        'EX',
        this.config.sessionTTL * 24 * 30 // 30 days
      );

      logger.info(`User registered: ${identity}`);
      return { success: true };
    } catch (error) {
      logger.error('Error registering user:', error);
      return { success: false, error: 'Registration failed' };
    }
  }

  /**
   * Create authentication challenge for user
   */
  public async createChallenge(
    request: AuthenticationRequest
  ): Promise<AuthenticationChallenge | null> {
    try {
      // Retrieve user's verifier
      const verifierData = await this.redis.get(`verifier:${request.identity}`);
      if (!verifierData) {
        logger.warn(`Authentication attempt for unknown user: ${request.identity}`);
        return null;
      }

      const stored = JSON.parse(verifierData);
      const verifier: SRPVerifier = {
        identity: stored.identity,
        salt: Buffer.from(stored.salt, 'base64'),
        verifier: BigInt(stored.verifier),
      };

      // Generate session ID
      const sessionId = randomBytes(16).toString('hex');

      // Create SRP challenge
      const { session, challenge } = await this.srp.serverCreateChallenge(
        verifier,
        sessionId
      );

      // Store server session in Redis
      const sessionData = {
        identity: session.identity,
        salt: Buffer.from(session.salt).toString('base64'),
        verifier: session.verifier.toString(),
        privateKey: session.privateKey.toString(),
        publicKey: session.publicKey.toString(),
        clientPublicKey: request.publicKey,
      };

      await this.redis.set(
        `session:${sessionId}`,
        JSON.stringify(sessionData),
        'EX',
        this.config.challengeTTL
      );

      logger.info(`Challenge created for user: ${request.identity}`);

      return {
        sessionId: challenge.sessionId,
        salt: Buffer.from(challenge.salt).toString('base64'),
        serverPublicKey: bigIntToUint8Array(challenge.serverPublicKey)
          .reduce((acc, byte) => acc + byte.toString(16).padStart(2, '0'), ''),
      };
    } catch (error) {
      logger.error('Error creating challenge:', error);
      return null;
    }
  }

  /**
   * Verify client proof and establish session
   */
  public async verifyProof(
    proof: AuthenticationProof
  ): Promise<AuthenticationResponse> {
    try {
      // Retrieve server session
      const sessionData = await this.redis.get(`session:${proof.sessionId}`);
      if (!sessionData) {
        return { success: false };
      }

      const stored = JSON.parse(sessionData);
      
      // Reconstruct server session
      const session: SRPServerSession = {
        identity: stored.identity,
        salt: Buffer.from(stored.salt, 'base64'),
        verifier: BigInt(stored.verifier),
        privateKey: BigInt(stored.privateKey),
        publicKey: BigInt(stored.publicKey),
      };

      // Convert proof data
      const srpProof: SRPProof = {
        clientPublicKey: BigInt('0x' + proof.clientPublicKey),
        proof: Buffer.from(proof.proof, 'base64'),
        sessionId: proof.sessionId,
      };

      // Verify proof
      const result = await this.srp.serverVerifyProof(session, srpProof);

      if (!result.success) {
        logger.warn(`Authentication failed for session: ${proof.sessionId}`);
        await this.redis.del(`session:${proof.sessionId}`);
        return { success: false };
      }

      // Generate JWT token
      const token = jwt.sign(
        {
          identity: session.identity,
          sessionId: proof.sessionId,
          type: 'authenticated',
        },
        this.config.jwtSecret,
        { expiresIn: this.config.jwtExpiresIn }
      );

      // Store authenticated session
      const authSession = {
        identity: session.identity,
        sessionKey: Buffer.from(result.sessionKey!).toString('base64'),
        createdAt: Date.now(),
        lastActivity: Date.now(),
      };

      await this.redis.set(
        `auth:${proof.sessionId}`,
        JSON.stringify(authSession),
        'EX',
        this.config.sessionTTL
      );

      // Clean up challenge session
      await this.redis.del(`session:${proof.sessionId}`);

      logger.info(`Authentication successful for user: ${session.identity}`);

      return {
        success: true,
        sessionKey: Buffer.from(result.sessionKey!).toString('base64'),
        serverProof: Buffer.from(result.serverProof!).toString('base64'),
        token,
        expiresIn: this.config.sessionTTL,
      };
    } catch (error) {
      logger.error('Error verifying proof:', error);
      return { success: false };
    }
  }

  /**
   * Verify JWT token and return session info
   */
  public async verifyToken(token: string): Promise<{
    valid: boolean;
    identity?: string;
    sessionId?: string;
  }> {
    try {
      const decoded = jwt.verify(token, this.config.jwtSecret) as any;
      
      // Check if session still exists in Redis
      const session = await this.redis.get(`auth:${decoded.sessionId}`);
      if (!session) {
        return { valid: false };
      }

      // Update last activity
      const sessionData = JSON.parse(session);
      sessionData.lastActivity = Date.now();
      await this.redis.set(
        `auth:${decoded.sessionId}`,
        JSON.stringify(sessionData),
        'EX',
        this.config.sessionTTL
      );

      return {
        valid: true,
        identity: decoded.identity,
        sessionId: decoded.sessionId,
      };
    } catch (error) {
      return { valid: false };
    }
  }

  /**
   * Generate ephemeral identity for anonymous users
   */
  public async generateEphemeralIdentity(): Promise<{
    identity: string;
    token: string;
  }> {
    const identity = `anon-${randomBytes(8).toString('hex')}`;
    const sessionId = randomBytes(16).toString('hex');

    // Generate ephemeral JWT
    const token = jwt.sign(
      {
        identity,
        sessionId,
        type: 'ephemeral',
      },
      this.config.jwtSecret,
      { expiresIn: '4h' } // Shorter expiry for ephemeral identities
    );

    // Store ephemeral session
    const ephemeralSession = {
      identity,
      type: 'ephemeral',
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };

    await this.redis.set(
      `auth:${sessionId}`,
      JSON.stringify(ephemeralSession),
      'EX',
      14400 // 4 hours
    );

    logger.info(`Ephemeral identity created: ${identity}`);

    return { identity, token };
  }

  /**
   * Logout user by invalidating session
   */
  public async logout(sessionId: string): Promise<boolean> {
    try {
      await this.redis.del(`auth:${sessionId}`);
      logger.info(`Session logged out: ${sessionId}`);
      return true;
    } catch (error) {
      logger.error('Error during logout:', error);
      return false;
    }
  }

  /**
   * Login user via SSO provider
   */
  public async loginSSO(data: {
    email: string;
    name: string;
    provider: string;
    providerId: string;
    attributes?: Record<string, any>;
  }): Promise<{ token: string; identity: any }> {
    const identity = `${data.provider}:${data.email}`;
    const sessionId = randomBytes(16).toString('hex');

    // Generate SSO JWT with additional claims
    const token = jwt.sign(
      {
        identity,
        sessionId,
        type: 'sso',
        provider: data.provider,
        providerId: data.providerId,
        email: data.email,
        name: data.name,
        organizationId: data.attributes?.organizationId,
        roles: data.attributes?.roles || ['user'],
      },
      this.config.jwtSecret,
      { expiresIn: this.config.jwtExpiresIn }
    );

    // Store SSO session
    const ssoSession = {
      identity,
      email: data.email,
      name: data.name,
      provider: data.provider,
      providerId: data.providerId,
      type: 'sso',
      attributes: data.attributes || {},
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };

    await this.redis.set(
      `auth:${sessionId}`,
      JSON.stringify(ssoSession),
      'EX',
      this.config.sessionTTL
    );

    logger.info(`SSO authentication successful for user: ${data.email} via ${data.provider}`);

    return {
      token,
      identity: {
        id: identity,
        username: data.email,
        displayName: data.name,
        isAuthenticated: true,
        isEphemeral: false,
        organizationId: data.attributes?.organizationId,
        roles: data.attributes?.roles || ['user'],
      },
    };
  }
}