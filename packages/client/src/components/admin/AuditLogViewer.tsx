import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import styles from './AuditLogViewer.module.css';

interface AuditEvent {
  id: string;
  timestamp: string;
  eventType: string;
  userId?: string;
  organizationId?: string;
  meetingId?: string;
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
  metadata?: Record<string, any>;
}

interface AuditLogQuery {
  events: AuditEvent[];
  total: number;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  USER_LOGIN: 'User Login',
  USER_LOGOUT: 'User Logout',
  USER_REGISTER: 'User Registration',
  SSO_LOGIN: 'SSO Login',
  MEETING_CREATED: 'Meeting Created',
  MEETING_JOINED: 'Meeting Joined',
  MEETING_LEFT: 'Meeting Left',
  MEETING_ENDED: 'Meeting Ended',
  FILE_SHARED: 'File Shared',
  SCREEN_SHARED: 'Screen Shared',
  FAILED_LOGIN: 'Failed Login',
  ACCESS_DENIED: 'Access Denied',
  DATA_EXPORT: 'Data Export',
  DATA_DELETION: 'Data Deletion',
};

export const AuditLogViewer: React.FC = () => {
  const [filters, setFilters] = useState({
    userId: '',
    eventType: '',
    startDate: '',
    endDate: '',
    page: 0,
  });

  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin', 'auditLogs', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.userId) params.append('userId', filters.userId);
      if (filters.eventType) params.append('eventType', filters.eventType);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      params.append('limit', '50');
      params.append('offset', (filters.page * 50).toString());

      const response = await fetch(`/api/admin/audit/logs?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (!response.ok) throw new Error('Failed to fetch audit logs');
      return response.json() as Promise<AuditLogQuery>;
    },
  });

  const handleExport = async () => {
    const params = new URLSearchParams();
    if (filters.userId) params.append('userId', filters.userId);
    if (filters.eventType) params.append('eventType', filters.eventType);
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);
    params.append('format', 'csv');

    const response = await fetch(`/api/admin/audit/export?${params}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
    });

    if (response.ok) {
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    }
  };

  const toggleRowExpansion = (eventId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(eventId)) {
      newExpanded.delete(eventId);
    } else {
      newExpanded.add(eventId);
    }
    setExpandedRows(newExpanded);
  };

  return (
    <div className={styles.auditLogs}>
      <div className={styles.header}>
        <h1 className={styles.title}>Audit Logs</h1>
        <button className={styles.exportButton} onClick={handleExport}>
          Export CSV
        </button>
      </div>

      <div className={styles.filters}>
        <input
          type="text"
          placeholder="User ID"
          className={styles.filterInput}
          value={filters.userId}
          onChange={(e) => setFilters({ ...filters, userId: e.target.value, page: 0 })}
        />
        
        <select
          className={styles.filterSelect}
          value={filters.eventType}
          onChange={(e) => setFilters({ ...filters, eventType: e.target.value, page: 0 })}
        >
          <option value="">All Events</option>
          {Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        
        <input
          type="date"
          className={styles.filterInput}
          value={filters.startDate}
          onChange={(e) => setFilters({ ...filters, startDate: e.target.value, page: 0 })}
        />
        
        <input
          type="date"
          className={styles.filterInput}
          value={filters.endDate}
          onChange={(e) => setFilters({ ...filters, endDate: e.target.value, page: 0 })}
        />
        
        <button
          className={styles.searchButton}
          onClick={() => refetch()}
        >
          Search
        </button>
      </div>

      {isLoading ? (
        <div className={styles.loading}>Loading audit logs...</div>
      ) : (
        <>
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Event Type</th>
                  <th>User</th>
                  <th>IP Address</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {data?.events.map((event) => (
                  <React.Fragment key={event.id}>
                    <tr className={styles.tableRow}>
                      <td className={styles.timestamp}>
                        {new Date(event.timestamp).toLocaleString()}
                      </td>
                      <td>
                        <span className={`${styles.eventType} ${styles[event.eventType]}`}>
                          {EVENT_TYPE_LABELS[event.eventType] || event.eventType}
                        </span>
                      </td>
                      <td className={styles.userId}>{event.userId || '-'}</td>
                      <td className={styles.ipAddress}>{event.ipAddress || '-'}</td>
                      <td>
                        <button
                          className={styles.detailsButton}
                          onClick={() => toggleRowExpansion(event.id)}
                        >
                          {expandedRows.has(event.id) ? 'Hide' : 'Show'}
                        </button>
                      </td>
                    </tr>
                    {expandedRows.has(event.id) && (
                      <tr className={styles.expandedRow}>
                        <td colSpan={5}>
                          <div className={styles.eventDetails}>
                            <div className={styles.detailItem}>
                              <strong>Event ID:</strong> {event.id}
                            </div>
                            {event.correlationId && (
                              <div className={styles.detailItem}>
                                <strong>Correlation ID:</strong> {event.correlationId}
                              </div>
                            )}
                            {event.meetingId && (
                              <div className={styles.detailItem}>
                                <strong>Meeting ID:</strong> {event.meetingId}
                              </div>
                            )}
                            {event.userAgent && (
                              <div className={styles.detailItem}>
                                <strong>User Agent:</strong>
                                <code className={styles.userAgent}>{event.userAgent}</code>
                              </div>
                            )}
                            {event.metadata && (
                              <div className={styles.detailItem}>
                                <strong>Metadata:</strong>
                                <pre className={styles.metadata}>
                                  {JSON.stringify(event.metadata, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.pagination}>
            <button
              className={styles.pageButton}
              onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
              disabled={filters.page === 0}
            >
              Previous
            </button>
            
            <span className={styles.pageInfo}>
              Page {filters.page + 1} of {Math.ceil((data?.total || 0) / 50)}
            </span>
            
            <button
              className={styles.pageButton}
              onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
              disabled={(filters.page + 1) * 50 >= (data?.total || 0)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
};