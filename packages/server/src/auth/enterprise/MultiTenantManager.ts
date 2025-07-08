import { Organization, OrganizationBranding } from '@opencall/core';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AuditLogger } from '../../audit/AuditLogger';
import postgres from 'postgres';
import IORedis from 'ioredis';
import * as path from 'path';
import * as fs from 'fs/promises';

export class MultiTenantManager {
  private domainCache: Map<string, string> = new Map(); // domain -> organizationId
  private featureFlagsCache: Map<string, Set<string>> = new Map(); // orgId -> features

  constructor(
    private app: FastifyInstance,
    private auditLogger: AuditLogger,
    private postgresClient: postgres.Sql,
    private redisClient: IORedis
  ) {
    this.initializeDomainCache();
    this.setupMiddleware();
  }

  private async initializeDomainCache(): Promise<void> {
    // Load all custom domains into cache
    const organizations = await this.postgresClient`
      SELECT id, domain, custom_domains FROM organizations
      WHERE custom_domains IS NOT NULL
    `;

    for (const org of organizations) {
      this.domainCache.set(org.domain, org.id);
      if (org.custom_domains) {
        for (const customDomain of org.custom_domains) {
          this.domainCache.set(customDomain, org.id);
        }
      }
    }
  }

  private setupMiddleware(): void {
    // Add tenant resolution middleware
    this.app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = await this.resolveOrganization(request);
      if (organizationId) {
        request.organizationId = organizationId;
        request.organization = await this.getOrganization(organizationId);
      }
    });

    // Add feature flag middleware
    this.app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
      if (request.organizationId) {
        request.featureFlags = await this.getFeatureFlags(request.organizationId);
      }
    });
  }

  async resolveOrganization(request: FastifyRequest): Promise<string | null> {
    // 1. Check subdomain
    const host = request.headers.host || '';
    const subdomain = this.extractSubdomain(host);
    if (subdomain && subdomain !== 'www') {
      const orgId = await this.getOrganizationBySubdomain(subdomain);
      if (orgId) return orgId;
    }

    // 2. Check custom domain
    const customOrgId = this.domainCache.get(host);
    if (customOrgId) return customOrgId;

    // 3. Check organization header (for API requests)
    const orgHeader = request.headers['x-organization-id'] as string;
    if (orgHeader) return orgHeader;

    // 4. Check JWT token
    if (request.user?.organizationId) {
      return request.user.organizationId;
    }

    return null;
  }

  private extractSubdomain(host: string): string | null {
    const parts = host.split('.');
    if (parts.length >= 3) {
      return parts[0];
    }
    return null;
  }

  private async getOrganizationBySubdomain(subdomain: string): Promise<string | null> {
    const cacheKey = `org:subdomain:${subdomain}`;
    
    // Check Redis cache
    const cached = await this.redisClient.get(cacheKey);
    if (cached) return cached;

    // Query database
    const [org] = await this.postgresClient`
      SELECT id FROM organizations
      WHERE domain = ${subdomain}
    `;

    if (org) {
      await this.redisClient.setex(cacheKey, 3600, org.id); // Cache for 1 hour
      return org.id;
    }

    return null;
  }

  private async getOrganization(organizationId: string): Promise<Organization | null> {
    const cacheKey = `org:${organizationId}`;
    
    // Check Redis cache
    const cached = await this.redisClient.get(cacheKey);
    if (cached) return JSON.parse(cached);

    // Query database
    const [org] = await this.postgresClient`
      SELECT * FROM organizations WHERE id = ${organizationId}
    `;

    if (org) {
      await this.redisClient.setex(cacheKey, 300, JSON.stringify(org)); // Cache for 5 minutes
      return org;
    }

    return null;
  }

  // Custom Domain Management
  async addCustomDomain(
    organizationId: string,
    domain: string
  ): Promise<void> {
    // Validate domain ownership
    const isValid = await this.validateDomainOwnership(domain);
    if (!isValid) {
      throw new Error('Domain ownership verification failed');
    }

    // Check if domain is already in use
    const existing = this.domainCache.get(domain);
    if (existing && existing !== organizationId) {
      throw new Error('Domain is already in use');
    }

    // Update organization
    await this.postgresClient`
      UPDATE organizations
      SET custom_domains = array_append(
        COALESCE(custom_domains, ARRAY[]::text[]),
        ${domain}
      )
      WHERE id = ${organizationId}
    `;

    // Update cache
    this.domainCache.set(domain, organizationId);

    // Setup SSL certificate
    await this.provisionSSLCertificate(domain);

    await this.auditLogger.log({
      organizationId,
      action: 'organization.custom_domain.added',
      resource: 'custom_domain',
      resourceId: domain,
      details: { domain },
    });
  }

  async removeCustomDomain(
    organizationId: string,
    domain: string
  ): Promise<void> {
    await this.postgresClient`
      UPDATE organizations
      SET custom_domains = array_remove(custom_domains, ${domain})
      WHERE id = ${organizationId}
    `;

    this.domainCache.delete(domain);

    await this.auditLogger.log({
      organizationId,
      action: 'organization.custom_domain.removed',
      resource: 'custom_domain',
      resourceId: domain,
      details: { domain },
    });
  }

  private async validateDomainOwnership(domain: string): Promise<boolean> {
    // In production, this would:
    // 1. Generate a TXT record value
    // 2. Ask user to add it to their DNS
    // 3. Verify the TXT record exists
    
    // For now, simple validation
    const dnsRecords = await this.checkDNSRecords(domain);
    return dnsRecords.valid;
  }

  private async checkDNSRecords(domain: string): Promise<{ valid: boolean }> {
    // Simplified DNS check
    // In production, use a proper DNS library
    return { valid: true };
  }

  private async provisionSSLCertificate(domain: string): Promise<void> {
    // In production, this would use Let's Encrypt or similar
    // to provision SSL certificates for custom domains
    logger.info(`SSL certificate provisioned for ${domain}`);
  }

  // Branding Customization
  async updateBranding(
    organizationId: string,
    branding: OrganizationBranding
  ): Promise<void> {
    await this.postgresClient`
      UPDATE organizations
      SET branding = ${JSON.stringify(branding)}
      WHERE id = ${organizationId}
    `;

    // Invalidate cache
    await this.redisClient.del(`org:${organizationId}`);

    // Process and store logo if provided
    if (branding.logoUrl) {
      await this.processLogo(organizationId, branding.logoUrl);
    }

    // Compile custom CSS if provided
    if (branding.customCSS) {
      await this.compileCustomCSS(organizationId, branding.customCSS);
    }

    await this.auditLogger.log({
      organizationId,
      action: 'organization.branding.updated',
      resource: 'organization_branding',
      resourceId: organizationId,
      details: { branding },
    });
  }

  private async processLogo(
    organizationId: string,
    logoUrl: string
  ): Promise<void> {
    // In production, this would:
    // 1. Download and validate the logo
    // 2. Resize for different use cases
    // 3. Store in CDN
    // 4. Update logoUrl with CDN URL
  }

  private async compileCustomCSS(
    organizationId: string,
    customCSS: string
  ): Promise<void> {
    // Sanitize and validate CSS
    const sanitized = this.sanitizeCSS(customCSS);
    
    // Add organization-specific prefix to prevent conflicts
    const prefixed = `.org-${organizationId} { ${sanitized} }`;
    
    // Store compiled CSS
    const cssPath = path.join('public', 'css', 'orgs', `${organizationId}.css`);
    await fs.mkdir(path.dirname(cssPath), { recursive: true });
    await fs.writeFile(cssPath, prefixed);
  }

  private sanitizeCSS(css: string): string {
    // Remove potentially dangerous CSS
    // In production, use a proper CSS sanitizer
    return css
      .replace(/@import/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/expression\(/gi, '');
  }

  // Feature Flags
  async setFeatureFlag(
    organizationId: string,
    feature: string,
    enabled: boolean
  ): Promise<void> {
    if (enabled) {
      await this.postgresClient`
        UPDATE organizations
        SET feature_flags = array_append(
          COALESCE(feature_flags, ARRAY[]::text[]),
          ${feature}
        )
        WHERE id = ${organizationId}
          AND NOT (feature_flags @> ARRAY[${feature}]::text[])
      `;
    } else {
      await this.postgresClient`
        UPDATE organizations
        SET feature_flags = array_remove(feature_flags, ${feature})
        WHERE id = ${organizationId}
      `;
    }

    // Update cache
    const flags = this.featureFlagsCache.get(organizationId) || new Set();
    if (enabled) {
      flags.add(feature);
    } else {
      flags.delete(feature);
    }
    this.featureFlagsCache.set(organizationId, flags);

    await this.auditLogger.log({
      organizationId,
      action: `organization.feature_flag.${enabled ? 'enabled' : 'disabled'}`,
      resource: 'feature_flag',
      resourceId: feature,
      details: { feature, enabled },
    });
  }

  async getFeatureFlags(organizationId: string): Promise<Set<string>> {
    // Check cache
    if (this.featureFlagsCache.has(organizationId)) {
      return this.featureFlagsCache.get(organizationId)!;
    }

    // Load from database
    const [org] = await this.postgresClient`
      SELECT feature_flags FROM organizations WHERE id = ${organizationId}
    `;

    const flags = new Set(org?.feature_flags || []);
    this.featureFlagsCache.set(organizationId, flags);
    
    return flags;
  }

  // Organization Isolation
  async enforceIsolation(
    request: FastifyRequest,
    reply: FastifyReply,
    resourceOrgId: string
  ): Promise<void> {
    const requestOrgId = request.organizationId;
    
    if (!requestOrgId || requestOrgId !== resourceOrgId) {
      await this.auditLogger.log({
        organizationId: requestOrgId || 'unknown',
        userId: request.user?.id,
        action: 'security.cross_tenant_access_denied',
        resource: 'organization_resource',
        resourceId: resourceOrgId,
        details: {
          requestedOrg: resourceOrgId,
          userOrg: requestOrgId,
        },
        severity: 'warning',
      });

      reply.code(403).send({
        error: 'Access denied: Cross-tenant access not allowed',
      });
    }
  }

  // Usage Tracking
  async trackUsage(
    organizationId: string,
    resource: string,
    amount: number
  ): Promise<void> {
    const key = `usage:${organizationId}:${resource}:${new Date().toISOString().split('T')[0]}`;
    await this.redisClient.incrby(key, amount);
    await this.redisClient.expire(key, 86400 * 30); // Keep for 30 days

    // Check usage limits
    const org = await this.getOrganization(organizationId);
    if (org?.features.maxUsers && resource === 'users') {
      const currentUsers = await this.postgresClient`
        SELECT COUNT(*) as count FROM users WHERE organization_id = ${organizationId}
      `;
      
      if (currentUsers[0].count >= org.features.maxUsers) {
        throw new Error('User limit exceeded for organization');
      }
    }
  }

  // Data Migration for Organizations
  async migrateOrganizationData(
    sourceOrgId: string,
    targetOrgId: string,
    options: {
      includeUsers?: boolean;
      includeMeetings?: boolean;
      includeRecordings?: boolean;
      includeSettings?: boolean;
    } = {}
  ): Promise<void> {
    await this.auditLogger.log({
      organizationId: sourceOrgId,
      action: 'organization.data_migration.started',
      resource: 'organization_data',
      resourceId: targetOrgId,
      details: options,
      severity: 'warning',
    });

    try {
      // Start transaction
      await this.postgresClient.begin(async sql => {
        if (options.includeUsers) {
          await sql`
            UPDATE users
            SET organization_id = ${targetOrgId}
            WHERE organization_id = ${sourceOrgId}
          `;
        }

        if (options.includeMeetings) {
          await sql`
            UPDATE meetings
            SET organization_id = ${targetOrgId}
            WHERE organization_id = ${sourceOrgId}
          `;
        }

        if (options.includeRecordings) {
          await sql`
            UPDATE recordings
            SET organization_id = ${targetOrgId}
            WHERE organization_id = ${sourceOrgId}
          `;
        }

        if (options.includeSettings) {
          const [sourceOrg] = await sql`
            SELECT settings, branding FROM organizations
            WHERE id = ${sourceOrgId}
          `;

          await sql`
            UPDATE organizations
            SET settings = ${sourceOrg.settings},
                branding = ${sourceOrg.branding}
            WHERE id = ${targetOrgId}
          `;
        }
      });

      await this.auditLogger.log({
        organizationId: sourceOrgId,
        action: 'organization.data_migration.completed',
        resource: 'organization_data',
        resourceId: targetOrgId,
        details: options,
      });
    } catch (error) {
      await this.auditLogger.log({
        organizationId: sourceOrgId,
        action: 'organization.data_migration.failed',
        resource: 'organization_data',
        resourceId: targetOrgId,
        details: { error: error.message, options },
        severity: 'error',
      });
      throw error;
    }
  }
}

// Extend FastifyRequest type
declare module 'fastify' {
  interface FastifyRequest {
    organizationId?: string;
    organization?: Organization;
    featureFlags?: Set<string>;
  }
}