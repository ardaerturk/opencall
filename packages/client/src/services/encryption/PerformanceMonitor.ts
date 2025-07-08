export interface PerformanceMetrics {
  encryptionTime: number;
  decryptionTime: number;
  frameCount: number;
  avgEncryptionTime: number;
  avgDecryptionTime: number;
  maxEncryptionTime: number;
  maxDecryptionTime: number;
  droppedFrames: number;
}

export class PerformanceMonitor {
  private metrics: PerformanceMetrics = {
    encryptionTime: 0,
    decryptionTime: 0,
    frameCount: 0,
    avgEncryptionTime: 0,
    avgDecryptionTime: 0,
    maxEncryptionTime: 0,
    maxDecryptionTime: 0,
    droppedFrames: 0
  };
  
  private encryptionSamples: number[] = [];
  private decryptionSamples: number[] = [];
  private readonly maxSamples = 1000;
  private reportInterval: number | null = null;
  private onReport?: (metrics: PerformanceMetrics) => void;

  constructor(onReport?: (metrics: PerformanceMetrics) => void) {
    this.onReport = onReport;
  }

  startMonitoring(intervalMs: number = 5000): void {
    if (this.reportInterval) {
      return;
    }

    this.reportInterval = window.setInterval(() => {
      this.reportMetrics();
    }, intervalMs);
  }

  stopMonitoring(): void {
    if (this.reportInterval) {
      clearInterval(this.reportInterval);
      this.reportInterval = null;
    }
  }

  recordEncryption(duration: number): void {
    this.metrics.encryptionTime += duration;
    this.metrics.frameCount++;
    
    this.encryptionSamples.push(duration);
    if (this.encryptionSamples.length > this.maxSamples) {
      this.encryptionSamples.shift();
    }
    
    if (duration > this.metrics.maxEncryptionTime) {
      this.metrics.maxEncryptionTime = duration;
    }
    
    // Update average
    this.metrics.avgEncryptionTime = this.calculateAverage(this.encryptionSamples);
    
    // Check if we're exceeding threshold (10ms)
    if (duration > 10) {
      console.warn(`Encryption took ${duration.toFixed(2)}ms - exceeding 10ms threshold`);
    }
  }

  recordDecryption(duration: number): void {
    this.metrics.decryptionTime += duration;
    
    this.decryptionSamples.push(duration);
    if (this.decryptionSamples.length > this.maxSamples) {
      this.decryptionSamples.shift();
    }
    
    if (duration > this.metrics.maxDecryptionTime) {
      this.metrics.maxDecryptionTime = duration;
    }
    
    // Update average
    this.metrics.avgDecryptionTime = this.calculateAverage(this.decryptionSamples);
    
    // Check if we're exceeding threshold (10ms)
    if (duration > 10) {
      console.warn(`Decryption took ${duration.toFixed(2)}ms - exceeding 10ms threshold`);
    }
  }

  recordDroppedFrame(): void {
    this.metrics.droppedFrames++;
  }

  private calculateAverage(samples: number[]): number {
    if (samples.length === 0) return 0;
    const sum = samples.reduce((a, b) => a + b, 0);
    return sum / samples.length;
  }

  private reportMetrics(): void {
    const report = { ...this.metrics };
    
    // Calculate percentiles
    const encryptionP95 = this.calculatePercentile(this.encryptionSamples, 0.95);
    const decryptionP95 = this.calculatePercentile(this.decryptionSamples, 0.95);
    
    console.log('=== Encryption Performance Report ===');
    console.log(`Frames processed: ${report.frameCount}`);
    console.log(`Average encryption time: ${report.avgEncryptionTime.toFixed(2)}ms`);
    console.log(`Average decryption time: ${report.avgDecryptionTime.toFixed(2)}ms`);
    console.log(`Max encryption time: ${report.maxEncryptionTime.toFixed(2)}ms`);
    console.log(`Max decryption time: ${report.maxDecryptionTime.toFixed(2)}ms`);
    console.log(`95th percentile encryption: ${encryptionP95.toFixed(2)}ms`);
    console.log(`95th percentile decryption: ${decryptionP95.toFixed(2)}ms`);
    console.log(`Dropped frames: ${report.droppedFrames}`);
    console.log('===================================');
    
    this.onReport?.(report);
  }

  private calculatePercentile(samples: number[], percentile: number): number {
    if (samples.length === 0) return 0;
    
    const sorted = [...samples].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * percentile) - 1;
    return sorted[index] || 0;
  }

  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  reset(): void {
    this.metrics = {
      encryptionTime: 0,
      decryptionTime: 0,
      frameCount: 0,
      avgEncryptionTime: 0,
      avgDecryptionTime: 0,
      maxEncryptionTime: 0,
      maxDecryptionTime: 0,
      droppedFrames: 0
    };
    this.encryptionSamples = [];
    this.decryptionSamples = [];
  }
}

// Singleton for global performance monitoring
export const performanceMonitor = new PerformanceMonitor();

// Helper function to measure async operation performance
export async function measurePerformance<T>(
  operation: () => Promise<T>,
  onComplete: (duration: number) => void
): Promise<T> {
  const start = performance.now();
  try {
    const result = await operation();
    const duration = performance.now() - start;
    onComplete(duration);
    return result;
  } catch (error) {
    const duration = performance.now() - start;
    onComplete(duration);
    throw error;
  }
}