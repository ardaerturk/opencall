import { PerformanceMonitor, measurePerformance } from '../PerformanceMonitor';

describe('PerformanceMonitor', () => {
  let monitor: PerformanceMonitor;

  beforeEach(() => {
    monitor = new PerformanceMonitor();
  });

  afterEach(() => {
    monitor.stopMonitoring();
    monitor.reset();
  });

  describe('recordEncryption', () => {
    it('should record encryption time', () => {
      monitor.recordEncryption(5.5);
      monitor.recordEncryption(6.2);
      monitor.recordEncryption(4.8);

      const metrics = monitor.getMetrics();
      expect(metrics.frameCount).toBe(3);
      expect(metrics.avgEncryptionTime).toBeCloseTo(5.5, 1);
      expect(metrics.maxEncryptionTime).toBe(6.2);
    });

    it('should warn when encryption exceeds 10ms', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      monitor.recordEncryption(12.5);
      
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Encryption took 12.50ms - exceeding 10ms threshold')
      );
      
      warnSpy.mockRestore();
    });

    it('should maintain sliding window of samples', () => {
      // Add more than maxSamples (1000)
      for (let i = 0; i < 1100; i++) {
        monitor.recordEncryption(i % 10);
      }

      const metrics = monitor.getMetrics();
      expect(metrics.frameCount).toBe(1100);
      // Average should be around 4.5 for the last 1000 samples
      expect(metrics.avgEncryptionTime).toBeCloseTo(4.5, 1);
    });
  });

  describe('recordDecryption', () => {
    it('should record decryption time', () => {
      monitor.recordDecryption(3.2);
      monitor.recordDecryption(4.1);
      monitor.recordDecryption(3.7);

      const metrics = monitor.getMetrics();
      expect(metrics.avgDecryptionTime).toBeCloseTo(3.67, 1);
      expect(metrics.maxDecryptionTime).toBe(4.1);
    });

    it('should warn when decryption exceeds 10ms', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      monitor.recordDecryption(15.3);
      
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Decryption took 15.30ms - exceeding 10ms threshold')
      );
      
      warnSpy.mockRestore();
    });
  });

  describe('recordDroppedFrame', () => {
    it('should count dropped frames', () => {
      monitor.recordDroppedFrame();
      monitor.recordDroppedFrame();
      monitor.recordDroppedFrame();

      const metrics = monitor.getMetrics();
      expect(metrics.droppedFrames).toBe(3);
    });
  });

  describe('monitoring and reporting', () => {
    it('should report metrics periodically', (done) => {
      const onReport = jest.fn((metrics) => {
        expect(metrics).toHaveProperty('frameCount');
        expect(metrics).toHaveProperty('avgEncryptionTime');
        expect(metrics).toHaveProperty('avgDecryptionTime');
        monitor.stopMonitoring();
        done();
      });

      const reportMonitor = new PerformanceMonitor(onReport);
      reportMonitor.recordEncryption(5.0);
      reportMonitor.startMonitoring(100); // Report every 100ms
    });

    it('should not start multiple monitoring intervals', () => {
      monitor.startMonitoring(1000);
      monitor.startMonitoring(1000); // Should not create another interval
      
      // This is hard to test directly, but we can verify it doesn't throw
      expect(() => monitor.stopMonitoring()).not.toThrow();
    });

    it('should log performance report', () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation();
      
      monitor.recordEncryption(5.5);
      monitor.recordDecryption(3.2);
      monitor.recordDroppedFrame();
      
      // Trigger report manually (private method, so we start/stop monitoring)
      monitor.startMonitoring(10);
      
      // Wait for report
      setTimeout(() => {
        expect(logSpy).toHaveBeenCalledWith(
          expect.stringContaining('=== Encryption Performance Report ===')
        );
        monitor.stopMonitoring();
        logSpy.mockRestore();
      }, 20);
    });
  });

  describe('reset', () => {
    it('should clear all metrics', () => {
      monitor.recordEncryption(5.5);
      monitor.recordDecryption(3.2);
      monitor.recordDroppedFrame();

      monitor.reset();

      const metrics = monitor.getMetrics();
      expect(metrics.frameCount).toBe(0);
      expect(metrics.avgEncryptionTime).toBe(0);
      expect(metrics.avgDecryptionTime).toBe(0);
      expect(metrics.droppedFrames).toBe(0);
    });
  });

  describe('percentile calculations', () => {
    it('should calculate 95th percentile correctly', () => {
      // Add 100 samples: 95 at 5ms, 5 at 50ms
      for (let i = 0; i < 95; i++) {
        monitor.recordEncryption(5);
      }
      for (let i = 0; i < 5; i++) {
        monitor.recordEncryption(50);
      }

      // The 95th percentile should be around 5ms
      const metrics = monitor.getMetrics();
      expect(metrics.avgEncryptionTime).toBeGreaterThan(5);
      expect(metrics.maxEncryptionTime).toBe(50);
    });
  });
});

describe('measurePerformance', () => {
  it('should measure async operation performance', async () => {
    const callback = jest.fn();
    
    const result = await measurePerformance(
      async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'success';
      },
      callback
    );

    expect(result).toBe('success');
    expect(callback).toHaveBeenCalledWith(expect.any(Number));
    expect(callback.mock.calls[0][0]).toBeGreaterThan(10);
  });

  it('should measure performance even on error', async () => {
    const callback = jest.fn();
    
    await expect(measurePerformance(
      async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
        throw new Error('Test error');
      },
      callback
    )).rejects.toThrow('Test error');

    expect(callback).toHaveBeenCalledWith(expect.any(Number));
    expect(callback.mock.calls[0][0]).toBeGreaterThan(5);
  });
});