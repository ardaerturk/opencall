/**
 * Service Worker Registration and Management
 * Handles SW registration, updates, and communication
 */

export interface ServiceWorkerConfig {
  onUpdate?: (registration: ServiceWorkerRegistration) => void;
  onSuccess?: (registration: ServiceWorkerRegistration) => void;
  onOffline?: () => void;
  onOnline?: () => void;
}

class ServiceWorkerManager {
  private registration: ServiceWorkerRegistration | null = null;
  private messageChannel: MessageChannel | null = null;
  private updateAvailable = false;
  private config: ServiceWorkerConfig = {};

  async register(config: ServiceWorkerConfig = {}): Promise<ServiceWorkerRegistration | undefined> {
    this.config = config;

    if (!('serviceWorker' in navigator)) {
      console.log('Service Workers not supported');
      return;
    }

    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none'
      });

      this.registration = registration;

      // Check for updates every hour
      setInterval(() => {
        registration.update();
      }, 60 * 60 * 1000);

      // Handle updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              this.updateAvailable = true;
              config.onUpdate?.(registration);
            }
          });
        }
      });

      // Handle successful registration
      if (registration.active) {
        config.onSuccess?.(registration);
      }

      // Set up message channel
      this.setupMessageChannel();

      // Handle online/offline events
      this.setupNetworkListeners();

      // Request notification permission if needed
      if ('Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission();
      }

      return registration;
    } catch (error) {
      console.error('Service Worker registration failed:', error);
      throw error;
    }
  }

  private setupMessageChannel(): void {
    this.messageChannel = new MessageChannel();
    
    this.messageChannel.port1.onmessage = (event) => {
      this.handleServiceWorkerMessage(event.data);
    };
  }

  private setupNetworkListeners(): void {
    window.addEventListener('online', () => {
      console.log('Back online');
      this.config.onOnline?.();
      this.syncOfflineData();
    });

    window.addEventListener('offline', () => {
      console.log('Gone offline');
      this.config.onOffline?.();
    });
  }

  private handleServiceWorkerMessage(data: any): void {
    switch (data.type) {
      case 'rejoin-meeting':
        // Handle meeting rejoin
        window.dispatchEvent(new CustomEvent('rejoin-meeting', { 
          detail: { meetingId: data.meetingId } 
        }));
        break;
        
      case 'cache-update':
        // Handle cache updates
        console.log('Cache updated:', data.cache);
        break;
        
      case 'sync-complete':
        // Handle sync completion
        console.log('Sync completed:', data.tag);
        break;
    }
  }

  async unregister(): Promise<boolean> {
    if (!this.registration) return false;
    
    return this.registration.unregister();
  }

  async update(): Promise<void> {
    if (!this.registration) return;
    
    await this.registration.update();
  }

  async skipWaiting(): Promise<void> {
    if (!this.registration?.waiting) return;
    
    this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  }

  async saveMeetingState(meetingId: string, state: any): Promise<void> {
    if (!navigator.serviceWorker.controller) return;
    
    return this.sendMessage('save-meeting-state', { meetingId, state });
  }

  async getMeetingState(meetingId: string): Promise<any> {
    if (!navigator.serviceWorker.controller) return null;
    
    return this.sendMessage('get-meeting-state', { meetingId });
  }

  async clearCache(): Promise<void> {
    if (!navigator.serviceWorker.controller) return;
    
    return this.sendMessage('clear-cache', {});
  }

  async cacheAssets(assets: string[]): Promise<void> {
    if (!navigator.serviceWorker.controller) return;
    
    return this.sendMessage('cache-assets', { assets });
  }

  private sendMessage(type: string, data: any): Promise<any> {
    return new Promise((resolve) => {
      if (!this.messageChannel) {
        this.setupMessageChannel();
      }

      const channel = new MessageChannel();
      
      channel.port1.onmessage = (event) => {
        resolve(event.data);
      };

      navigator.serviceWorker.controller?.postMessage(
        { type, data },
        [channel.port2]
      );
    });
  }

  private async syncOfflineData(): Promise<void> {
    if (!('sync' in ServiceWorkerRegistration.prototype)) {
      console.log('Background sync not supported');
      return;
    }

    try {
      await this.registration?.sync.register('sync-messages');
      await this.registration?.sync.register('sync-meeting-state');
    } catch (error) {
      console.error('Failed to register sync:', error);
    }
  }

  async subscribeToPushNotifications(): Promise<PushSubscription | null> {
    if (!this.registration || !('pushManager' in this.registration)) {
      return null;
    }

    try {
      // Get public key from server
      const response = await fetch('/api/push/vapid-public-key');
      const { publicKey } = await response.json();

      const subscription = await this.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlB64ToUint8Array(publicKey)
      });

      // Send subscription to server
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription)
      });

      return subscription;
    } catch (error) {
      console.error('Failed to subscribe to push notifications:', error);
      return null;
    }
  }

  private urlB64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    
    return outputArray;
  }

  getUpdateAvailable(): boolean {
    return this.updateAvailable;
  }

  async checkForUpdates(): Promise<boolean> {
    if (!this.registration) return false;
    
    await this.registration.update();
    return this.updateAvailable;
  }
}

// Export singleton instance
export const serviceWorkerManager = new ServiceWorkerManager();

// React hook for service worker
import { useEffect, useState } from 'react';

export function useServiceWorker() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const register = async () => {
      const reg = await serviceWorkerManager.register({
        onUpdate: () => setUpdateAvailable(true),
        onSuccess: (reg) => setRegistration(reg),
        onOffline: () => setIsOffline(true),
        onOnline: () => setIsOffline(false)
      });

      if (reg) {
        setRegistration(reg);
      }
    };

    register();

    return () => {
      // Cleanup if needed
    };
  }, []);

  const updateServiceWorker = async () => {
    await serviceWorkerManager.skipWaiting();
    window.location.reload();
  };

  return {
    registration,
    updateAvailable,
    isOffline,
    updateServiceWorker,
    saveMeetingState: serviceWorkerManager.saveMeetingState.bind(serviceWorkerManager),
    getMeetingState: serviceWorkerManager.getMeetingState.bind(serviceWorkerManager),
    clearCache: serviceWorkerManager.clearCache.bind(serviceWorkerManager),
    subscribeToPush: serviceWorkerManager.subscribeToPushNotifications.bind(serviceWorkerManager)
  };
}