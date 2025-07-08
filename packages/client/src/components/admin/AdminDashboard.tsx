import React, { useState } from 'react';
import styles from './AdminDashboard.module.css';
import { OrganizationSettings } from './OrganizationSettings';
import { UserManagement } from './UserManagement';
import { MeetingAnalytics } from './MeetingAnalytics';
import { ComplianceDashboard } from './ComplianceDashboard';
import { AuditLogViewer } from './AuditLogViewer';
import { SSOConfiguration } from './SSOConfiguration';

interface Tab {
  id: string;
  label: string;
  icon: string;
  component: React.ComponentType;
}

const tabs: Tab[] = [
  { id: 'overview', label: 'Overview', icon: '📊', component: MeetingAnalytics },
  { id: 'organization', label: 'Organization', icon: '🏢', component: OrganizationSettings },
  { id: 'users', label: 'Users', icon: '👥', component: UserManagement },
  { id: 'sso', label: 'SSO', icon: '🔐', component: SSOConfiguration },
  { id: 'compliance', label: 'Compliance', icon: '✅', component: ComplianceDashboard },
  { id: 'audit', label: 'Audit Logs', icon: '📋', component: AuditLogViewer },
];

export const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState('overview');

  const ActiveComponent = tabs.find(tab => tab.id === activeTab)?.component || MeetingAnalytics;

  return (
    <div className={styles.dashboard}>
      <div className={styles.sidebar}>
        <h2 className={styles.title}>Admin Dashboard</h2>
        <nav className={styles.nav}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`${styles.navItem} ${activeTab === tab.id ? styles.active : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className={styles.icon}>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>
      <div className={styles.content}>
        <ActiveComponent />
      </div>
    </div>
  );
};