import { Meeting, Participant } from './Meeting';
import { MeetingId, MeetingOptions } from '@opencall/core';
import * as mediasoup from 'mediasoup';
import { 
  Worker, 
  Router, 
  Transport, 
  Producer, 
  Consumer, 
  DataProducer,
  DataConsumer,
  RtpCapabilities,
  DtlsParameters,
  MediaKind,
  RtpParameters,
  ConsumerLayers,
  ProducerStat,
} from 'mediasoup/node/lib/types';
import { logger } from '../utils/logger';
import { MediasoupManager } from '../mediasoup/MediasoupManager';
import { mediasoupConfig } from '../mediasoup/config';
import { CodecSelector } from '../mediasoup/CodecSelector';

interface MediasoupParticipant extends Participant {
  rtpCapabilities?: RtpCapabilities;
  audioLevel?: number;
  activeSpeaker?: boolean;
  stats?: {
    bitrate: number;
    packetLoss: number;
    jitter: number;
  };
}

interface ParticipantTransports {
  sendTransport?: Transport;
  recvTransport?: Transport;
  producers: Map<string, Producer>;
  consumers: Map<string, Consumer>;
  dataProducers: Map<string, DataProducer>;
  dataConsumers: Map<string, DataConsumer>;
}

interface AudioLevelInfo {
  participantId: string;
  audioLevel: number;
  timestamp: number;
}

interface SimulcastConfig {
  scalabilityMode: string;
  encodings: Array<{
    maxBitrate: number;
    scaleResolutionDownBy?: number;
    maxFramerate?: number;
  }>;
}

export class MediasoupRoom extends Meeting {
  private router!: Router;
  private worker!: Worker;
  private participantTransports = new Map<string, ParticipantTransports>();
  private audioLevelObserver?: mediasoup.types.AudioLevelObserver;
  private activeSpeakerIds: string[] = [];
  private lastActiveSpeakerUpdate = 0;
  private bandwidthThrottleTimer?: NodeJS.Timer;
  private statsInterval?: NodeJS.Timer;
  private recordingEnabled = false;
  private plainTransport?: mediasoup.types.PlainTransport;

  // Simulcast configurations
  private readonly simulcastConfigs: Record<string, SimulcastConfig> = {
    'webcam': {
      scalabilityMode: 'L3T3',
      encodings: [
        { maxBitrate: 100_000, scaleResolutionDownBy: 4 },
        { maxBitrate: 300_000, scaleResolutionDownBy: 2 },
        { maxBitrate: 900_000, scaleResolutionDownBy: 1 },
      ]
    },
    'screen': {
      scalabilityMode: 'L1T3',
      encodings: [
        { maxBitrate: 1_500_000, maxFramerate: 30 }
      ]
    }
  };

  constructor(
    id: MeetingId,
    options: MeetingOptions,
    hostId: string,
  ) {
    super(id, options, hostId);
    this.options.maxParticipants = this.options.maxParticipants || 500;
    this.initializeSFU();
  }

  private async initializeSFU(): Promise<void> {
    try {
      const manager = MediasoupManager.getInstance();
      const { router, worker } = await manager.createRouter({
        meetingId: this.id,
        createdAt: this.createdAt.toISOString(),
      });

      this.router = router;
      this.worker = worker;

      // Create audio level observer for active speaker detection
      if (this.options.features?.activeSpeakerDetection !== false) {
        await this.createAudioLevelObserver();
      }

      // Start stats collection
      this.startStatsCollection();

      logger.info(`MediasoupRoom initialized`, {
        meetingId: this.id,
        routerId: this.router.id,
        workerId: this.worker.pid,
      });
    } catch (error) {
      logger.error(`Failed to initialize MediasoupRoom ${this.id}`, error);
      throw error;
    }
  }

  private async createAudioLevelObserver(): Promise<void> {
    this.audioLevelObserver = await this.router.createAudioLevelObserver({
      maxEntries: 10,
      threshold: -60,
      interval: 1000,
    });

    this.audioLevelObserver.on('volumes', (volumes: Array<{ producer: Producer; volume: number }>) => {
      const audioLevels: AudioLevelInfo[] = [];
      
      for (const { producer, volume } of volumes) {
        const participantId = producer.appData.participantId;
        if (participantId) {
          audioLevels.push({
            participantId,
            audioLevel: volume,
            timestamp: Date.now(),
          });

          // Update participant audio level
          const participant = this.participants.get(participantId) as MediasoupParticipant;
          if (participant) {
            participant.audioLevel = volume;
          }
        }
      }

      // Update active speakers
      this.updateActiveSpeakers(audioLevels);
    });

    this.audioLevelObserver.on('silence', () => {
      this.activeSpeakerIds = [];
      this.emit('activeSpeakers:changed', []);
    });
  }

  private updateActiveSpeakers(audioLevels: AudioLevelInfo[]): void {
    const now = Date.now();
    
    // Throttle updates to max once per 200ms
    if (now - this.lastActiveSpeakerUpdate < 200) {
      return;
    }

    const sortedLevels = audioLevels
      .filter(level => level.audioLevel > -50) // Only consider audible speakers
      .sort((a, b) => b.audioLevel - a.audioLevel)
      .slice(0, 3); // Top 3 speakers

    const newActiveSpeakerIds = sortedLevels.map(level => level.participantId);
    
    // Check if active speakers changed
    const changed = JSON.stringify(newActiveSpeakerIds) !== JSON.stringify(this.activeSpeakerIds);
    
    if (changed) {
      this.activeSpeakerIds = newActiveSpeakerIds;
      this.lastActiveSpeakerUpdate = now;
      
      // Update participant states
      for (const [id, participant] of this.participants) {
        (participant as MediasoupParticipant).activeSpeaker = newActiveSpeakerIds.includes(id);
      }

      this.emit('activeSpeakers:changed', newActiveSpeakerIds);
    }
  }

  async addParticipant(participant: MediasoupParticipant): Promise<void> {
    this.participants.set(participant.id, participant);
    
    // Initialize transport structure
    this.participantTransports.set(participant.id, {
      producers: new Map(),
      consumers: new Map(),
      dataProducers: new Map(),
      dataConsumers: new Map(),
    });

    this.emit('participant:joined', participant);
    
    logger.info(`Participant joined MediasoupRoom`, {
      meetingId: this.id,
      participantId: participant.id,
      totalParticipants: this.participants.size,
    });

    // Create data consumer for existing data producers
    await this.createDataConsumersForParticipant(participant.id);
  }

  async createWebRtcTransport(
    participantId: string, 
    direction: 'send' | 'recv'
  ): Promise<any> {
    const transport = await this.router.createWebRtcTransport({
      ...mediasoupConfig.webRtcTransport,
      appData: {
        participantId,
        direction,
      },
      // Enable SCTP for DataChannels
      enableSctp: true,
      numSctpStreams: { OS: 1024, MIS: 1024 },
      sctpSendBufferSize: 262144,
    });

    const transports = this.participantTransports.get(participantId);
    if (!transports) {
      throw new Error('Participant transports not initialized');
    }

    if (direction === 'send') {
      transports.sendTransport = transport;
    } else {
      transports.recvTransport = transport;
    }

    // Set up bandwidth monitoring
    transport.on('sctpstatechange', (sctpState) => {
      logger.debug(`SCTP state changed`, { 
        transportId: transport.id, 
        sctpState 
      });
    });

    transport.on('dtlsstatechange', (dtlsState) => {
      if (dtlsState === 'failed' || dtlsState === 'closed') {
        logger.warn(`DTLS state changed to ${dtlsState}`, {
          transportId: transport.id,
          participantId,
        });
      }
    });

    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
      sctpParameters: transport.sctpParameters,
    };
  }

  async produce(
    participantId: string,
    transportId: string,
    kind: MediaKind,
    rtpParameters: RtpParameters,
    appData?: any
  ): Promise<string> {
    const transports = this.participantTransports.get(participantId);
    if (!transports || !transports.sendTransport) {
      throw new Error('Send transport not found');
    }

    // Add simulcast configuration if not present
    if (kind === 'video' && !rtpParameters.encodings) {
      const config = appData?.source === 'screen' 
        ? this.simulcastConfigs.screen 
        : this.simulcastConfigs.webcam;
      
      rtpParameters.encodings = config.encodings;
    }

    const producer = await transports.sendTransport.produce({
      kind,
      rtpParameters,
      appData: {
        ...appData,
        participantId,
        source: appData?.source || 'webcam',
      },
    });

    transports.producers.set(producer.id, producer);

    // Add to audio level observer if audio producer
    if (kind === 'audio' && this.audioLevelObserver) {
      await this.audioLevelObserver.addProducer({ producerId: producer.id });
    }

    // Enable stats for this producer
    producer.enableTraceEvent(['rtp', 'pli', 'fir']);

    producer.on('score', (score) => {
      logger.debug(`Producer score changed`, {
        producerId: producer.id,
        score,
      });
      
      // Adapt encoding based on score
      this.adaptProducerBitrate(producer, score);
    });

    // Notify other participants
    this.emit('producer:new', {
      participantId,
      producerId: producer.id,
      kind,
      appData: producer.appData,
    });

    // Auto-create consumers for other participants
    await this.createConsumersForProducer(producer.id, participantId);

    return producer.id;
  }

  private async adaptProducerBitrate(producer: Producer, scores: any[]): Promise<void> {
    if (producer.kind !== 'video') return;

    const avgScore = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
    
    // If score is low, reduce bitrate
    if (avgScore < 5) {
      const currentParams = producer.rtpParameters;
      if (currentParams.encodings) {
        currentParams.encodings.forEach((encoding, idx) => {
          if (encoding.maxBitrate) {
            encoding.maxBitrate = Math.floor(encoding.maxBitrate * 0.7);
          }
        });
        
        await producer.setRtpEncodingParameters(currentParams);
        
        logger.info(`Reduced bitrate for producer due to low score`, {
          producerId: producer.id,
          avgScore,
        });
      }
    }
  }

  async consume(
    participantId: string,
    producerId: string,
    rtpCapabilities: RtpCapabilities
  ): Promise<any> {
    const transports = this.participantTransports.get(participantId);
    if (!transports || !transports.recvTransport) {
      throw new Error('Receive transport not found');
    }

    let producer: Producer | undefined;
    let producerParticipantId: string | undefined;
    
    // Find the producer
    for (const [pId, pTransports] of this.participantTransports) {
      producer = pTransports.producers.get(producerId);
      if (producer) {
        producerParticipantId = pId;
        break;
      }
    }

    if (!producer || !producerParticipantId) {
      throw new Error('Producer not found');
    }

    // Don't consume own producer
    if (producerParticipantId === participantId) {
      throw new Error('Cannot consume own producer');
    }

    if (!this.router.canConsume({ producerId, rtpCapabilities })) {
      throw new Error('Cannot consume producer');
    }

    const consumer = await transports.recvTransport.consume({
      producerId,
      rtpCapabilities,
      paused: false,
      // Start with lower spatial layer for bandwidth optimization
      preferredLayers: {
        spatialLayer: 1,
        temporalLayer: 2,
      },
    });

    transports.consumers.set(consumer.id, consumer);

    // Set up adaptive layer switching
    consumer.on('score', (score) => {
      this.adaptConsumerLayers(consumer, score);
    });

    consumer.on('layerschange', (layers: ConsumerLayers | undefined) => {
      logger.debug(`Consumer layers changed`, {
        consumerId: consumer.id,
        layers,
      });
    });

    return {
      id: consumer.id,
      producerId: producer.id,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
      appData: producer.appData,
    };
  }

  private async adaptConsumerLayers(
    consumer: Consumer, 
    score: { score: number; producerScore: number }
  ): Promise<void> {
    if (consumer.kind !== 'video') return;

    const currentLayers = consumer.preferredLayers;
    let newLayers: ConsumerLayers | undefined;

    // Adapt based on consumer score
    if (score.score < 5 && currentLayers) {
      // Reduce quality
      newLayers = {
        spatialLayer: Math.max(0, (currentLayers.spatialLayer || 2) - 1),
        temporalLayer: Math.max(0, (currentLayers.temporalLayer || 2) - 1),
      };
    } else if (score.score > 8 && currentLayers) {
      // Increase quality
      newLayers = {
        spatialLayer: Math.min(2, (currentLayers.spatialLayer || 0) + 1),
        temporalLayer: Math.min(2, (currentLayers.temporalLayer || 0) + 1),
      };
    }

    if (newLayers) {
      await consumer.setPreferredLayers(newLayers);
      logger.debug(`Adapted consumer layers`, {
        consumerId: consumer.id,
        score: score.score,
        newLayers,
      });
    }
  }

  async produceData(
    participantId: string,
    transportId: string,
    sctpStreamParameters?: mediasoup.types.SctpStreamParameters,
    label?: string,
    protocol?: string,
    appData?: any
  ): Promise<string> {
    const transports = this.participantTransports.get(participantId);
    if (!transports || !transports.sendTransport) {
      throw new Error('Send transport not found');
    }

    const dataProducer = await transports.sendTransport.produceData({
      sctpStreamParameters,
      label: label || 'chat',
      protocol: protocol || 'json',
      appData: {
        ...appData,
        participantId,
      },
    });

    transports.dataProducers.set(dataProducer.id, dataProducer);

    // Notify other participants
    this.emit('dataProducer:new', {
      participantId,
      dataProducerId: dataProducer.id,
      label: dataProducer.label,
      protocol: dataProducer.protocol,
    });

    // Auto-create data consumers for other participants
    await this.createDataConsumersForDataProducer(dataProducer.id, participantId);

    return dataProducer.id;
  }

  async consumeData(
    participantId: string,
    dataProducerId: string
  ): Promise<any> {
    const transports = this.participantTransports.get(participantId);
    if (!transports || !transports.recvTransport) {
      throw new Error('Receive transport not found');
    }

    let dataProducer: DataProducer | undefined;
    let producerParticipantId: string | undefined;
    
    // Find the data producer
    for (const [pId, pTransports] of this.participantTransports) {
      dataProducer = pTransports.dataProducers.get(dataProducerId);
      if (dataProducer) {
        producerParticipantId = pId;
        break;
      }
    }

    if (!dataProducer || !producerParticipantId) {
      throw new Error('DataProducer not found');
    }

    // Don't consume own data producer
    if (producerParticipantId === participantId) {
      throw new Error('Cannot consume own data producer');
    }

    const dataConsumer = await transports.recvTransport.consumeData({
      dataProducerId,
    });

    transports.dataConsumers.set(dataConsumer.id, dataConsumer);

    return {
      id: dataConsumer.id,
      dataProducerId: dataProducer.id,
      sctpStreamParameters: dataConsumer.sctpStreamParameters,
      label: dataConsumer.label,
      protocol: dataConsumer.protocol,
      appData: dataProducer.appData,
    };
  }

  private async createConsumersForProducer(
    producerId: string, 
    producerParticipantId: string
  ): Promise<void> {
    // Create consumers for all other participants
    for (const [participantId, participant] of this.participants) {
      if (participantId === producerParticipantId) continue;
      
      const mediasoupParticipant = participant as MediasoupParticipant;
      if (!mediasoupParticipant.rtpCapabilities) continue;

      try {
        const consumerData = await this.consume(
          participantId,
          producerId,
          mediasoupParticipant.rtpCapabilities
        );

        // Notify participant about new consumer
        this.emit('consumer:new', {
          participantId,
          consumerData,
        });
      } catch (error) {
        logger.error(`Failed to create consumer`, {
          participantId,
          producerId,
          error,
        });
      }
    }
  }

  private async createDataConsumersForDataProducer(
    dataProducerId: string,
    producerParticipantId: string
  ): Promise<void> {
    for (const [participantId] of this.participants) {
      if (participantId === producerParticipantId) continue;

      try {
        const dataConsumerData = await this.consumeData(
          participantId,
          dataProducerId
        );

        this.emit('dataConsumer:new', {
          participantId,
          dataConsumerData,
        });
      } catch (error) {
        logger.error(`Failed to create data consumer`, {
          participantId,
          dataProducerId,
          error,
        });
      }
    }
  }

  private async createDataConsumersForParticipant(participantId: string): Promise<void> {
    // Create data consumers for all existing data producers
    for (const [pId, transports] of this.participantTransports) {
      if (pId === participantId) continue;

      for (const [dataProducerId] of transports.dataProducers) {
        try {
          const dataConsumerData = await this.consumeData(
            participantId,
            dataProducerId
          );

          this.emit('dataConsumer:new', {
            participantId,
            dataConsumerData,
          });
        } catch (error) {
          logger.error(`Failed to create data consumer for participant`, {
            participantId,
            dataProducerId,
            error,
          });
        }
      }
    }
  }

  private startStatsCollection(): void {
    this.statsInterval = setInterval(async () => {
      for (const [participantId, transports] of this.participantTransports) {
        const stats: any = {
          bitrate: 0,
          packetLoss: 0,
          producers: [],
          consumers: [],
        };

        // Collect producer stats
        for (const [_, producer] of transports.producers) {
          const producerStats = await producer.getStats();
          stats.producers.push(producerStats);
        }

        // Collect consumer stats
        for (const [_, consumer] of transports.consumers) {
          const consumerStats = await consumer.getStats();
          stats.consumers.push(consumerStats);
        }

        // Update participant stats
        const participant = this.participants.get(participantId) as MediasoupParticipant;
        if (participant) {
          participant.stats = this.calculateAggregateStats(stats);
        }
      }
    }, 5000); // Every 5 seconds
  }

  private calculateAggregateStats(stats: any): any {
    let totalBitrate = 0;
    let totalPackets = 0;
    let totalPacketLoss = 0;

    // Process producer stats
    for (const producerStats of stats.producers) {
      for (const stat of producerStats) {
        if (stat.type === 'outbound-rtp') {
          totalBitrate += stat.bitrate || 0;
          totalPackets += stat.packetCount || 0;
          totalPacketLoss += stat.packetsLost || 0;
        }
      }
    }

    // Process consumer stats
    for (const consumerStats of stats.consumers) {
      for (const stat of consumerStats) {
        if (stat.type === 'inbound-rtp') {
          totalBitrate += stat.bitrate || 0;
          totalPackets += stat.packetCount || 0;
          totalPacketLoss += stat.packetsLost || 0;
        }
      }
    }

    return {
      bitrate: totalBitrate,
      packetLoss: totalPackets > 0 ? (totalPacketLoss / totalPackets) * 100 : 0,
      jitter: 0, // TODO: Calculate jitter from stats
    };
  }

  async enableRecording(): Promise<void> {
    if (this.recordingEnabled) return;

    // Create plain transport for recording
    this.plainTransport = await this.router.createPlainTransport({
      listenInfo: {
        protocol: 'udp',
        ip: '127.0.0.1',
      },
      rtcpMux: false,
      comedia: true,
    });

    this.recordingEnabled = true;
    
    logger.info(`Recording enabled for meeting ${this.id}`);
  }

  async removeParticipant(participantId: string): Promise<void> {
    const participant = this.participants.get(participantId);
    if (!participant) return;

    // Clean up transports and producers/consumers
    const transports = this.participantTransports.get(participantId);
    if (transports) {
      // Remove audio producer from observer
      if (this.audioLevelObserver) {
        for (const [_, producer] of transports.producers) {
          if (producer.kind === 'audio') {
            await this.audioLevelObserver.removeProducer({ 
              producerId: producer.id 
            });
          }
        }
      }

      // Close all data consumers
      for (const [_, dataConsumer] of transports.dataConsumers) {
        dataConsumer.close();
      }

      // Close all data producers
      for (const [_, dataProducer] of transports.dataProducers) {
        dataProducer.close();
      }

      // Close all consumers
      for (const [_, consumer] of transports.consumers) {
        consumer.close();
      }

      // Close all producers
      for (const [_, producer] of transports.producers) {
        producer.close();
      }

      // Close transports
      if (transports.sendTransport) {
        transports.sendTransport.close();
      }
      if (transports.recvTransport) {
        transports.recvTransport.close();
      }

      this.participantTransports.delete(participantId);
    }

    this.participants.delete(participantId);
    
    // Update active speakers if needed
    this.activeSpeakerIds = this.activeSpeakerIds.filter(id => id !== participantId);

    this.emit('participant:left', participant);
    
    logger.info(`Participant left MediasoupRoom`, {
      meetingId: this.id,
      participantId,
      remainingParticipants: this.participants.size,
    });
  }

  async setParticipantRtpCapabilities(
    participantId: string, 
    rtpCapabilities: RtpCapabilities
  ): Promise<void> {
    const participant = this.participants.get(participantId) as MediasoupParticipant;
    if (participant) {
      participant.rtpCapabilities = rtpCapabilities;
    }
  }

  async close(): Promise<void> {
    // Stop intervals
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
    }
    if (this.bandwidthThrottleTimer) {
      clearInterval(this.bandwidthThrottleTimer);
    }

    // Close audio level observer
    if (this.audioLevelObserver) {
      this.audioLevelObserver.close();
    }

    // Close plain transport
    if (this.plainTransport) {
      this.plainTransport.close();
    }

    // Close all transports
    for (const [_, transports] of this.participantTransports) {
      for (const [_, dataConsumer] of transports.dataConsumers) {
        dataConsumer.close();
      }
      for (const [_, dataProducer] of transports.dataProducers) {
        dataProducer.close();
      }
      for (const [_, consumer] of transports.consumers) {
        consumer.close();
      }
      for (const [_, producer] of transports.producers) {
        producer.close();
      }
      if (transports.sendTransport) {
        transports.sendTransport.close();
      }
      if (transports.recvTransport) {
        transports.recvTransport.close();
      }
    }

    this.participantTransports.clear();
    this.participants.clear();
    
    // Router will be cleaned up by worker management
    
    this.emit('meeting:closed');
    logger.info(`MediasoupRoom ${this.id} closed`);
  }

  getConnectionInfo(): any {
    return {
      mode: 'sfu',
      routerId: this.router.id,
      capabilities: this.router.rtpCapabilities,
    };
  }

  getActiveSpeakers(): string[] {
    return [...this.activeSpeakerIds];
  }

  async pauseConsumer(participantId: string, consumerId: string): Promise<void> {
    const transports = this.participantTransports.get(participantId);
    if (!transports) throw new Error('Participant transports not found');

    const consumer = transports.consumers.get(consumerId);
    if (!consumer) throw new Error('Consumer not found');

    await consumer.pause();
  }

  async resumeConsumer(participantId: string, consumerId: string): Promise<void> {
    const transports = this.participantTransports.get(participantId);
    if (!transports) throw new Error('Participant transports not found');

    const consumer = transports.consumers.get(consumerId);
    if (!consumer) throw new Error('Consumer not found');

    await consumer.resume();
  }

  async setConsumerPreferredLayers(
    participantId: string, 
    consumerId: string,
    layers: ConsumerLayers
  ): Promise<void> {
    const transports = this.participantTransports.get(participantId);
    if (!transports) throw new Error('Participant transports not found');

    const consumer = transports.consumers.get(consumerId);
    if (!consumer) throw new Error('Consumer not found');

    await consumer.setPreferredLayers(layers);
  }

  async setConsumerPriority(
    participantId: string,
    consumerId: string,
    priority: number
  ): Promise<void> {
    const transports = this.participantTransports.get(participantId);
    if (!transports) throw new Error('Participant transports not found');

    const consumer = transports.consumers.get(consumerId);
    if (!consumer) throw new Error('Consumer not found');

    await consumer.setPriority(priority);
  }

  async restartIce(participantId: string, transportId: string): Promise<any> {
    const transports = this.participantTransports.get(participantId);
    if (!transports) throw new Error('Participant transports not found');

    const transport = transports.sendTransport?.id === transportId
      ? transports.sendTransport
      : transports.recvTransport;

    if (!transport) throw new Error('Transport not found');

    const iceParameters = await transport.restartIce();
    return { iceParameters };
  }
}