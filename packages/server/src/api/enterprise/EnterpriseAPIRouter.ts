import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { APIKey, Organization, EnterpriseUser, Webhook } from '@opencall/core';
import { nanoid } from 'nanoid';
import * as crypto from 'crypto';
import { AuditLogger } from '../../audit/AuditLogger';
import postgres from 'postgres';
import IORedis from 'ioredis';

interface EnterpriseAPIContext {
  apiKey: APIKey;
  organization: Organization;
}

export class EnterpriseAPIRouter {
  constructor(
    private auditLogger: AuditLogger,
    private postgresClient: postgres.Sql,
    private redisClient: IORedis
  ) {}

  async register(fastify: FastifyInstance, options: FastifyPluginOptions): Promise<void> {
    // API Key authentication middleware
    fastify.addHook('preHandler', async (request, reply) => {
      const apiKey = request.headers['x-api-key'] as string;
      if (!apiKey) {
        return reply.code(401).send({ error: 'Missing API key' });
      }

      const keyData = await this.validateAPIKey(apiKey);
      if (!keyData) {
        return reply.code(401).send({ error: 'Invalid API key' });
      }

      // Check rate limits
      const rateLimited = await this.checkRateLimit(keyData);
      if (rateLimited) {
        return reply.code(429).send({ error: 'Rate limit exceeded' });
      }

      // Attach context to request
      request.context = {
        apiKey: keyData,
        organization: await this.getOrganization(keyData.organizationId),
      };

      // Update last used timestamp
      await this.updateAPIKeyUsage(keyData.id);
    });

    // Organization Management
    fastify.get('/organization', async (request: FastifyRequest, reply: FastifyReply) => {
      const { organization } = request.context as EnterpriseAPIContext;
      
      await this.auditLogger.log({
        organizationId: organization.id,
        action: 'api.organization.read',
        resource: 'organization',
        resourceId: organization.id,
        details: { via: 'api' },
      });

      return reply.send({
        data: organization,
      });
    });

    fastify.patch('/organization', async (request: FastifyRequest<{
      Body: Partial<Organization>
    }>, reply: FastifyReply) => {
      const { organization, apiKey } = request.context as EnterpriseAPIContext;
      
      if (!apiKey.permissions.includes('organization:write')) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      const updates = request.body;
      const updated = await this.updateOrganization(organization.id, updates);

      await this.auditLogger.log({
        organizationId: organization.id,
        action: 'api.organization.updated',
        resource: 'organization',
        resourceId: organization.id,
        details: { updates, via: 'api' },
      });

      return reply.send({ data: updated });
    });

    // User Management
    fastify.get('/users', async (request: FastifyRequest<{
      Querystring: {
        limit?: number;
        offset?: number;
        search?: string;
        role?: string;
      }
    }>, reply: FastifyReply) => {
      const { organization, apiKey } = request.context as EnterpriseAPIContext;
      
      if (!apiKey.permissions.includes('users:read')) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      const { limit = 100, offset = 0, search, role } = request.query;
      const users = await this.getOrganizationUsers(organization.id, {
        limit,
        offset,
        search,
        role,
      });

      return reply.send({
        data: users,
        meta: {
          limit,
          offset,
          total: users.length,
        },
      });
    });

    fastify.post('/users', async (request: FastifyRequest<{
      Body: {
        email: string;
        name: string;
        role: 'admin' | 'member' | 'guest';
        permissions?: string[];
      }
    }>, reply: FastifyReply) => {
      const { organization, apiKey } = request.context as EnterpriseAPIContext;
      
      if (!apiKey.permissions.includes('users:write')) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      const user = await this.createUser(organization.id, request.body);

      await this.auditLogger.log({
        organizationId: organization.id,
        action: 'api.user.created',
        resource: 'user',
        resourceId: user.id,
        details: { email: user.email, role: user.role, via: 'api' },
      });

      return reply.code(201).send({ data: user });
    });

    fastify.delete('/users/:userId', async (request: FastifyRequest<{
      Params: { userId: string }
    }>, reply: FastifyReply) => {
      const { organization, apiKey } = request.context as EnterpriseAPIContext;
      
      if (!apiKey.permissions.includes('users:delete')) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      await this.deleteUser(organization.id, request.params.userId);

      await this.auditLogger.log({
        organizationId: organization.id,
        action: 'api.user.deleted',
        resource: 'user',
        resourceId: request.params.userId,
        details: { via: 'api' },
        severity: 'warning',
      });

      return reply.code(204).send();
    });

    // Meeting Management
    fastify.get('/meetings', async (request: FastifyRequest<{
      Querystring: {
        limit?: number;
        offset?: number;
        status?: 'scheduled' | 'active' | 'completed';
        startDate?: string;
        endDate?: string;
      }
    }>, reply: FastifyReply) => {
      const { organization, apiKey } = request.context as EnterpriseAPIContext;
      
      if (!apiKey.permissions.includes('meetings:read')) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      const meetings = await this.getOrganizationMeetings(organization.id, request.query);
      
      return reply.send({
        data: meetings,
        meta: {
          limit: request.query.limit || 100,
          offset: request.query.offset || 0,
          total: meetings.length,
        },
      });
    });

    fastify.post('/meetings', async (request: FastifyRequest<{
      Body: {
        title: string;
        scheduledFor?: string;
        duration?: number;
        settings?: any;
      }
    }>, reply: FastifyReply) => {
      const { organization, apiKey } = request.context as EnterpriseAPIContext;
      
      if (!apiKey.permissions.includes('meetings:write')) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      const meeting = await this.createMeeting(organization.id, request.body);

      await this.auditLogger.log({
        organizationId: organization.id,
        action: 'api.meeting.created',
        resource: 'meeting',
        resourceId: meeting.id,
        details: { title: meeting.title, via: 'api' },
      });

      return reply.code(201).send({ data: meeting });
    });

    // Analytics
    fastify.get('/analytics', async (request: FastifyRequest<{
      Querystring: {
        startDate: string;
        endDate: string;
        granularity?: 'hour' | 'day' | 'week' | 'month';
      }
    }>, reply: FastifyReply) => {
      const { organization, apiKey } = request.context as EnterpriseAPIContext;
      
      if (!apiKey.permissions.includes('analytics:read')) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      const analytics = await this.getOrganizationAnalytics(
        organization.id,
        new Date(request.query.startDate),
        new Date(request.query.endDate),
        request.query.granularity || 'day'
      );

      return reply.send({ data: analytics });
    });

    // Webhook Management
    fastify.get('/webhooks', async (request: FastifyRequest, reply: FastifyReply) => {
      const { organization, apiKey } = request.context as EnterpriseAPIContext;
      
      if (!apiKey.permissions.includes('webhooks:read')) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      const webhooks = await this.getOrganizationWebhooks(organization.id);
      
      return reply.send({ data: webhooks });
    });

    fastify.post('/webhooks', async (request: FastifyRequest<{
      Body: {
        url: string;
        events: string[];
        headers?: Record<string, string>;
      }
    }>, reply: FastifyReply) => {
      const { organization, apiKey } = request.context as EnterpriseAPIContext;
      
      if (!apiKey.permissions.includes('webhooks:write')) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      const webhook = await this.createWebhook(organization.id, request.body);

      await this.auditLogger.log({
        organizationId: organization.id,
        action: 'api.webhook.created',
        resource: 'webhook',
        resourceId: webhook.id,
        details: { url: webhook.url, events: webhook.events, via: 'api' },
      });

      return reply.code(201).send({ data: webhook });
    });

    // API Key Management
    fastify.post('/api-keys', async (request: FastifyRequest<{
      Body: {
        name: string;
        permissions: string[];
        expiresIn?: number; // days
      }
    }>, reply: FastifyReply) => {
      const { organization, apiKey } = request.context as EnterpriseAPIContext;
      
      if (!apiKey.permissions.includes('api_keys:write')) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      const newKey = await this.createAPIKey(organization.id, request.body);

      await this.auditLogger.log({
        organizationId: organization.id,
        action: 'api.api_key.created',
        resource: 'api_key',
        resourceId: newKey.id,
        details: { name: newKey.name, permissions: newKey.permissions, via: 'api' },
        severity: 'warning',
      });

      // Return the key only once
      return reply.code(201).send({
        data: {
          ...newKey,
          key: newKey.plainKey, // Only returned on creation
        },
      });
    });

    fastify.delete('/api-keys/:keyId', async (request: FastifyRequest<{
      Params: { keyId: string }
    }>, reply: FastifyReply) => {
      const { organization, apiKey } = request.context as EnterpriseAPIContext;
      
      if (!apiKey.permissions.includes('api_keys:delete')) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      await this.revokeAPIKey(organization.id, request.params.keyId);

      await this.auditLogger.log({
        organizationId: organization.id,
        action: 'api.api_key.revoked',
        resource: 'api_key',
        resourceId: request.params.keyId,
        details: { via: 'api' },
        severity: 'warning',
      });

      return reply.code(204).send();
    });

    // Usage Statistics
    fastify.get('/usage', async (request: FastifyRequest<{
      Querystring: {
        startDate: string;
        endDate: string;
        resource?: string;
      }
    }>, reply: FastifyReply) => {
      const { organization, apiKey } = request.context as EnterpriseAPIContext;
      
      if (!apiKey.permissions.includes('usage:read')) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      const usage = await this.getOrganizationUsage(
        organization.id,
        new Date(request.query.startDate),
        new Date(request.query.endDate),
        request.query.resource
      );

      return reply.send({ data: usage });
    });
  }

  // Helper methods
  private async validateAPIKey(key: string): Promise<APIKey | null> {
    const hashedKey = crypto.createHash('sha256').update(key).digest('hex');
    
    const result = await this.postgresClient`
      SELECT * FROM api_keys
      WHERE key = ${hashedKey} AND (expires_at IS NULL OR expires_at > NOW())
    `;

    return result[0] || null;
  }

  private async checkRateLimit(apiKey: APIKey): Promise<boolean> {
    if (!apiKey.rateLimit) return false;

    const key = `rate_limit:${apiKey.id}`;
    const current = await this.redisClient.incr(key);
    
    if (current === 1) {
      const ttl = apiKey.rateLimit.window === 'minute' ? 60 :
                 apiKey.rateLimit.window === 'hour' ? 3600 :
                 86400; // day
      await this.redisClient.expire(key, ttl);
    }

    return current > apiKey.rateLimit.requests;
  }

  private async updateAPIKeyUsage(keyId: string): Promise<void> {
    await this.postgresClient`
      UPDATE api_keys
      SET last_used_at = NOW()
      WHERE id = ${keyId}
    `;
  }

  private async getOrganization(organizationId: string): Promise<Organization> {
    const result = await this.postgresClient`
      SELECT * FROM organizations WHERE id = ${organizationId}
    `;
    return result[0];
  }

  private async updateOrganization(
    organizationId: string,
    updates: Partial<Organization>
  ): Promise<Organization> {
    const result = await this.postgresClient`
      UPDATE organizations
      SET ${this.postgresClient(updates)}, updated_at = NOW()
      WHERE id = ${organizationId}
      RETURNING *
    `;
    return result[0];
  }

  private async getOrganizationUsers(
    organizationId: string,
    filters: any
  ): Promise<EnterpriseUser[]> {
    let query = this.postgresClient`
      SELECT * FROM users
      WHERE organization_id = ${organizationId}
    `;

    if (filters.search) {
      query = this.postgresClient`
        ${query} AND (email ILIKE ${`%${filters.search}%`} OR name ILIKE ${`%${filters.search}%`})
      `;
    }

    if (filters.role) {
      query = this.postgresClient`
        ${query} AND role = ${filters.role}
      `;
    }

    query = this.postgresClient`
      ${query}
      ORDER BY created_at DESC
      LIMIT ${filters.limit}
      OFFSET ${filters.offset}
    `;

    return await query;
  }

  private async createUser(
    organizationId: string,
    userData: any
  ): Promise<EnterpriseUser> {
    const user: EnterpriseUser = {
      id: nanoid(),
      organizationId,
      ...userData,
      metadata: {
        createdAt: new Date(),
        provisionedVia: 'api',
      },
    };

    await this.postgresClient`
      INSERT INTO users ${this.postgresClient(user)}
    `;

    return user;
  }

  private async deleteUser(organizationId: string, userId: string): Promise<void> {
    await this.postgresClient`
      DELETE FROM users
      WHERE organization_id = ${organizationId} AND id = ${userId}
    `;
  }

  private async getOrganizationMeetings(
    organizationId: string,
    filters: any
  ): Promise<any[]> {
    // Implementation for fetching meetings
    return [];
  }

  private async createMeeting(organizationId: string, meetingData: any): Promise<any> {
    // Implementation for creating a meeting
    return {
      id: nanoid(),
      organizationId,
      ...meetingData,
      createdAt: new Date(),
    };
  }

  private async getOrganizationAnalytics(
    organizationId: string,
    startDate: Date,
    endDate: Date,
    granularity: string
  ): Promise<any> {
    // Implementation for analytics
    return {};
  }

  private async getOrganizationWebhooks(organizationId: string): Promise<Webhook[]> {
    return await this.postgresClient`
      SELECT * FROM webhooks
      WHERE organization_id = ${organizationId}
      ORDER BY created_at DESC
    `;
  }

  private async createWebhook(
    organizationId: string,
    webhookData: any
  ): Promise<Webhook> {
    const webhook: Webhook = {
      id: nanoid(),
      organizationId,
      ...webhookData,
      secret: crypto.randomBytes(32).toString('hex'),
      enabled: true,
      retryPolicy: {
        maxRetries: 3,
        backoffMultiplier: 2,
      },
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        failureCount: 0,
      },
    };

    await this.postgresClient`
      INSERT INTO webhooks ${this.postgresClient(webhook)}
    `;

    return webhook;
  }

  private async createAPIKey(
    organizationId: string,
    keyData: any
  ): Promise<APIKey & { plainKey: string }> {
    const plainKey = `opc_${crypto.randomBytes(32).toString('hex')}`;
    const hashedKey = crypto.createHash('sha256').update(plainKey).digest('hex');
    
    const apiKey: APIKey = {
      id: nanoid(),
      organizationId,
      name: keyData.name,
      key: hashedKey,
      prefix: plainKey.substring(0, 8),
      permissions: keyData.permissions,
      expiresAt: keyData.expiresIn
        ? new Date(Date.now() + keyData.expiresIn * 24 * 60 * 60 * 1000)
        : undefined,
      createdAt: new Date(),
      createdBy: 'api',
    };

    await this.postgresClient`
      INSERT INTO api_keys ${this.postgresClient(apiKey)}
    `;

    return { ...apiKey, plainKey };
  }

  private async revokeAPIKey(organizationId: string, keyId: string): Promise<void> {
    await this.postgresClient`
      DELETE FROM api_keys
      WHERE organization_id = ${organizationId} AND id = ${keyId}
    `;
  }

  private async getOrganizationUsage(
    organizationId: string,
    startDate: Date,
    endDate: Date,
    resource?: string
  ): Promise<any> {
    // Implementation for usage statistics
    return {
      meetings: {
        total: 0,
        duration: 0,
      },
      storage: {
        recordings: 0,
        files: 0,
      },
      api: {
        requests: 0,
        errors: 0,
      },
    };
  }
}