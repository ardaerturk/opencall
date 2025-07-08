import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Organization, EnterpriseAnalytics } from '@opencall/core';
import { EnterpriseService } from '../../services/enterprise/EnterpriseService';
import styles from './AdminDashboard.module.css';

// Components
import { OrganizationOverview } from '../../components/enterprise/OrganizationOverview';
import { UserManagement } from '../../components/enterprise/UserManagement';
import { MeetingAnalytics } from '../../components/enterprise/MeetingAnalytics';
import { ComplianceDashboard } from '../../components/enterprise/ComplianceDashboard';
import { AuditLogViewer } from '../../components/enterprise/AuditLogViewer';
import { SSOConfiguration } from '../../components/enterprise/SSOConfiguration';
import { APIKeyManagement } from '../../components/enterprise/APIKeyManagement';
import { WebhookManagement } from '../../components/enterprise/WebhookManagement';

type TabType = 'overview' | 'users' | 'analytics' | 'compliance' | 'audit' | 'sso' | 'api' | 'webhooks';

export const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [analytics, setAnalytics] = useState<EnterpriseAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const enterpriseService = EnterpriseService.getInstance();

  useEffect(() => {
    loadOrganizationData();
  }, []);

  const loadOrganizationData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [orgData, analyticsData] = await Promise.all([
        enterpriseService.getOrganization(),
        enterpriseService.getAnalytics({
          startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
          endDate: new Date(),
        }),
      ]);

      setOrganization(orgData);
      setAnalytics(analyticsData);
    } catch (err) {
      setError(err.message || 'Failed to load organization data');
      console.error('Failed to load organization data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOrganizationUpdate = async (updates: Partial<Organization>) => {
    try {
      const updated = await enterpriseService.updateOrganization(updates);
      setOrganization(updated);
    } catch (err) {
      console.error('Failed to update organization:', err);
      throw err;
    }
  };

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
        <p>Loading organization data...</p>
      </div>
    );
  }

  if (error || !organization) {
    return (
      <div className={styles.error}>
        <h2>Error Loading Dashboard</h2>
        <p>{error || 'Organization not found'}</p>
        <button onClick={loadOrganizationData}>Retry</button>
      </div>
    );
  }

  const tabs = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'users', label: 'Users', icon: '👥' },
    { id: 'analytics', label: 'Analytics', icon: '📈' },
    { id: 'compliance', label: 'Compliance', icon: '🛡️' },
    { id: 'audit', label: 'Audit Logs', icon: '📋' },
    { id: 'sso', label: 'SSO', icon: '🔐' },
    { id: 'api', label: 'API Keys', icon: '🔑' },
    { id: 'webhooks', label: 'Webhooks', icon: '🔗' },
  ];

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <h1>{organization.name} Admin Dashboard</h1>
          <div className={styles.headerActions}>
            <span className={styles.plan}>{organization.plan.toUpperCase()} Plan</span>
            <button onClick={() => navigate('/settings')}>Settings</button>
          </div>
        </div>
      </header>

      <nav className={styles.nav}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`${styles.tab} ${activeTab === tab.id ? styles.active : ''}`}
            onClick={() => setActiveTab(tab.id as TabType)}
          >
            <span className={styles.tabIcon}>{tab.icon}</span>
            <span className={styles.tabLabel}>{tab.label}</span>
          </button>
        ))}
      </nav>

      <main className={styles.content}>
        {activeTab === 'overview' && (
          <OrganizationOverview
            organization={organization}
            analytics={analytics}
            onUpdate={handleOrganizationUpdate}
          />
        )}

        {activeTab === 'users' && (
          <UserManagement
            organizationId={organization.id}
            features={organization.features}
          />
        )}

        {activeTab === 'analytics' && (
          <MeetingAnalytics
            organizationId={organization.id}
            initialData={analytics}
          />
        )}

        {activeTab === 'compliance' && (
          <ComplianceDashboard
            organizationId={organization.id}
            complianceModes={organization.features.complianceMode}
          />
        )}

        {activeTab === 'audit' && (
          <AuditLogViewer
            organizationId={organization.id}
            retentionDays={organization.features.dataRetentionDays}
          />
        )}

        {activeTab === 'sso' && (
          <SSOConfiguration
            organizationId={organization.id}
            enabled={organization.features.sso}
          />
        )}

        {activeTab === 'api' && (
          <APIKeyManagement
            organizationId={organization.id}
            enabled={organization.features.apiAccess}
          />
        )}

        {activeTab === 'webhooks' && (
          <WebhookManagement
            organizationId={organization.id}
            enabled={organization.features.webhooks}
          />
        )}
      </main>
    </div>
  );
};