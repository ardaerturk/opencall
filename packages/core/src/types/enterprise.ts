export interface Organization {
  id: string;
  name: string;
  domain: string;
  customDomains?: string[];
  plan: 'free' | 'pro' | 'enterprise';
  features: OrganizationFeatures;
  branding?: OrganizationBranding;
  settings: OrganizationSettings;
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    ownerId: string;
  };
}

export interface OrganizationFeatures {
  sso: boolean;
  customBranding: boolean;
  advancedAnalytics: boolean;
  auditLogs: boolean;
  dataRetentionDays: number;
  maxUsers?: number;
  maxConcurrentMeetings?: number;
  complianceMode: ComplianceMode[];
  apiAccess: boolean;
  webhooks: boolean;
}

export type ComplianceMode = 'gdpr' | 'hipaa' | 'soc2' | 'iso27001';

export interface OrganizationBranding {
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  customCSS?: string;
}

export interface OrganizationSettings {
  defaultMeetingSettings: {
    requireAuthentication: boolean;
    waitingRoomEnabled: boolean;
    recordingEnabled: boolean;
    e2eeRequired: boolean;
  };
  security: {
    allowedEmailDomains?: string[];
    ipWhitelist?: string[];
    mfaRequired: boolean;
  };
  dataResidency?: 'us' | 'eu' | 'apac';
}

export interface EnterpriseUser {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  role: 'admin' | 'member' | 'guest';
  permissions: string[];
  ssoId?: string;
  metadata: {
    createdAt: Date;
    lastLoginAt?: Date;
    provisionedVia: 'manual' | 'sso' | 'api';
  };
}

export interface AuditLog {
  id: string;
  organizationId: string;
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
  correlationId?: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
}

export interface SSOConfiguration {
  id: string;
  organizationId: string;
  provider: 'saml' | 'oidc';
  enabled: boolean;
  config: SAMLConfig | OIDCConfig;
  metadata: {
    createdAt: Date;
    updatedAt: Date;
  };
}

export interface SAMLConfig {
  entryPoint: string;
  issuer: string;
  cert: string;
  identifierFormat?: string;
  acceptedClockSkewMs?: number;
  attributeMapping: {
    email: string;
    name?: string;
    firstName?: string;
    lastName?: string;
    groups?: string;
  };
  signatureAlgorithm?: 'sha1' | 'sha256' | 'sha512';
  digestAlgorithm?: 'sha1' | 'sha256' | 'sha512';
  wantAssertionsSigned?: boolean;
  wantAuthnResponseSigned?: boolean;
}

export interface OIDCConfig {
  clientId: string;
  clientSecret: string;
  discoveryUrl: string;
  redirectUri: string;
  scope: string[];
  attributeMapping: {
    email: string;
    name?: string;
    groups?: string;
  };
}

export interface APIKey {
  id: string;
  organizationId: string;
  name: string;
  key: string; // Hashed
  prefix: string; // First 8 chars for identification
  permissions: string[];
  rateLimit?: {
    requests: number;
    window: 'minute' | 'hour' | 'day';
  };
  expiresAt?: Date;
  lastUsedAt?: Date;
  createdAt: Date;
  createdBy: string;
}

export interface Webhook {
  id: string;
  organizationId: string;
  url: string;
  events: WebhookEvent[];
  secret: string;
  enabled: boolean;
  headers?: Record<string, string>;
  retryPolicy: {
    maxRetries: number;
    backoffMultiplier: number;
  };
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    lastTriggeredAt?: Date;
    failureCount: number;
  };
}

export type WebhookEvent = 
  | 'meeting.created'
  | 'meeting.started'
  | 'meeting.ended'
  | 'participant.joined'
  | 'participant.left'
  | 'recording.started'
  | 'recording.completed'
  | 'user.created'
  | 'user.deleted'
  | 'organization.updated';

export interface ComplianceReport {
  id: string;
  organizationId: string;
  type: 'gdpr_export' | 'audit_trail' | 'soc2_evidence' | 'data_deletion';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  requestedBy: string;
  requestedAt: Date;
  completedAt?: Date;
  downloadUrl?: string;
  expiresAt?: Date;
  metadata?: Record<string, any>;
}

export interface DataRetentionPolicy {
  organizationId: string;
  policies: {
    meetings: RetentionRule;
    recordings: RetentionRule;
    chat: RetentionRule;
    auditLogs: RetentionRule;
    analytics: RetentionRule;
  };
}

export interface RetentionRule {
  enabled: boolean;
  retentionDays: number;
  deleteAfter: boolean;
  archiveLocation?: 'cold_storage' | 's3' | 'glacier';
  exceptions?: {
    taggedWith?: string[];
    meetingTypes?: string[];
  };
}

export interface EnterpriseAnalytics {
  organizationId: string;
  period: {
    start: Date;
    end: Date;
  };
  metrics: {
    totalMeetings: number;
    totalParticipants: number;
    totalMinutes: number;
    averageMeetingDuration: number;
    peakConcurrentMeetings: number;
    meetingsByType: Record<string, number>;
    participantsByRegion: Record<string, number>;
    deviceTypes: Record<string, number>;
    networkQuality: {
      excellent: number;
      good: number;
      fair: number;
      poor: number;
    };
  };
}