import * as mediasoup from 'mediasoup';
import { Worker, Router, AppData } from 'mediasoup/node/lib/types';
import * as os from 'os';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { mediasoupConfig } from './config';

interface WorkerInfo {
  worker: Worker;
  routers: Map<string, Router>;
  cpuUsage: number;
  lastCpuCheck: number;
}

interface WorkerStats {
  workerId: string;
  pid: number;
  cpuUsage: number;
  routerCount: number;
  consumerCount: number;
  producerCount: number;
}

export class MediasoupManager extends EventEmitter {
  private static instance: MediasoupManager;
  private workers: Map<string, WorkerInfo> = new Map();
  private nextWorkerIndex = 0;
  private cpuCheckInterval: NodeJS.Timer | null = null;

  private constructor() {
    super();
  }

  static getInstance(): MediasoupManager {
    if (!MediasoupManager.instance) {
      MediasoupManager.instance = new MediasoupManager();
    }
    return MediasoupManager.instance;
  }

  async initialize(): Promise<void> {
    const numWorkers = process.env['MEDIASOUP_WORKERS'] 
      ? parseInt(process.env['MEDIASOUP_WORKERS'], 10)
      : os.cpus().length;

    logger.info(`Initializing ${numWorkers} mediasoup workers`);

    // Create workers
    for (let i = 0; i < numWorkers; i++) {
      await this.createWorker();
    }

    // Start CPU monitoring
    this.startCpuMonitoring();

    logger.info('MediasoupManager initialized successfully');
  }

  private async createWorker(): Promise<Worker> {
    const worker = await mediasoup.createWorker({
      logLevel: mediasoupConfig.worker.logLevel,
      logTags: mediasoupConfig.worker.logTags,
      rtcMinPort: mediasoupConfig.worker.rtcMinPort,
      rtcMaxPort: mediasoupConfig.worker.rtcMaxPort,
      dtlsCertificateFile: process.env['DTLS_CERT_FILE'],
      dtlsPrivateKeyFile: process.env['DTLS_KEY_FILE'],
    });

    worker.on('died', (error) => {
      logger.error(`Mediasoup worker died`, { 
        workerId: worker.pid, 
        error: error?.message 
      });
      
      // Remove dead worker
      let deadWorkerId: string | undefined;
      for (const [id, info] of this.workers) {
        if (info.worker === worker) {
          deadWorkerId = id;
          break;
        }
      }
      
      if (deadWorkerId) {
        this.workers.delete(deadWorkerId);
      }

      // Replace dead worker
      setTimeout(async () => {
        try {
          await this.createWorker();
          logger.info('Replaced dead worker with new one');
        } catch (err) {
          logger.error('Failed to replace dead worker', err);
        }
      }, 2000);
    });

    const workerInfo: WorkerInfo = {
      worker,
      routers: new Map(),
      cpuUsage: 0,
      lastCpuCheck: Date.now(),
    };

    this.workers.set(worker.pid.toString(), workerInfo);

    logger.info(`Created mediasoup worker`, { pid: worker.pid });

    return worker;
  }

  private startCpuMonitoring(): void {
    // Monitor CPU usage every 10 seconds
    this.cpuCheckInterval = setInterval(async () => {
      for (const [workerId, info] of this.workers) {
        try {
          const usage = await info.worker.getResourceUsage();
          info.cpuUsage = usage.cpu;
          info.lastCpuCheck = Date.now();
        } catch (error) {
          logger.error(`Failed to get CPU usage for worker ${workerId}`, error);
        }
      }
    }, 10000);
  }

  async createRouter(appData?: AppData): Promise<{ router: Router; worker: Worker }> {
    const worker = this.getOptimalWorker();
    const workerInfo = this.workers.get(worker.pid.toString());
    
    if (!workerInfo) {
      throw new Error('Worker info not found');
    }

    const router = await worker.createRouter({
      mediaCodecs: mediasoupConfig.router.mediaCodecs,
      appData,
    });

    workerInfo.routers.set(router.id, router);

    router.on('workerclose', () => {
      workerInfo.routers.delete(router.id);
    });

    logger.info(`Created router on worker ${worker.pid}`, { 
      routerId: router.id,
      routerCount: workerInfo.routers.size 
    });

    return { router, worker };
  }

  private getOptimalWorker(): Worker {
    // Round-robin with CPU usage consideration
    const workers = Array.from(this.workers.values());
    
    if (workers.length === 0) {
      throw new Error('No workers available');
    }

    // Find worker with lowest CPU usage
    let optimalWorker = workers[0];
    let minCpu = workers[0].cpuUsage;

    for (const workerInfo of workers) {
      // Consider both CPU usage and router count
      const score = workerInfo.cpuUsage + (workerInfo.routers.size * 5);
      if (score < minCpu + (optimalWorker.routers.size * 5)) {
        optimalWorker = workerInfo;
        minCpu = workerInfo.cpuUsage;
      }
    }

    // If all workers are heavily loaded, use round-robin
    if (minCpu > 80) {
      this.nextWorkerIndex = (this.nextWorkerIndex + 1) % workers.length;
      optimalWorker = workers[this.nextWorkerIndex];
    }

    return optimalWorker.worker;
  }

  async createPipeTransport(router: Router, listenIp: string): Promise<mediasoup.types.PipeTransport> {
    const transport = await router.createPipeTransport({
      listenInfo: {
        protocol: 'udp',
        ip: listenIp,
        announcedAddress: process.env['MEDIASOUP_ANNOUNCED_IP'],
      },
      enableSctp: true,
      numSctpStreams: { OS: 1024, MIS: 1024 },
      enableRtx: true,
      enableSrtp: true,
    });

    return transport;
  }

  async pipeProducerToRouter(
    producerId: string,
    sourceRouter: Router,
    targetRouter: Router
  ): Promise<void> {
    const producer = sourceRouter.producers.get(producerId);
    if (!producer) {
      throw new Error('Producer not found');
    }

    const sourceTransport = await this.createPipeTransport(
      sourceRouter,
      '127.0.0.1'
    );
    
    const targetTransport = await this.createPipeTransport(
      targetRouter,
      '127.0.0.1'
    );

    // Connect pipe transports
    await sourceTransport.connect({
      ip: targetTransport.tuple.localAddress,
      port: targetTransport.tuple.localPort,
    });

    await targetTransport.connect({
      ip: sourceTransport.tuple.localAddress,
      port: sourceTransport.tuple.localPort,
    });

    // Pipe producer to target router
    await sourceRouter.pipeToRouter({
      producerId: producer.id,
      router: targetRouter,
      listenInfo: targetTransport.tuple,
    });

    logger.info(`Piped producer ${producerId} between routers`);
  }

  getWorkerStats(): WorkerStats[] {
    const stats: WorkerStats[] = [];

    for (const [workerId, info] of this.workers) {
      let consumerCount = 0;
      let producerCount = 0;

      for (const router of info.routers.values()) {
        consumerCount += router.consumers.size;
        producerCount += router.producers.size;
      }

      stats.push({
        workerId,
        pid: info.worker.pid,
        cpuUsage: info.cpuUsage,
        routerCount: info.routers.size,
        consumerCount,
        producerCount,
      });
    }

    return stats;
  }

  async close(): Promise<void> {
    if (this.cpuCheckInterval) {
      clearInterval(this.cpuCheckInterval);
      this.cpuCheckInterval = null;
    }

    for (const [_, info] of this.workers) {
      info.worker.close();
    }

    this.workers.clear();
    logger.info('MediasoupManager closed');
  }
}