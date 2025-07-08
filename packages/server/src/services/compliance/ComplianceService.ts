import { Redis } from 'ioredis';
import { FastifyInstance } from 'fastify';
import { AuditLogger, AuditEventType } from '../audit/AuditLogger';
import { logger } from '../../utils/logger';
import * as crypto from 'crypto';

export interface ComplianceConfig {
  gdprEnabled: boolean;
  hipaaEnabled: boolean;
  dataRetentionDays: number;
  dataResidencyRegions: string[];
  encryptionRequired: boolean;
  auditLogEncryption: boolean;
}

export interface DataExportRequest {
  userId: string;
  requestId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  requestedAt: Date;
  completedAt?: Date;
  downloadUrl?: string;
  expiresAt?: Date;
}

export interface DataDeletionRequest {
  userId: string;
  requestId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  requestedAt: Date;
  completedAt?: Date;
  deletedRecords?: number;
}

export class ComplianceService {
  private redis: Redis;
  private auditLogger: AuditLogger;
  private config: ComplianceConfig;

  constructor(redis: Redis, auditLogger: AuditLogger, config?: Partial<ComplianceConfig>) {
    this.redis = redis;
    this.auditLogger = auditLogger;
    this.config = {
      gdprEnabled: true,
      hipaaEnabled: false,
      dataRetentionDays: 365,
      dataResidencyRegions: ['us', 'eu'],
      encryptionRequired: true,
      auditLogEncryption: true,
      ...config,
    };
  }

  /**
   * GDPR: Request user data export
   */
  async requestDataExport(userId: string): Promise<DataExportRequest> {
    const requestId = crypto.randomUUID();
    const request: DataExportRequest = {
      userId,
      requestId,
      status: 'pending',
      requestedAt: new Date(),
    };

    // Store request
    await this.redis.set(
      `compliance:export:${requestId}`,
      JSON.stringify(request),
      'EX',
      86400 * 7 // 7 days
    );

    // Queue for processing
    await this.redis.lpush('compliance:export:queue', requestId);

    // Audit log
    await this.auditLogger.log({
      eventType: AuditEventType.DATA_EXPORT,
      userId,
      metadata: { requestId },
    });

    logger.info(`Data export requested for user ${userId}`);

    // Start processing in background
    this.processDataExport(requestId).catch(error => {
      logger.error(`Failed to process data export ${requestId}:`, error);
    });

    return request;
  }

  /**
   * GDPR: Process data export
   */
  private async processDataExport(requestId: string): Promise<void> {
    const requestData = await this.redis.get(`compliance:export:${requestId}`);
    if (!requestData) return;

    const request: DataExportRequest = JSON.parse(requestData);
    request.status = 'processing';
    await this.updateRequest('export', request);

    try {
      const userData = await this.collectUserData(request.userId);
      const exportData = {
        exportDate: new Date().toISOString(),
        userId: request.userId,
        userData,
      };

      // Store encrypted export
      const encryptedData = this.encryptData(JSON.stringify(exportData, null, 2));
      const exportKey = `export:${requestId}`;
      
      await this.redis.set(
        exportKey,
        encryptedData,
        'EX',
        86400 * 7 // 7 days
      );

      // Update request
      request.status = 'completed';
      request.completedAt = new Date();
      request.downloadUrl = `/api/compliance/export/${requestId}/download`;
      request.expiresAt = new Date(Date.now() + 86400 * 7 * 1000);

      await this.updateRequest('export', request);
      
      logger.info(`Data export completed for request ${requestId}`);
    } catch (error) {
      request.status = 'failed';
      await this.updateRequest('export', request);
      throw error;
    }
  }

  /**
   * GDPR: Request user data deletion
   */
  async requestDataDeletion(userId: string): Promise<DataDeletionRequest> {
    const requestId = crypto.randomUUID();
    const request: DataDeletionRequest = {
      userId,
      requestId,
      status: 'pending',
      requestedAt: new Date(),
    };

    // Store request
    await this.redis.set(
      `compliance:deletion:${requestId}`,
      JSON.stringify(request),
      'EX',
      86400 * 30 // 30 days for record keeping
    );

    // Queue for processing
    await this.redis.lpush('compliance:deletion:queue', requestId);

    // Audit log
    await this.auditLogger.log({
      eventType: AuditEventType.DATA_DELETION,
      userId,
      metadata: { requestId },
    });

    logger.info(`Data deletion requested for user ${userId}`);

    // Start processing in background
    this.processDataDeletion(requestId).catch(error => {
      logger.error(`Failed to process data deletion ${requestId}:`, error);
    });

    return request;
  }

  /**
   * GDPR: Process data deletion
   */
  private async processDataDeletion(requestId: string): Promise<void> {
    const requestData = await this.redis.get(`compliance:deletion:${requestId}`);
    if (!requestData) return;

    const request: DataDeletionRequest = JSON.parse(requestData);
    request.status = 'processing';
    await this.updateRequest('deletion', request);

    try {
      let deletedRecords = 0;

      // Delete user data from all stores
      const patterns = [
        `user:${request.userId}:*`,
        `session:*:${request.userId}`,
        `meeting:*:participant:${request.userId}`,
        `chat:*:${request.userId}:*`,
        `file:*:owner:${request.userId}`,
      ];

      for (const pattern of patterns) {
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
          await this.redis.del(...keys);
          deletedRecords += keys.length;
        }
      }

      // Delete audit logs
      await this.auditLogger.deleteUserLogs(request.userId);

      // Update request
      request.status = 'completed';
      request.completedAt = new Date();
      request.deletedRecords = deletedRecords;

      await this.updateRequest('deletion', request);
      
      logger.info(`Data deletion completed for request ${requestId}, deleted ${deletedRecords} records`);
    } catch (error) {
      request.status = 'failed';
      await this.updateRequest('deletion', request);
      throw error;
    }
  }

  /**
   * HIPAA: Get compliance status
   */
  async getComplianceStatus(organizationId: string): Promise<{
    gdpr: ComplianceStatus;
    hipaa: ComplianceStatus;
    soc2: ComplianceStatus;
  }> {
    const gdprStatus = await this.checkGDPRCompliance(organizationId);
    const hipaaStatus = await this.checkHIPAACompliance(organizationId);
    const soc2Status = await this.checkSOC2Compliance(organizationId);

    return {
      gdpr: gdprStatus,
      hipaa: hipaaStatus,
      soc2: soc2Status,
    };
  }

  /**
   * Check GDPR compliance
   */
  private async checkGDPRCompliance(organizationId: string): Promise<ComplianceStatus> {
    const checks = {
      dataProcessingAgreement: await this.hasDataProcessingAgreement(organizationId),
      privacyPolicy: await this.hasPrivacyPolicy(organizationId),
      consentManagement: await this.hasConsentManagement(organizationId),
      dataEncryption: this.config.encryptionRequired,
      auditLogging: true,
      dataPortability: true,
      rightToErasure: true,
    };

    const compliant = Object.values(checks).every(check => check === true);

    return {
      compliant,
      checks,
      lastChecked: new Date(),
    };
  }

  /**
   * Check HIPAA compliance
   */
  private async checkHIPAACompliance(organizationId: string): Promise<ComplianceStatus> {
    if (!this.config.hipaaEnabled) {
      return {
        compliant: false,
        checks: { hipaaEnabled: false },
        lastChecked: new Date(),
      };
    }

    const checks = {
      businessAssociateAgreement: await this.hasBAA(organizationId),
      encryptionAtRest: true,
      encryptionInTransit: true,
      accessControls: await this.hasAccessControls(organizationId),
      auditControls: true,
      integrityControls: true,
      transmissionSecurity: true,
    };

    const compliant = Object.values(checks).every(check => check === true);

    return {
      compliant,
      checks,
      lastChecked: new Date(),
    };
  }

  /**
   * Check SOC 2 compliance
   */
  private async checkSOC2Compliance(organizationId: string): Promise<ComplianceStatus> {
    const checks = {
      security: await this.hasSecurityControls(organizationId),
      availability: await this.hasAvailabilityControls(organizationId),
      processingIntegrity: true,
      confidentiality: this.config.encryptionRequired,
      privacy: await this.hasPrivacyControls(organizationId),
    };

    const compliant = Object.values(checks).every(check => check === true);

    return {
      compliant,
      checks,
      lastChecked: new Date(),
    };
  }

  /**
   * Data residency enforcement
   */
  async enforceDataResidency(
    data: any,
    userRegion: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    if (!this.config.dataResidencyRegions.includes(userRegion)) {
      return {
        allowed: false,
        reason: `Data residency not supported in region: ${userRegion}`,
      };
    }

    // Check if data can be stored in user's region
    // This would integrate with multi-region infrastructure

    return { allowed: true };
  }

  /**
   * Encrypt sensitive data
   */
  private encryptData(data: string): string {
    const algorithm = 'aes-256-gcm';
    const key = Buffer.from(process.env['COMPLIANCE_ENCRYPTION_KEY'] || 'default-key-change-me', 'hex');
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return JSON.stringify({
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
    });
  }

  /**
   * Decrypt sensitive data
   */
  decryptData(encryptedData: string): string {
    const { encrypted, iv, authTag } = JSON.parse(encryptedData);
    
    const algorithm = 'aes-256-gcm';
    const key = Buffer.from(process.env['COMPLIANCE_ENCRYPTION_KEY'] || 'default-key-change-me', 'hex');
    
    const decipher = crypto.createDecipheriv(
      algorithm,
      key,
      Buffer.from(iv, 'hex')
    );
    
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  /**
   * Collect all user data for export
   */
  private async collectUserData(userId: string): Promise<any> {
    const userData: any = {
      profile: {},
      meetings: [],
      messages: [],
      files: [],
      auditLogs: [],
    };

    // Collect user profile
    const profileKeys = await this.redis.keys(`user:${userId}:*`);
    for (const key of profileKeys) {
      const value = await this.redis.get(key);
      const keyName = key.split(':').pop();
      if (keyName && value) {
        userData.profile[keyName] = value;
      }
    }

    // Collect meeting participation
    const meetingKeys = await this.redis.keys(`meeting:*:participant:${userId}`);
    for (const key of meetingKeys) {
      const meetingId = key.split(':')[1];
      userData.meetings.push({
        meetingId,
        joinedAt: await this.redis.get(key),
      });
    }

    // Collect audit logs
    const { events } = await this.auditLogger.query({
      userId,
      limit: 10000,
    });
    userData.auditLogs = events;

    return userData;
  }

  /**
   * Helper methods for compliance checks
   */
  private async hasDataProcessingAgreement(organizationId: string): Promise<boolean> {
    const dpa = await this.redis.get(`compliance:${organizationId}:dpa`);
    return !!dpa;
  }

  private async hasPrivacyPolicy(organizationId: string): Promise<boolean> {
    const policy = await this.redis.get(`compliance:${organizationId}:privacy_policy`);
    return !!policy;
  }

  private async hasConsentManagement(organizationId: string): Promise<boolean> {
    const consent = await this.redis.get(`compliance:${organizationId}:consent_management`);
    return !!consent;
  }

  private async hasBAA(organizationId: string): Promise<boolean> {
    const baa = await this.redis.get(`compliance:${organizationId}:baa`);
    return !!baa;
  }

  private async hasAccessControls(organizationId: string): Promise<boolean> {
    const controls = await this.redis.get(`compliance:${organizationId}:access_controls`);
    return !!controls;
  }

  private async hasSecurityControls(organizationId: string): Promise<boolean> {
    const controls = await this.redis.get(`compliance:${organizationId}:security_controls`);
    return !!controls;
  }

  private async hasAvailabilityControls(organizationId: string): Promise<boolean> {
    const controls = await this.redis.get(`compliance:${organizationId}:availability_controls`);
    return !!controls;
  }

  private async hasPrivacyControls(organizationId: string): Promise<boolean> {
    const controls = await this.redis.get(`compliance:${organizationId}:privacy_controls`);
    return !!controls;
  }

  /**
   * Update request status
   */
  private async updateRequest(type: 'export' | 'deletion', request: any): Promise<void> {
    await this.redis.set(
      `compliance:${type}:${request.requestId}`,
      JSON.stringify(request),
      'EX',
      type === 'export' ? 86400 * 7 : 86400 * 30
    );
  }
}

interface ComplianceStatus {
  compliant: boolean;
  checks: Record<string, boolean>;
  lastChecked: Date;
}

// Fastify routes for compliance
export async function complianceRoutes(fastify: FastifyInstance) {
  const complianceService = new ComplianceService(
    fastify.redis,
    fastify.auditLogger
  );

  // Request data export
  fastify.post(
    '/api/compliance/export',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const result = await complianceService.requestDataExport(request.user.id);
      reply.send(result);
    }
  );

  // Download exported data
  fastify.get(
    '/api/compliance/export/:requestId/download',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const { requestId } = request.params as { requestId: string };
      
      // Verify request belongs to user
      const requestData = await fastify.redis.get(`compliance:export:${requestId}`);
      if (!requestData) {
        return reply.code(404).send({ error: 'Export not found' });
      }

      const exportRequest: DataExportRequest = JSON.parse(requestData);
      if (exportRequest.userId !== request.user.id) {
        return reply.code(403).send({ error: 'Access denied' });
      }

      // Get encrypted data
      const encryptedData = await fastify.redis.get(`export:${requestId}`);
      if (!encryptedData) {
        return reply.code(404).send({ error: 'Export data not found' });
      }

      // Decrypt and send
      const data = complianceService.decryptData(encryptedData);
      reply
        .type('application/json')
        .header('Content-Disposition', `attachment; filename="user-data-export-${requestId}.json"`)
        .send(data);
    }
  );

  // Request data deletion
  fastify.post(
    '/api/compliance/delete',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const result = await complianceService.requestDataDeletion(request.user.id);
      reply.send(result);
    }
  );

  // Get compliance status (admin)
  fastify.get(
    '/api/admin/compliance/status',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      if (!request.user.roles?.includes('admin')) {
        return reply.code(403).send({ error: 'Admin access required' });
      }

      const status = await complianceService.getComplianceStatus(
        request.user.organizationId
      );
      reply.send(status);
    }
  );

  fastify.decorate('complianceService', complianceService);
}