import React, { Suspense } from 'react';
import { lazyWithRetry } from '../utils/performance';

// Loading component
const Loading = ({ text = 'Loading...' }: { text?: string }) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    width: '100%',
    minHeight: '200px'
  }}>
    <div style={{ textAlign: 'center' }}>
      <div className="loading-spinner" />
      <p style={{ marginTop: '16px', color: '#94a3b8' }}>{text}</p>
    </div>
  </div>
);

// Error boundary for lazy components
class LazyErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ComponentType<any> },
  { hasError: boolean; error?: Error }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Lazy component error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const Fallback = this.props.fallback;
      if (Fallback) {
        return <Fallback error={this.state.error} />;
      }
      
      return (
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <h3>Failed to load component</h3>
          <p>{this.state.error?.message}</p>
          <button onClick={() => window.location.reload()}>
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Lazy loaded components with retry logic
export const LazyMeetingPage = lazyWithRetry(
  () => import('../pages/MeetingPage'),
  3,
  1000
);

export const LazyEncryptedMeetingRoom = lazyWithRetry(
  () => import('./EncryptedMeetingRoom').then(m => ({ default: m.default })),
  3,
  1000
);

export const LazyCollaborationSidebar = lazyWithRetry(
  () => import('./collaboration/CollaborationSidebar').then(m => ({ default: m.CollaborationSidebar })),
  3,
  1000
);

export const LazyChat = lazyWithRetry(
  () => import('./collaboration/Chat').then(m => ({ default: m.Chat })),
  3,
  1000
);

export const LazyFileSharing = lazyWithRetry(
  () => import('./collaboration/FileSharing').then(m => ({ default: m.FileSharing })),
  3,
  1000
);

export const LazyScreenShareControls = lazyWithRetry(
  () => import('./collaboration/ScreenShareControls').then(m => ({ default: m.ScreenShareControls })),
  3,
  1000
);

export const LazyMeetingInfo = lazyWithRetry(
  () => import('./meeting/MeetingInfo').then(m => ({ default: m.MeetingInfo })),
  3,
  1000
);

export const LazyAuthModal = lazyWithRetry(
  () => import('./auth/AuthModal').then(m => ({ default: m.AuthModal })),
  3,
  1000
);

// HOC for wrapping lazy components
export function withLazyLoading<P extends object>(
  Component: React.LazyExoticComponent<React.ComponentType<P>>,
  loadingText?: string,
  errorFallback?: React.ComponentType<any>
) {
  return (props: P) => (
    <LazyErrorBoundary fallback={errorFallback}>
      <Suspense fallback={<Loading text={loadingText} />}>
        <Component {...props} />
      </Suspense>
    </LazyErrorBoundary>
  );
}

// Preload components
export const preloadComponents = () => {
  // Preload critical components
  const criticalComponents = [
    () => import('../pages/MeetingPage'),
    () => import('./EncryptedMeetingRoom'),
    () => import('./meeting/OptimizedVideoGrid')
  ];

  // Use requestIdleCallback to preload when browser is idle
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(() => {
      criticalComponents.forEach(load => {
        load().catch(console.error);
      });
    }, { timeout: 2000 });
  } else {
    // Fallback: preload after 2 seconds
    setTimeout(() => {
      criticalComponents.forEach(load => {
        load().catch(console.error);
      });
    }, 2000);
  }
};

// Route-based code splitting helper
export const RouteWithLazyComponent = ({ 
  component: Component, 
  ...props 
}: {
  component: React.LazyExoticComponent<React.ComponentType<any>>;
  [key: string]: any;
}) => {
  return withLazyLoading(Component)(props);
};