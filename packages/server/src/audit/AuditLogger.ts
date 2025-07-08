import { AuditLog } from '@opencall/core';
import * as winston from 'winston';
import * as DailyRotateFile from 'winston-daily-rotate-file';
import * as CryptoJS from 'crypto-js';
import { nanoid } from 'nanoid';
import { FastifyRequest } from 'fastify';
import IORedis from 'ioredis';
import postgres from 'postgres';

export interface AuditLogOptions {
  encryptionKey: string;
  retentionDays: number;
  redisClient: IORedis;
  postgresClient: postgres.Sql;
}

export class AuditLogger {
  private logger: winston.Logger;
  private encryptionKey: string;
  private correlationIds: Map<string, string> = new Map();
  
  constructor(private options: AuditLogOptions) {
    this.encryptionKey = options.encryptionKey;
    
    // Configure Winston with daily rotation
    const fileRotateTransport = new DailyRotateFile({
      filename: 'logs/audit-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: `${options.retentionDays}d`,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
    });

    // Encrypted file transport for sensitive logs
    const encryptedTransport = new DailyRotateFile({
      filename: 'logs/audit-encrypted-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: `${options.retentionDays}d`,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(info => {
          const encrypted = this.encryptLog(info);
          return JSON.stringify(encrypted);
        })
      ),
    });

    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        fileRotateTransport,
        encryptedTransport,
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          ),
        }),
      ],
    });
  }

  async log(log: Omit<AuditLog, 'id' | 'timestamp'>): Promise<void> {
    const auditLog: AuditLog = {
      ...log,
      id: nanoid(),
      timestamp: new Date(),
      correlationId: log.correlationId || this.getCorrelationId(),
    };

    // Log to Winston
    this.logger.info('Audit Log', auditLog);

    // Store in PostgreSQL for querying
    try {
      await this.options.postgresClient`
        INSERT INTO audit_logs (
          id, organization_id, user_id, action, resource, 
          resource_id, details, ip_address, user_agent, 
          timestamp, correlation_id, severity
        ) VALUES (
          ${auditLog.id}, ${auditLog.organizationId}, ${auditLog.userId},
          ${auditLog.action}, ${auditLog.resource}, ${auditLog.resourceId},
          ${JSON.stringify(auditLog.details)}, ${auditLog.ipAddress},
          ${auditLog.userAgent}, ${auditLog.timestamp}, ${auditLog.correlationId},
          ${auditLog.severity || 'info'}
        )
      `;
    } catch (error) {
      this.logger.error('Failed to store audit log in database', error);
    }

    // Push to Redis for real-time monitoring
    try {
      await this.options.redisClient.lpush(
        `audit:${auditLog.organizationId}`,
        JSON.stringify(auditLog)
      );
      await this.options.redisClient.ltrim(
        `audit:${auditLog.organizationId}`,
        0,
        999 // Keep last 1000 logs in Redis
      );
    } catch (error) {
      this.logger.error('Failed to push audit log to Redis', error);
    }
  }

  private encryptLog(log: any): { encrypted: string; metadata: any } {
    const sensitive = ['details', 'ipAddress', 'userAgent'];
    const toEncrypt: any = {};
    const metadata: any = {};

    Object.keys(log).forEach(key => {
      if (sensitive.includes(key)) {
        toEncrypt[key] = log[key];
      } else {
        metadata[key] = log[key];
      }
    });

    const encrypted = CryptoJS.AES.encrypt(
      JSON.stringify(toEncrypt),
      this.encryptionKey
    ).toString();

    return { encrypted, metadata };
  }

  decryptLog(encryptedData: string): any {
    const bytes = CryptoJS.AES.decrypt(encryptedData, this.encryptionKey);
    return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
  }

  setCorrelationId(id: string): void {
    this.correlationIds.set('current', id);
  }

  getCorrelationId(): string {
    return this.correlationIds.get('current') || nanoid();
  }

  // Extract request context for audit logging
  extractRequestContext(request: FastifyRequest): {
    ipAddress: string;
    userAgent: string;
    correlationId: string;
  } {
    return {
      ipAddress: request.ip || 'unknown',
      userAgent: request.headers['user-agent'] || 'unknown',
      correlationId: (request.headers['x-correlation-id'] as string) || nanoid(),
    };
  }

  // Query audit logs with filters
  async queryLogs(filters: {
    organizationId: string;
    startDate?: Date;
    endDate?: Date;
    userId?: string;
    action?: string;
    resource?: string;
    severity?: string;
    limit?: number;
    offset?: number;
  }): Promise<AuditLog[]> {
    let query = this.options.postgresClient`
      SELECT * FROM audit_logs
      WHERE organization_id = ${filters.organizationId}
    `;

    if (filters.startDate) {
      query = this.options.postgresClient`
        ${query} AND timestamp >= ${filters.startDate}
      `;
    }

    if (filters.endDate) {
      query = this.options.postgresClient`
        ${query} AND timestamp <= ${filters.endDate}
      `;
    }

    if (filters.userId) {
      query = this.options.postgresClient`
        ${query} AND user_id = ${filters.userId}
      `;
    }

    if (filters.action) {
      query = this.options.postgresClient`
        ${query} AND action LIKE ${`%${filters.action}%`}
      `;
    }

    if (filters.resource) {
      query = this.options.postgresClient`
        ${query} AND resource = ${filters.resource}
      `;
    }

    if (filters.severity) {
      query = this.options.postgresClient`
        ${query} AND severity = ${filters.severity}
      `;
    }

    query = this.options.postgresClient`
      ${query}
      ORDER BY timestamp DESC
      LIMIT ${filters.limit || 100}
      OFFSET ${filters.offset || 0}
    `;

    const results = await query;
    return results.map(row => ({
      ...row,
      details: typeof row.details === 'string' ? JSON.parse(row.details) : row.details,
    }));
  }

  // Export logs for compliance
  async exportLogs(
    organizationId: string,
    format: 'csv' | 'json',
    filters?: {
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<string> {
    const logs = await this.queryLogs({
      organizationId,
      ...filters,
      limit: 100000, // Max export size
    });

    if (format === 'json') {
      return JSON.stringify(logs, null, 2);
    }

    // CSV format
    const headers = [
      'id', 'timestamp', 'userId', 'action', 'resource',
      'resourceId', 'ipAddress', 'userAgent', 'severity'
    ];

    const csv = [
      headers.join(','),
      ...logs.map(log => [
        log.id,
        log.timestamp.toISOString(),
        log.userId || '',
        log.action,
        log.resource,
        log.resourceId || '',
        log.ipAddress || '',
        log.userAgent || '',
        log.severity,
      ].map(field => `"${field}"`).join(','))
    ].join('\n');

    return csv;
  }

  // Integration with SIEM systems
  async forwardToSIEM(log: AuditLog, siemEndpoint: string): Promise<void> {
    try {
      const response = await fetch(siemEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SIEM_API_KEY}`,
        },
        body: JSON.stringify({
          ...log,
          source: 'opencall',
          environment: process.env.NODE_ENV,
        }),
      });

      if (!response.ok) {
        throw new Error(`SIEM forwarding failed: ${response.statusText}`);
      }
    } catch (error) {
      this.logger.error('Failed to forward log to SIEM', error);
    }
  }
}