import {
  Organization,
  EnterpriseUser,
  EnterpriseAnalytics,
  AuditLog,
  APIKey,
  Webhook,
  SSOConfiguration,
  ComplianceReport,
  DataRetentionPolicy,
} from '@opencall/core';

interface EnterpriseAPIResponse<T> {
  data: T;
  meta?: {
    limit?: number;
    offset?: number;
    total?: number;
  };
}

export class EnterpriseService {
  private static instance: EnterpriseService;
  private apiKey: string;
  private baseUrl: string;

  private constructor() {
    this.apiKey = localStorage.getItem('opencall_api_key') || '';
    this.baseUrl = process.env.REACT_APP_API_URL || 'http://localhost:3001/api/v1/enterprise';
  }

  static getInstance(): EnterpriseService {
    if (!EnterpriseService.instance) {
      EnterpriseService.instance = new EnterpriseService();
    }
    return EnterpriseService.instance;
  }

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
    localStorage.setItem('opencall_api_key', apiKey);
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Organization Management
  async getOrganization(): Promise<Organization> {
    const response = await this.request<EnterpriseAPIResponse<Organization>>('/organization');
    return response.data;
  }

  async updateOrganization(updates: Partial<Organization>): Promise<Organization> {
    const response = await this.request<EnterpriseAPIResponse<Organization>>('/organization', {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    return response.data;
  }

  // User Management
  async getUsers(params?: {
    limit?: number;
    offset?: number;
    search?: string;
    role?: string;
  }): Promise<{ users: EnterpriseUser[]; total: number }> {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());
    if (params?.search) queryParams.append('search', params.search);
    if (params?.role) queryParams.append('role', params.role);

    const response = await this.request<EnterpriseAPIResponse<EnterpriseUser[]>>(
      `/users?${queryParams.toString()}`
    );

    return {
      users: response.data,
      total: response.meta?.total || response.data.length,
    };
  }

  async createUser(userData: {
    email: string;
    name: string;
    role: 'admin' | 'member' | 'guest';
    permissions?: string[];
  }): Promise<EnterpriseUser> {
    const response = await this.request<EnterpriseAPIResponse<EnterpriseUser>>('/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
    return response.data;
  }

  async deleteUser(userId: string): Promise<void> {
    await this.request(`/users/${userId}`, {
      method: 'DELETE',
    });
  }

  // Analytics
  async getAnalytics(params: {
    startDate: Date;
    endDate: Date;
    granularity?: 'hour' | 'day' | 'week' | 'month';
  }): Promise<EnterpriseAnalytics> {
    const queryParams = new URLSearchParams({
      startDate: params.startDate.toISOString(),
      endDate: params.endDate.toISOString(),
      granularity: params.granularity || 'day',
    });

    const response = await this.request<EnterpriseAPIResponse<EnterpriseAnalytics>>(
      `/analytics?${queryParams.toString()}`
    );
    return response.data;
  }

  // Audit Logs
  async getAuditLogs(params: {
    startDate?: Date;
    endDate?: Date;
    userId?: string;
    action?: string;
    resource?: string;
    severity?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ logs: AuditLog[]; total: number }> {
    const queryParams = new URLSearchParams();
    if (params.startDate) queryParams.append('startDate', params.startDate.toISOString());
    if (params.endDate) queryParams.append('endDate', params.endDate.toISOString());
    if (params.userId) queryParams.append('userId', params.userId);
    if (params.action) queryParams.append('action', params.action);
    if (params.resource) queryParams.append('resource', params.resource);
    if (params.severity) queryParams.append('severity', params.severity);
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.offset) queryParams.append('offset', params.offset.toString());

    const response = await this.request<EnterpriseAPIResponse<AuditLog[]>>(
      `/audit-logs?${queryParams.toString()}`
    );

    return {
      logs: response.data,
      total: response.meta?.total || response.data.length,
    };
  }

  async exportAuditLogs(format: 'csv' | 'json', filters?: {
    startDate?: Date;
    endDate?: Date;
  }): Promise<Blob> {
    const queryParams = new URLSearchParams({ format });
    if (filters?.startDate) queryParams.append('startDate', filters.startDate.toISOString());
    if (filters?.endDate) queryParams.append('endDate', filters.endDate.toISOString());

    const response = await fetch(
      `${this.baseUrl}/audit-logs/export?${queryParams.toString()}`,
      {
        headers: {
          'X-API-Key': this.apiKey,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Export failed: ${response.statusText}`);
    }

    return response.blob();
  }

  // SSO Configuration
  async getSSOConfiguration(): Promise<SSOConfiguration | null> {
    try {
      const response = await this.request<EnterpriseAPIResponse<SSOConfiguration>>('/sso');
      return response.data;
    } catch (error) {
      if (error.message.includes('404')) {
        return null;
      }
      throw error;
    }
  }

  async updateSSOConfiguration(config: SSOConfiguration): Promise<SSOConfiguration> {
    const response = await this.request<EnterpriseAPIResponse<SSOConfiguration>>('/sso', {
      method: 'PUT',
      body: JSON.stringify(config),
    });
    return response.data;
  }

  async testSSOConfiguration(): Promise<{ success: boolean; error?: string }> {
    return this.request('/sso/test', { method: 'POST' });
  }

  // API Key Management
  async getAPIKeys(): Promise<APIKey[]> {
    const response = await this.request<EnterpriseAPIResponse<APIKey[]>>('/api-keys');
    return response.data;
  }

  async createAPIKey(data: {
    name: string;
    permissions: string[];
    expiresIn?: number;
  }): Promise<APIKey & { key: string }> {
    const response = await this.request<EnterpriseAPIResponse<APIKey & { key: string }>>('/api-keys', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return response.data;
  }

  async revokeAPIKey(keyId: string): Promise<void> {
    await this.request(`/api-keys/${keyId}`, {
      method: 'DELETE',
    });
  }

  // Webhook Management
  async getWebhooks(): Promise<Webhook[]> {
    const response = await this.request<EnterpriseAPIResponse<Webhook[]>>('/webhooks');
    return response.data;
  }

  async createWebhook(data: {
    url: string;
    events: string[];
    headers?: Record<string, string>;
  }): Promise<Webhook> {
    const response = await this.request<EnterpriseAPIResponse<Webhook>>('/webhooks', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return response.data;
  }

  async updateWebhook(webhookId: string, updates: Partial<Webhook>): Promise<Webhook> {
    const response = await this.request<EnterpriseAPIResponse<Webhook>>(`/webhooks/${webhookId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    return response.data;
  }

  async deleteWebhook(webhookId: string): Promise<void> {
    await this.request(`/webhooks/${webhookId}`, {
      method: 'DELETE',
    });
  }

  async testWebhook(webhookId: string): Promise<{ success: boolean; error?: string }> {
    return this.request(`/webhooks/${webhookId}/test`, { method: 'POST' });
  }

  // Compliance
  async requestGDPRExport(userId: string): Promise<ComplianceReport> {
    const response = await this.request<EnterpriseAPIResponse<ComplianceReport>>('/compliance/gdpr/export', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
    return response.data;
  }

  async requestDataDeletion(userId: string, options?: {
    deleteImmediately?: boolean;
    preserveAuditLogs?: boolean;
  }): Promise<void> {
    await this.request('/compliance/gdpr/delete', {
      method: 'POST',
      body: JSON.stringify({ userId, ...options }),
    });
  }

  async getComplianceReports(): Promise<ComplianceReport[]> {
    const response = await this.request<EnterpriseAPIResponse<ComplianceReport[]>>('/compliance/reports');
    return response.data;
  }

  async generateSOC2Report(startDate: Date, endDate: Date): Promise<ComplianceReport> {
    const response = await this.request<EnterpriseAPIResponse<ComplianceReport>>('/compliance/soc2/report', {
      method: 'POST',
      body: JSON.stringify({ startDate, endDate }),
    });
    return response.data;
  }

  async getDataRetentionPolicy(): Promise<DataRetentionPolicy> {
    const response = await this.request<EnterpriseAPIResponse<DataRetentionPolicy>>('/compliance/retention-policy');
    return response.data;
  }

  async updateDataRetentionPolicy(policy: DataRetentionPolicy): Promise<DataRetentionPolicy> {
    const response = await this.request<EnterpriseAPIResponse<DataRetentionPolicy>>('/compliance/retention-policy', {
      method: 'PUT',
      body: JSON.stringify(policy),
    });
    return response.data;
  }

  // Usage Statistics
  async getUsageStatistics(params: {
    startDate: Date;
    endDate: Date;
    resource?: string;
  }): Promise<any> {
    const queryParams = new URLSearchParams({
      startDate: params.startDate.toISOString(),
      endDate: params.endDate.toISOString(),
    });
    if (params.resource) queryParams.append('resource', params.resource);

    const response = await this.request<EnterpriseAPIResponse<any>>(
      `/usage?${queryParams.toString()}`
    );
    return response.data;
  }
}