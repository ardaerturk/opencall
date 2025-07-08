import { Redis } from 'ioredis';
import { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { logger } from '../../utils/logger';
import * as crypto from 'crypto';

export enum AuditEventType {
  // Authentication events
  USER_LOGIN = 'USER_LOGIN',
  USER_LOGOUT = 'USER_LOGOUT',
  USER_REGISTER = 'USER_REGISTER',
  SSO_LOGIN = 'SSO_LOGIN',
  
  // Meeting events
  MEETING_CREATED = 'MEETING_CREATED',
  MEETING_JOINED = 'MEETING_JOINED',
  MEETING_LEFT = 'MEETING_LEFT',
  MEETING_ENDED = 'MEETING_ENDED',
  MEETING_RECORDING_STARTED = 'MEETING_RECORDING_STARTED',
  MEETING_RECORDING_STOPPED = 'MEETING_RECORDING_STOPPED',
  
  // Data events
  FILE_SHARED = 'FILE_SHARED',
  FILE_DOWNLOADED = 'FILE_DOWNLOADED',
  SCREEN_SHARED = 'SCREEN_SHARED',
  CHAT_MESSAGE_SENT = 'CHAT_MESSAGE_SENT',
  
  // Admin events
  USER_CREATED = 'USER_CREATED',
  USER_UPDATED = 'USER_UPDATED',
  USER_DELETED = 'USER_DELETED',
  ORGANIZATION_UPDATED = 'ORGANIZATION_UPDATED',
  SETTINGS_CHANGED = 'SETTINGS_CHANGED',
  
  // Security events
  FAILED_LOGIN = 'FAILED_LOGIN',
  ACCESS_DENIED = 'ACCESS_DENIED',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  DATA_EXPORT = 'DATA_EXPORT',
  DATA_DELETION = 'DATA_DELETION',
}

export interface AuditEvent {
  id: string;
  timestamp: Date;
  eventType: AuditEventType;
  userId?: string;
  organizationId?: string;
  meetingId?: string;
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
  metadata?: Record<string, any>;
  encrypted?: boolean;
}

export interface AuditLoggerConfig {
  encryptionKey?: string;
  retentionDays: {
    default: number;
    security: number;
    compliance: number;
  };
  enableEncryption: boolean;
  enableCompression: boolean;
  batchSize: number;
  flushInterval: number; // milliseconds
}

export class AuditLogger {
  private redis: Redis;
  private config: AuditLoggerConfig;
  private encryptionKey?: Buffer;
  private eventBuffer: AuditEvent[] = [];
  private flushTimer?: NodeJS.Timeout;

  constructor(redis: Redis, config?: Partial<AuditLoggerConfig>) {
    this.redis = redis;
    this.config = {
      retentionDays: {
        default: 30,
        security: 90,
        compliance: 365,
      },
      enableEncryption: true,
      enableCompression: true,
      batchSize: 100,
      flushInterval: 5000, // 5 seconds
      ...config,
    };

    if (this.config.enableEncryption && this.config.encryptionKey) {
      this.encryptionKey = Buffer.from(this.config.encryptionKey, 'hex');
    }

    // Start periodic flush
    this.startPeriodicFlush();
  }

  /**
   * Log an audit event
   */
  async log(event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<void> {
    const auditEvent: AuditEvent = {
      id: randomUUID(),
      timestamp: new Date(),
      ...event,
    };

    // Add to buffer
    this.eventBuffer.push(auditEvent);

    // Flush if buffer is full
    if (this.eventBuffer.length >= this.config.batchSize) {
      await this.flush();
    }

    // Log critical events immediately
    if (this.isCriticalEvent(event.eventType)) {
      await this.flush();
    }
  }

  /**
   * Create audit event from request context
   */
  createEventFromRequest(
    request: any,
    eventType: AuditEventType,
    metadata?: Record<string, any>
  ): Omit<AuditEvent, 'id' | 'timestamp'> {
    return {
      eventType,
      userId: request.user?.identity || request.user?.id,
      organizationId: request.user?.organizationId,
      ipAddress: request.ip || request.headers['x-forwarded-for'] || request.connection?.remoteAddress,
      userAgent: request.headers['user-agent'],
      correlationId: request.id,
      metadata,
    };
  }

  /**
   * Flush event buffer to storage
   */
  private async flush(): Promise<void> {
    if (this.eventBuffer.length === 0) return;

    const events = [...this.eventBuffer];
    this.eventBuffer = [];

    try {
      const pipeline = this.redis.pipeline();

      for (const event of events) {
        const key = this.getEventKey(event);
        const ttl = this.getEventTTL(event.eventType);
        const data = await this.prepareEventData(event);

        pipeline.zadd(
          this.getIndexKey(event),
          event.timestamp.getTime(),
          event.id
        );
        pipeline.set(key, data, 'EX', ttl);
      }

      await pipeline.exec();
      
      logger.info(`Flushed ${events.length} audit events`);
    } catch (error) {
      logger.error('Failed to flush audit events:', error);
      // Re-add events to buffer for retry
      this.eventBuffer.unshift(...events);
    }
  }

  /**
   * Query audit logs
   */
  async query(options: {
    organizationId?: string;
    userId?: string;
    meetingId?: string;
    eventTypes?: AuditEventType[];
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ events: AuditEvent[]; total: number }> {
    const {
      organizationId,
      userId,
      meetingId,
      eventTypes,
      startDate,
      endDate,
      limit = 100,
      offset = 0,
    } = options;

    // Build index key
    let indexKey = 'audit:events';
    if (organizationId) indexKey = `audit:org:${organizationId}`;
    else if (userId) indexKey = `audit:user:${userId}`;
    else if (meetingId) indexKey = `audit:meeting:${meetingId}`;

    // Get event IDs from index
    const startScore = startDate ? startDate.getTime() : '-inf';
    const endScore = endDate ? endDate.getTime() : '+inf';

    const eventIds = await this.redis.zrevrangebyscore(
      indexKey,
      endScore,
      startScore,
      'LIMIT',
      offset,
      limit
    );

    // Fetch events
    const events: AuditEvent[] = [];
    for (const eventId of eventIds) {
      const data = await this.redis.get(`audit:event:${eventId}`);
      if (data) {
        const event = await this.parseEventData(data);
        if (!eventTypes || eventTypes.includes(event.eventType)) {
          events.push(event);
        }
      }
    }

    // Get total count
    const total = await this.redis.zcount(indexKey, startScore, endScore);

    return { events, total };
  }

  /**
   * Export audit logs
   */
  async export(options: {
    organizationId: string;
    format: 'json' | 'csv';
    startDate?: Date;
    endDate?: Date;
    includeMetadata?: boolean;
  }): Promise<string> {
    const { events } = await this.query({
      organizationId: options.organizationId,
      startDate: options.startDate,
      endDate: options.endDate,
      limit: 10000, // Max export size
    });

    // Log the export event
    await this.log({
      eventType: AuditEventType.DATA_EXPORT,
      organizationId: options.organizationId,
      metadata: {
        format: options.format,
        eventCount: events.length,
        startDate: options.startDate,
        endDate: options.endDate,
      },
    });

    if (options.format === 'csv') {
      return this.exportToCSV(events, options.includeMetadata);
    } else {
      return JSON.stringify(events, null, 2);
    }
  }

  /**
   * Delete audit logs (GDPR compliance)
   */
  async deleteUserLogs(userId: string): Promise<void> {
    const { events } = await this.query({ userId, limit: 10000 });

    const pipeline = this.redis.pipeline();
    for (const event of events) {
      pipeline.del(this.getEventKey(event));
      pipeline.zrem(`audit:user:${userId}`, event.id);
    }

    await pipeline.exec();

    // Log the deletion
    await this.log({
      eventType: AuditEventType.DATA_DELETION,
      userId,
      metadata: {
        deletedEvents: events.length,
      },
    });

    logger.info(`Deleted ${events.length} audit events for user ${userId}`);
  }

  /**
   * Get audit statistics
   */
  async getStatistics(organizationId: string, days: number = 30): Promise<{
    eventCounts: Record<string, number>;
    userActivity: Record<string, number>;
    dailyActivity: Array<{ date: string; count: number }>;
  }> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { events } = await this.query({
      organizationId,
      startDate,
      endDate,
      limit: 10000,
    });

    // Calculate statistics
    const eventCounts: Record<string, number> = {};
    const userActivity: Record<string, number> = {};
    const dailyActivity: Record<string, number> = {};

    for (const event of events) {
      // Event type counts
      eventCounts[event.eventType] = (eventCounts[event.eventType] || 0) + 1;

      // User activity
      if (event.userId) {
        userActivity[event.userId] = (userActivity[event.userId] || 0) + 1;
      }

      // Daily activity
      const dateKey = event.timestamp.toISOString().split('T')[0];
      dailyActivity[dateKey] = (dailyActivity[dateKey] || 0) + 1;
    }

    // Convert daily activity to array
    const dailyActivityArray = Object.entries(dailyActivity)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      eventCounts,
      userActivity,
      dailyActivity: dailyActivityArray,
    };
  }

  /**
   * Private helper methods
   */

  private getEventKey(event: AuditEvent): string {
    return `audit:event:${event.id}`;
  }

  private getIndexKey(event: AuditEvent): string {
    const keys = ['audit:events'];

    if (event.organizationId) {
      keys.push(`audit:org:${event.organizationId}`);
    }
    if (event.userId) {
      keys.push(`audit:user:${event.userId}`);
    }
    if (event.meetingId) {
      keys.push(`audit:meeting:${event.meetingId}`);
    }

    return keys.join(':');
  }

  private getEventTTL(eventType: AuditEventType): number {
    const securityEvents = [
      AuditEventType.FAILED_LOGIN,
      AuditEventType.ACCESS_DENIED,
      AuditEventType.SUSPICIOUS_ACTIVITY,
    ];

    const complianceEvents = [
      AuditEventType.DATA_EXPORT,
      AuditEventType.DATA_DELETION,
      AuditEventType.USER_DELETED,
    ];

    if (securityEvents.includes(eventType)) {
      return this.config.retentionDays.security * 86400;
    } else if (complianceEvents.includes(eventType)) {
      return this.config.retentionDays.compliance * 86400;
    } else {
      return this.config.retentionDays.default * 86400;
    }
  }

  private async prepareEventData(event: AuditEvent): Promise<string> {
    let data = JSON.stringify(event);

    if (this.config.enableEncryption && this.encryptionKey) {
      data = this.encrypt(data);
      event.encrypted = true;
    }

    return data;
  }

  private async parseEventData(data: string): Promise<AuditEvent> {
    let jsonData = data;

    if (this.config.enableEncryption && this.encryptionKey && data.startsWith('enc:')) {
      jsonData = this.decrypt(data);
    }

    return JSON.parse(jsonData);
  }

  private encrypt(data: string): string {
    if (!this.encryptionKey) throw new Error('Encryption key not set');

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);

    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return `enc:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  private decrypt(data: string): string {
    if (!this.encryptionKey) throw new Error('Encryption key not set');

    const parts = data.split(':');
    if (parts.length !== 4 || parts[0] !== 'enc') {
      throw new Error('Invalid encrypted data format');
    }

    const iv = Buffer.from(parts[1], 'hex');
    const authTag = Buffer.from(parts[2], 'hex');
    const encrypted = parts[3];

    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  private exportToCSV(events: AuditEvent[], includeMetadata: boolean = false): string {
    const headers = [
      'ID',
      'Timestamp',
      'Event Type',
      'User ID',
      'Organization ID',
      'Meeting ID',
      'IP Address',
      'User Agent',
      'Correlation ID',
    ];

    if (includeMetadata) {
      headers.push('Metadata');
    }

    const rows = [headers.join(',')];

    for (const event of events) {
      const row = [
        event.id,
        event.timestamp.toISOString(),
        event.eventType,
        event.userId || '',
        event.organizationId || '',
        event.meetingId || '',
        event.ipAddress || '',
        `"${(event.userAgent || '').replace(/"/g, '""')}"`,
        event.correlationId || '',
      ];

      if (includeMetadata) {
        row.push(`"${JSON.stringify(event.metadata || {}).replace(/"/g, '""')}"`);
      }

      rows.push(row.join(','));
    }

    return rows.join('\n');
  }

  private isCriticalEvent(eventType: AuditEventType): boolean {
    const criticalEvents = [
      AuditEventType.FAILED_LOGIN,
      AuditEventType.ACCESS_DENIED,
      AuditEventType.SUSPICIOUS_ACTIVITY,
      AuditEventType.DATA_DELETION,
      AuditEventType.USER_DELETED,
    ];

    return criticalEvents.includes(eventType);
  }

  private startPeriodicFlush(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch(error => {
        logger.error('Periodic flush failed:', error);
      });
    }, this.config.flushInterval);
  }

  /**
   * Cleanup
   */
  async close(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    await this.flush();
  }
}

// Fastify plugin for audit logging
export async function auditPlugin(fastify: FastifyInstance, options: any) {
  const auditLogger = new AuditLogger(fastify.redis, options);

  // Decorate fastify instance
  fastify.decorate('auditLogger', auditLogger);

  // Add audit logging hooks
  fastify.addHook('onRequest', async (request, reply) => {
    // Add correlation ID if not present
    if (!request.id) {
      request.id = randomUUID();
    }
  });

  // Clean up on close
  fastify.addHook('onClose', async () => {
    await auditLogger.close();
  });
}