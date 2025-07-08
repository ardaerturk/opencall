import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import styles from './ComplianceDashboard.module.css';

interface ComplianceStatus {
  compliant: boolean;
  checks: Record<string, boolean>;
  lastChecked: string;
}

interface ComplianceData {
  gdpr: ComplianceStatus;
  hipaa: ComplianceStatus;
  soc2: ComplianceStatus;
}

export const ComplianceDashboard: React.FC = () => {
  const queryClient = useQueryClient();
  const [exportStatus, setExportStatus] = useState<string>('');

  const { data: compliance, isLoading } = useQuery({
    queryKey: ['admin', 'compliance'],
    queryFn: async () => {
      const response = await fetch('/api/admin/compliance/status', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (!response.ok) throw new Error('Failed to fetch compliance status');
      return response.json() as Promise<ComplianceData>;
    },
  });

  const exportDataMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/compliance/export', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) throw new Error('Failed to request data export');
      return response.json();
    },
    onSuccess: () => {
      setExportStatus('Data export requested successfully');
      setTimeout(() => setExportStatus(''), 5000);
    },
  });

  if (isLoading) {
    return <div className={styles.loading}>Loading compliance status...</div>;
  }

  if (!compliance) {
    return <div className={styles.error}>Failed to load compliance status</div>;
  }

  return (
    <div className={styles.compliance}>
      <h1 className={styles.title}>Compliance Dashboard</h1>
      
      <div className={styles.overview}>
        <ComplianceCard
          title="GDPR Compliance"
          status={compliance.gdpr}
          icon="🇪🇺"
          description="General Data Protection Regulation"
        />
        <ComplianceCard
          title="HIPAA Compliance"
          status={compliance.hipaa}
          icon="🏥"
          description="Health Insurance Portability and Accountability Act"
        />
        <ComplianceCard
          title="SOC 2 Compliance"
          status={compliance.soc2}
          icon="🔒"
          description="Service Organization Control 2"
        />
      </div>

      <div className={styles.actions}>
        <h2 className={styles.sectionTitle}>Compliance Actions</h2>
        
        <div className={styles.actionCard}>
          <h3>Data Export</h3>
          <p>Export all user data for GDPR compliance</p>
          <button
            className={styles.actionButton}
            onClick={() => exportDataMutation.mutate()}
            disabled={exportDataMutation.isPending}
          >
            {exportDataMutation.isPending ? 'Requesting...' : 'Request Data Export'}
          </button>
          {exportStatus && <p className={styles.successMessage}>{exportStatus}</p>}
        </div>

        <div className={styles.actionCard}>
          <h3>Audit Reports</h3>
          <p>Generate compliance audit reports</p>
          <button className={styles.actionButton}>Generate SOC 2 Report</button>
        </div>

        <div className={styles.actionCard}>
          <h3>Data Retention</h3>
          <p>Configure data retention policies</p>
          <button className={styles.actionButton}>Manage Retention</button>
        </div>
      </div>

      <div className={styles.requirements}>
        <h2 className={styles.sectionTitle}>Compliance Requirements</h2>
        <ComplianceChecklist />
      </div>
    </div>
  );
};

interface ComplianceCardProps {
  title: string;
  status: ComplianceStatus;
  icon: string;
  description: string;
}

const ComplianceCard: React.FC<ComplianceCardProps> = ({ title, status, icon, description }) => {
  const passedChecks = Object.values(status.checks).filter(Boolean).length;
  const totalChecks = Object.keys(status.checks).length;
  const percentage = Math.round((passedChecks / totalChecks) * 100);

  return (
    <div className={`${styles.complianceCard} ${status.compliant ? styles.compliant : styles.nonCompliant}`}>
      <div className={styles.cardHeader}>
        <span className={styles.cardIcon}>{icon}</span>
        <span className={styles.cardStatus}>
          {status.compliant ? '✅ Compliant' : '⚠️ Non-Compliant'}
        </span>
      </div>
      
      <h3 className={styles.cardTitle}>{title}</h3>
      <p className={styles.cardDescription}>{description}</p>
      
      <div className={styles.progressBar}>
        <div
          className={styles.progressFill}
          style={{ width: `${percentage}%` }}
        />
      </div>
      
      <div className={styles.cardStats}>
        <span>{passedChecks}/{totalChecks} checks passed</span>
        <span>{percentage}%</span>
      </div>
      
      <details className={styles.checkDetails}>
        <summary>View Checks</summary>
        <ul className={styles.checkList}>
          {Object.entries(status.checks).map(([check, passed]) => (
            <li key={check} className={passed ? styles.passed : styles.failed}>
              <span className={styles.checkIcon}>{passed ? '✅' : '❌'}</span>
              <span>{formatCheckName(check)}</span>
            </li>
          ))}
        </ul>
      </details>
      
      <div className={styles.lastChecked}>
        Last checked: {new Date(status.lastChecked).toLocaleDateString()}
      </div>
    </div>
  );
};

const ComplianceChecklist: React.FC = () => {
  const requirements = [
    {
      category: 'Data Protection',
      items: [
        { name: 'End-to-end encryption', completed: true },
        { name: 'Encryption at rest', completed: true },
        { name: 'Regular security audits', completed: true },
        { name: 'Penetration testing', completed: false },
      ],
    },
    {
      category: 'Access Control',
      items: [
        { name: 'Multi-factor authentication', completed: false },
        { name: 'Role-based access control', completed: true },
        { name: 'Session management', completed: true },
        { name: 'Password policies', completed: true },
      ],
    },
    {
      category: 'Data Governance',
      items: [
        { name: 'Data retention policies', completed: true },
        { name: 'Right to deletion', completed: true },
        { name: 'Data portability', completed: true },
        { name: 'Consent management', completed: false },
      ],
    },
  ];

  return (
    <div className={styles.checklist}>
      {requirements.map((category) => (
        <div key={category.category} className={styles.checklistCategory}>
          <h3 className={styles.categoryTitle}>{category.category}</h3>
          <ul className={styles.checklistItems}>
            {category.items.map((item) => (
              <li key={item.name} className={styles.checklistItem}>
                <input
                  type="checkbox"
                  checked={item.completed}
                  readOnly
                  className={styles.checkbox}
                />
                <span className={item.completed ? styles.completed : ''}>
                  {item.name}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};

function formatCheckName(name: string): string {
  return name
    .split(/(?=[A-Z])/)
    .join(' ')
    .replace(/^./, str => str.toUpperCase());
}