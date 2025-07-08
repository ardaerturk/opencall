import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import styles from './MeetingAnalytics.module.css';

interface Analytics {
  totalMeetings: number;
  activeMeetings: number;
  totalParticipants: number;
  averageDuration: number;
  peakConcurrentUsers: number;
  dailyActivity: Array<{ date: string; meetings: number; participants: number }>;
  popularHours: Array<{ hour: number; count: number }>;
  deviceBreakdown: Record<string, number>;
}

export const MeetingAnalytics: React.FC = () => {
  const { data: analytics, isLoading } = useQuery({
    queryKey: ['admin', 'analytics'],
    queryFn: async () => {
      const response = await fetch('/api/admin/analytics', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (!response.ok) throw new Error('Failed to fetch analytics');
      return response.json() as Promise<Analytics>;
    },
  });

  if (isLoading) {
    return <div className={styles.loading}>Loading analytics...</div>;
  }

  if (!analytics) {
    return <div className={styles.error}>Failed to load analytics</div>;
  }

  return (
    <div className={styles.analytics}>
      <h1 className={styles.title}>Meeting Analytics</h1>
      
      <div className={styles.metrics}>
        <MetricCard
          title="Total Meetings"
          value={analytics.totalMeetings.toLocaleString()}
          icon="📊"
          trend="+12%"
        />
        <MetricCard
          title="Active Now"
          value={analytics.activeMeetings.toString()}
          icon="🟢"
          isLive
        />
        <MetricCard
          title="Total Participants"
          value={analytics.totalParticipants.toLocaleString()}
          icon="👥"
          trend="+8%"
        />
        <MetricCard
          title="Avg Duration"
          value={`${Math.round(analytics.averageDuration)} min`}
          icon="⏱️"
        />
      </div>

      <div className={styles.charts}>
        <div className={styles.chart}>
          <h3 className={styles.chartTitle}>Daily Activity</h3>
          <DailyActivityChart data={analytics.dailyActivity} />
        </div>
        
        <div className={styles.chart}>
          <h3 className={styles.chartTitle}>Peak Hours</h3>
          <PeakHoursChart data={analytics.popularHours} />
        </div>
      </div>

      <div className={styles.deviceStats}>
        <h3 className={styles.chartTitle}>Device Breakdown</h3>
        <DeviceBreakdown data={analytics.deviceBreakdown} />
      </div>
    </div>
  );
};

interface MetricCardProps {
  title: string;
  value: string;
  icon: string;
  trend?: string;
  isLive?: boolean;
}

const MetricCard: React.FC<MetricCardProps> = ({ title, value, icon, trend, isLive }) => {
  return (
    <div className={styles.metricCard}>
      <div className={styles.metricHeader}>
        <span className={styles.metricIcon}>{icon}</span>
        {isLive && <span className={styles.liveBadge}>LIVE</span>}
      </div>
      <div className={styles.metricValue}>{value}</div>
      <div className={styles.metricTitle}>{title}</div>
      {trend && <div className={styles.metricTrend}>{trend}</div>}
    </div>
  );
};

const DailyActivityChart: React.FC<{ data: Analytics['dailyActivity'] }> = ({ data }) => {
  const maxMeetings = Math.max(...data.map(d => d.meetings));
  
  return (
    <div className={styles.barChart}>
      {data.slice(-7).map((day, index) => (
        <div key={index} className={styles.barColumn}>
          <div className={styles.barContainer}>
            <div
              className={styles.bar}
              style={{ height: `${(day.meetings / maxMeetings) * 100}%` }}
              title={`${day.meetings} meetings`}
            />
          </div>
          <div className={styles.barLabel}>
            {new Date(day.date).toLocaleDateString('en', { weekday: 'short' })}
          </div>
        </div>
      ))}
    </div>
  );
};

const PeakHoursChart: React.FC<{ data: Analytics['popularHours'] }> = ({ data }) => {
  const maxCount = Math.max(...data.map(h => h.count));
  
  return (
    <div className={styles.heatmap}>
      {Array.from({ length: 24 }, (_, hour) => {
        const hourData = data.find(h => h.hour === hour);
        const count = hourData?.count || 0;
        const intensity = count / maxCount;
        
        return (
          <div
            key={hour}
            className={styles.heatmapCell}
            style={{
              backgroundColor: `rgba(59, 130, 246, ${intensity})`,
            }}
            title={`${hour}:00 - ${count} meetings`}
          >
            {hour}
          </div>
        );
      })}
    </div>
  );
};

const DeviceBreakdown: React.FC<{ data: Record<string, number> }> = ({ data }) => {
  const total = Object.values(data).reduce((sum, count) => sum + count, 0);
  
  return (
    <div className={styles.deviceBreakdown}>
      {Object.entries(data).map(([device, count]) => {
        const percentage = ((count / total) * 100).toFixed(1);
        
        return (
          <div key={device} className={styles.deviceRow}>
            <div className={styles.deviceInfo}>
              <span className={styles.deviceName}>{device}</span>
              <span className={styles.devicePercentage}>{percentage}%</span>
            </div>
            <div className={styles.deviceBar}>
              <div
                className={styles.deviceBarFill}
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};