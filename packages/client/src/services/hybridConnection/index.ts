export type ConnectionMode = 'p2p' | 'sfu';

export interface ConnectionQualityMetrics {
  rtt: number; // Round trip time in milliseconds
  packetLoss: number; // Packet loss percentage
  jitter?: number; // Jitter in milliseconds
  bandwidth?: {
    upload: number; // Upload bandwidth in kbps
    download: number; // Download bandwidth in kbps
  };
}

export interface HybridConnectionService {
  mode: ConnectionMode;
  isTransitioning: boolean;
  quality: ConnectionQualityMetrics | null;
  
  initialize(): Promise<void>;
  switchMode(mode: ConnectionMode): Promise<void>;
  getQualityMetrics(): ConnectionQualityMetrics | null;
  destroy(): void;
}