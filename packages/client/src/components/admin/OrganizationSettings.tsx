import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import styles from './OrganizationSettings.module.css';

interface Organization {
  id: string;
  name: string;
  domain: string;
  logo?: string;
  primaryColor: string;
  maxUsers: number;
  features: {
    sso: boolean;
    recording: boolean;
    analytics: boolean;
    customBranding: boolean;
    apiAccess: boolean;
  };
  dataRetention: {
    meetings: number;
    recordings: number;
    chat: number;
    auditLogs: number;
  };
}

export const OrganizationSettings: React.FC = () => {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<Partial<Organization>>({});

  const { data: organization, isLoading } = useQuery({
    queryKey: ['admin', 'organization'],
    queryFn: async () => {
      const response = await fetch('/api/admin/organization', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (!response.ok) throw new Error('Failed to fetch organization');
      const data = await response.json();
      setFormData(data);
      return data as Organization;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<Organization>) => {
      const response = await fetch('/api/admin/organization', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });
      if (!response.ok) throw new Error('Failed to update organization');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'organization'] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(formData);
  };

  if (isLoading) {
    return <div className={styles.loading}>Loading organization settings...</div>;
  }

  return (
    <div className={styles.settings}>
      <h1 className={styles.title}>Organization Settings</h1>
      
      <form onSubmit={handleSubmit} className={styles.form}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>General Information</h2>
          
          <div className={styles.formGroup}>
            <label htmlFor="name">Organization Name</label>
            <input
              id="name"
              type="text"
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className={styles.input}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="domain">Domain</label>
            <input
              id="domain"
              type="text"
              value={formData.domain || ''}
              onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
              className={styles.input}
              placeholder="example.com"
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="primaryColor">Brand Color</label>
            <div className={styles.colorInput}>
              <input
                id="primaryColor"
                type="color"
                value={formData.primaryColor || '#3b82f6'}
                onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
              />
              <span>{formData.primaryColor}</span>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Features</h2>
          
          <div className={styles.features}>
            {Object.entries(formData.features || {}).map(([feature, enabled]) => (
              <label key={feature} className={styles.featureToggle}>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setFormData({
                    ...formData,
                    features: {
                      ...formData.features!,
                      [feature]: e.target.checked,
                    },
                  })}
                />
                <span>{formatFeatureName(feature)}</span>
              </label>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Data Retention (days)</h2>
          
          <div className={styles.retentionGrid}>
            {Object.entries(formData.dataRetention || {}).map(([type, days]) => (
              <div key={type} className={styles.formGroup}>
                <label htmlFor={`retention-${type}`}>{formatRetentionType(type)}</label>
                <input
                  id={`retention-${type}`}
                  type="number"
                  min="1"
                  max="365"
                  value={days}
                  onChange={(e) => setFormData({
                    ...formData,
                    dataRetention: {
                      ...formData.dataRetention!,
                      [type]: parseInt(e.target.value),
                    },
                  })}
                  className={styles.input}
                />
              </div>
            ))}
          </div>
        </section>

        <div className={styles.actions}>
          <button
            type="submit"
            className={styles.saveButton}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
          
          {updateMutation.isSuccess && (
            <span className={styles.successMessage}>Settings saved successfully!</span>
          )}
        </div>
      </form>
    </div>
  );
};

function formatFeatureName(feature: string): string {
  const names: Record<string, string> = {
    sso: 'Single Sign-On (SSO)',
    recording: 'Meeting Recording',
    analytics: 'Advanced Analytics',
    customBranding: 'Custom Branding',
    apiAccess: 'API Access',
  };
  return names[feature] || feature;
}

function formatRetentionType(type: string): string {
  const names: Record<string, string> = {
    meetings: 'Meeting History',
    recordings: 'Recordings',
    chat: 'Chat Messages',
    auditLogs: 'Audit Logs',
  };
  return names[type] || type;
}