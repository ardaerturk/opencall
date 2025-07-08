/**
 * Web Worker Pool for parallel cryptographic operations
 * Manages a pool of workers for efficient parallel processing
 */

interface WorkerTask {
  id: string;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  timeout?: NodeJS.Timeout;
}

interface PooledWorker {
  worker: Worker;
  busy: boolean;
  taskCount: number;
  lastUsed: number;
}

export interface WorkerPoolConfig {
  workerScript: string;
  minWorkers?: number;
  maxWorkers?: number;
  taskTimeout?: number;
  idleTimeout?: number;
  warmupTasks?: number;
}

export class WorkerPool {
  private workers: PooledWorker[] = [];
  private taskQueue: Array<{ task: any; taskId: string }> = [];
  private pendingTasks = new Map<string, WorkerTask>();
  private config: Required<WorkerPoolConfig>;
  private terminated = false;
  private taskCounter = 0;
  private performanceStats = {
    totalTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    averageTime: 0,
    taskTimes: [] as number[]
  };

  constructor(config: WorkerPoolConfig) {
    this.config = {
      minWorkers: config.minWorkers || navigator.hardwareConcurrency || 4,
      maxWorkers: config.maxWorkers || navigator.hardwareConcurrency * 2 || 8,
      taskTimeout: config.taskTimeout || 30000,
      idleTimeout: config.idleTimeout || 60000,
      warmupTasks: config.warmupTasks || 2,
      ...config
    };

    // Initialize minimum number of workers
    this.initializeWorkers();

    // Start idle worker cleanup
    this.startIdleWorkerCleanup();
  }

  private initializeWorkers(): void {
    for (let i = 0; i < this.config.minWorkers; i++) {
      this.createWorker();
    }
  }

  private createWorker(): PooledWorker {
    const worker = new Worker(this.config.workerScript, { type: 'module' });
    const pooledWorker: PooledWorker = {
      worker,
      busy: false,
      taskCount: 0,
      lastUsed: Date.now()
    };

    worker.onmessage = (event) => {
      const { taskId, result, error, performance } = event.data;
      const task = this.pendingTasks.get(taskId);

      if (task) {
        if (task.timeout) {
          clearTimeout(task.timeout);
        }

        if (error) {
          task.reject(error);
          this.performanceStats.failedTasks++;
        } else {
          task.resolve(result);
          this.performanceStats.completedTasks++;
          
          if (performance?.duration) {
            this.updatePerformanceStats(performance.duration);
          }
        }

        this.pendingTasks.delete(taskId);
        pooledWorker.busy = false;
        pooledWorker.lastUsed = Date.now();
        pooledWorker.taskCount++;

        // Process next task in queue
        this.processQueue();
      }
    };

    worker.onerror = (error) => {
      console.error('Worker error:', error);
      // Recreate worker if it crashes
      const index = this.workers.indexOf(pooledWorker);
      if (index !== -1) {
        this.workers.splice(index, 1);
        if (this.workers.length < this.config.minWorkers && !this.terminated) {
          this.createWorker();
        }
      }
    };

    // Warm up the worker
    if (this.config.warmupTasks > 0) {
      this.warmupWorker(worker);
    }

    this.workers.push(pooledWorker);
    return pooledWorker;
  }

  private async warmupWorker(worker: Worker): Promise<void> {
    for (let i = 0; i < this.config.warmupTasks; i++) {
      worker.postMessage({ type: 'warmup', taskId: `warmup-${i}` });
    }
  }

  private updatePerformanceStats(duration: number): void {
    this.performanceStats.taskTimes.push(duration);
    
    // Keep only last 100 measurements
    if (this.performanceStats.taskTimes.length > 100) {
      this.performanceStats.taskTimes.shift();
    }

    // Calculate moving average
    const sum = this.performanceStats.taskTimes.reduce((a, b) => a + b, 0);
    this.performanceStats.averageTime = sum / this.performanceStats.taskTimes.length;
  }

  async execute<T>(task: any): Promise<T> {
    if (this.terminated) {
      throw new Error('WorkerPool has been terminated');
    }

    const taskId = `task-${++this.taskCounter}`;
    this.performanceStats.totalTasks++;

    return new Promise<T>((resolve, reject) => {
      const taskInfo: WorkerTask = {
        id: taskId,
        resolve,
        reject
      };

      // Set task timeout
      if (this.config.taskTimeout > 0) {
        taskInfo.timeout = setTimeout(() => {
          this.pendingTasks.delete(taskId);
          reject(new Error('Task timeout'));
          this.performanceStats.failedTasks++;
        }, this.config.taskTimeout);
      }

      this.pendingTasks.set(taskId, taskInfo);
      this.taskQueue.push({ task, taskId });
      this.processQueue();
    });
  }

  private processQueue(): void {
    if (this.taskQueue.length === 0) return;

    // Find available worker
    let availableWorker = this.workers.find(w => !w.busy);

    // Create new worker if needed and under limit
    if (!availableWorker && this.workers.length < this.config.maxWorkers) {
      availableWorker = this.createWorker();
    }

    if (availableWorker) {
      const { task, taskId } = this.taskQueue.shift()!;
      availableWorker.busy = true;
      availableWorker.worker.postMessage({ ...task, taskId });
    }
  }

  private startIdleWorkerCleanup(): void {
    setInterval(() => {
      if (this.terminated) return;

      const now = Date.now();
      const idleWorkers = this.workers.filter(
        w => !w.busy && 
        now - w.lastUsed > this.config.idleTimeout &&
        this.workers.length > this.config.minWorkers
      );

      for (const worker of idleWorkers) {
        const index = this.workers.indexOf(worker);
        if (index !== -1) {
          worker.worker.terminate();
          this.workers.splice(index, 1);
        }
      }
    }, 10000); // Check every 10 seconds
  }

  getStats() {
    return {
      ...this.performanceStats,
      activeWorkers: this.workers.length,
      busyWorkers: this.workers.filter(w => w.busy).length,
      queueLength: this.taskQueue.length,
      pendingTasks: this.pendingTasks.size
    };
  }

  async terminate(): Promise<void> {
    this.terminated = true;

    // Clear all pending tasks
    for (const task of this.pendingTasks.values()) {
      if (task.timeout) {
        clearTimeout(task.timeout);
      }
      task.reject(new Error('WorkerPool terminated'));
    }

    // Terminate all workers
    for (const worker of this.workers) {
      worker.worker.terminate();
    }

    this.workers = [];
    this.taskQueue = [];
    this.pendingTasks.clear();
  }
}

// Singleton instance for encryption workers
let encryptionWorkerPool: WorkerPool | null = null;

export function getEncryptionWorkerPool(): WorkerPool {
  if (!encryptionWorkerPool) {
    encryptionWorkerPool = new WorkerPool({
      workerScript: '/workers/encryptionWorker.js',
      minWorkers: 2,
      maxWorkers: navigator.hardwareConcurrency || 4,
      taskTimeout: 5000,
      warmupTasks: 1
    });
  }
  return encryptionWorkerPool;
}

// Performance monitoring utilities
export class CryptoPerformanceMonitor {
  private metrics = new Map<string, number[]>();
  private readonly maxSamples = 1000;

  recordOperation(operation: string, duration: number): void {
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, []);
    }

    const samples = this.metrics.get(operation)!;
    samples.push(duration);

    // Keep only recent samples
    if (samples.length > this.maxSamples) {
      samples.shift();
    }
  }

  getStats(operation: string) {
    const samples = this.metrics.get(operation) || [];
    if (samples.length === 0) {
      return null;
    }

    const sorted = [...samples].sort((a, b) => a - b);
    return {
      count: samples.length,
      mean: samples.reduce((a, b) => a + b, 0) / samples.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
      min: sorted[0],
      max: sorted[sorted.length - 1]
    };
  }

  getAllStats() {
    const stats: Record<string, any> = {};
    for (const [operation] of this.metrics) {
      stats[operation] = this.getStats(operation);
    }
    return stats;
  }

  clear(): void {
    this.metrics.clear();
  }
}