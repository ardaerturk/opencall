import * as mediasoup from 'mediasoup-client';
import { 
  Device, 
  Transport, 
  Producer, 
  Consumer, 
  DataProducer,
  DataConsumer 
} from 'mediasoup-client/lib/types';
import { EventEmitter } from 'events';

interface MediasoupConfig {
  routerRtpCapabilities: mediasoup.types.RtpCapabilities;
  transportOptions: {
    id: string;
    iceParameters: mediasoup.types.IceParameters;
    iceCandidates: mediasoup.types.IceCandidate[];
    dtlsParameters: mediasoup.types.DtlsParameters;
    sctpParameters?: mediasoup.types.SctpParameters;
  };
}

interface ProducerOptions {
  track?: MediaStreamTrack;
  encodings?: RTCRtpEncodingParameters[];
  codecOptions?: mediasoup.types.ProducerCodecOptions;
  codec?: mediasoup.types.RtpCodecCapability;
  stopTracks?: boolean;
  disableTrackOnPause?: boolean;
  zeroRtpOnPause?: boolean;
  appData?: any;
}

interface ConsumerData {
  id: string;
  producerId: string;
  kind: 'audio' | 'video';
  rtpParameters: mediasoup.types.RtpParameters;
  appData?: any;
}

interface DataProducerOptions {
  ordered?: boolean;
  maxPacketLifeTime?: number;
  maxRetransmits?: number;
  label?: string;
  protocol?: string;
  appData?: any;
}

interface DataConsumerData {
  id: string;
  dataProducerId: string;
  sctpStreamParameters: mediasoup.types.SctpStreamParameters;
  label?: string;
  protocol?: string;
  appData?: any;
}

export class MediasoupService extends EventEmitter {
  private device?: Device;
  private sendTransport?: Transport;
  private recvTransport?: Transport;
  private producers = new Map<string, Producer>();
  private consumers = new Map<string, Consumer>();
  private dataProducers = new Map<string, DataProducer>();
  private dataConsumers = new Map<string, DataConsumer>();
  private localStream?: MediaStream;

  constructor() {
    super();
  }

  async initialize(routerRtpCapabilities: mediasoup.types.RtpCapabilities): Promise<void> {
    // Create Device
    this.device = new Device();

    // Load Router RTP capabilities
    await this.device.load({ routerRtpCapabilities });

    console.log('MediasoupService initialized', {
      canProduce: {
        audio: this.device.canProduce('audio'),
        video: this.device.canProduce('video'),
      },
    });
  }

  getRtpCapabilities(): mediasoup.types.RtpCapabilities | undefined {
    return this.device?.rtpCapabilities;
  }

  async createSendTransport(
    transportOptions: MediasoupConfig['transportOptions'],
    onConnect: (params: { dtlsParameters: mediasoup.types.DtlsParameters }) => Promise<void>,
    onProduce: (params: {
      kind: mediasoup.types.MediaKind;
      rtpParameters: mediasoup.types.RtpParameters;
      appData: any;
    }) => Promise<string>,
    onProduceData: (params: {
      sctpStreamParameters: mediasoup.types.SctpStreamParameters;
      label?: string;
      protocol?: string;
      appData: any;
    }) => Promise<string>
  ): Promise<void> {
    if (!this.device) throw new Error('Device not initialized');

    this.sendTransport = this.device.createSendTransport({
      id: transportOptions.id,
      iceParameters: transportOptions.iceParameters,
      iceCandidates: transportOptions.iceCandidates,
      dtlsParameters: transportOptions.dtlsParameters,
      sctpParameters: transportOptions.sctpParameters,
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
      ],
      proprietaryConstraints: {
        optional: [{ googDscp: true }]
      }
    });

    this.sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        await onConnect({ dtlsParameters });
        callback();
      } catch (error) {
        errback(error as Error);
      }
    });

    this.sendTransport.on('produce', async (parameters, callback, errback) => {
      try {
        const producerId = await onProduce({
          kind: parameters.kind,
          rtpParameters: parameters.rtpParameters,
          appData: parameters.appData
        });
        callback({ id: producerId });
      } catch (error) {
        errback(error as Error);
      }
    });

    this.sendTransport.on('producedata', async (parameters, callback, errback) => {
      try {
        const dataProducerId = await onProduceData({
          sctpStreamParameters: parameters.sctpStreamParameters,
          label: parameters.label,
          protocol: parameters.protocol,
          appData: parameters.appData
        });
        callback({ id: dataProducerId });
      } catch (error) {
        errback(error as Error);
      }
    });

    this.sendTransport.on('connectionstatechange', (state) => {
      console.log(`Send transport connection state changed to ${state}`);
      this.emit('sendTransport:connectionstatechange', state);
      
      if (state === 'failed') {
        this.emit('transport:failed', 'send');
      }
    });
  }

  async createRecvTransport(
    transportOptions: MediasoupConfig['transportOptions'],
    onConnect: (params: { dtlsParameters: mediasoup.types.DtlsParameters }) => Promise<void>
  ): Promise<void> {
    if (!this.device) throw new Error('Device not initialized');

    this.recvTransport = this.device.createRecvTransport({
      id: transportOptions.id,
      iceParameters: transportOptions.iceParameters,
      iceCandidates: transportOptions.iceCandidates,
      dtlsParameters: transportOptions.dtlsParameters,
      sctpParameters: transportOptions.sctpParameters,
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
      ]
    });

    this.recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        await onConnect({ dtlsParameters });
        callback();
      } catch (error) {
        errback(error as Error);
      }
    });

    this.recvTransport.on('connectionstatechange', (state) => {
      console.log(`Recv transport connection state changed to ${state}`);
      this.emit('recvTransport:connectionstatechange', state);
      
      if (state === 'failed') {
        this.emit('transport:failed', 'recv');
      }
    });
  }

  async produce(
    track: MediaStreamTrack,
    options?: Partial<ProducerOptions>
  ): Promise<Producer> {
    if (!this.sendTransport) throw new Error('Send transport not created');
    if (!this.device?.canProduce(track.kind as mediasoup.types.MediaKind)) {
      throw new Error(`Cannot produce ${track.kind}`);
    }

    // Configure simulcast for video
    let encodings: RTCRtpEncodingParameters[] | undefined;
    if (track.kind === 'video' && !options?.encodings) {
      const isScreenShare = options?.appData?.source === 'screen';
      
      if (isScreenShare) {
        encodings = [
          { maxBitrate: 1_500_000, maxFramerate: 30 }
        ];
      } else {
        encodings = [
          { rid: 'r0', maxBitrate: 100_000, scaleResolutionDownBy: 4 },
          { rid: 'r1', maxBitrate: 300_000, scaleResolutionDownBy: 2 },
          { rid: 'r2', maxBitrate: 900_000, scaleResolutionDownBy: 1 }
        ];
      }
    }

    const producer = await this.sendTransport.produce({
      track,
      encodings: encodings || options?.encodings,
      codecOptions: options?.codecOptions || {
        opusStereo: true,
        opusFec: true,
        opusDtx: true,
        opusMaxPlaybackRate: 48000,
        opusMaxAverageBitrate: 128000,
        opusPtime: 20,
        videoGoogleStartBitrate: 1000,
        videoGoogleMaxBitrate: options?.appData?.source === 'screen' ? 2000 : 1000,
        videoGoogleMinBitrate: 100,
      },
      codec: options?.codec,
      stopTracks: options?.stopTracks ?? true,
      disableTrackOnPause: options?.disableTrackOnPause ?? true,
      zeroRtpOnPause: options?.zeroRtpOnPause ?? false,
      appData: options?.appData || {},
    });

    this.producers.set(producer.id, producer);

    producer.on('transportclose', () => {
      console.log('Producer transport closed', producer.id);
      this.producers.delete(producer.id);
    });

    producer.on('trackended', () => {
      console.log('Producer track ended', producer.id);
      this.emit('producer:trackended', producer.id);
    });

    producer.observer.on('close', () => {
      this.producers.delete(producer.id);
    });

    return producer;
  }

  async consume(consumerData: ConsumerData): Promise<Consumer> {
    if (!this.recvTransport) throw new Error('Recv transport not created');

    const consumer = await this.recvTransport.consume({
      id: consumerData.id,
      producerId: consumerData.producerId,
      kind: consumerData.kind,
      rtpParameters: consumerData.rtpParameters,
      appData: consumerData.appData || {},
    });

    this.consumers.set(consumer.id, consumer);

    consumer.on('transportclose', () => {
      console.log('Consumer transport closed', consumer.id);
      this.consumers.delete(consumer.id);
    });

    consumer.observer.on('close', () => {
      this.consumers.delete(consumer.id);
    });

    // Resume consumer (it starts paused)
    await consumer.resume();

    return consumer;
  }

  async produceData(options?: DataProducerOptions): Promise<DataProducer> {
    if (!this.sendTransport) throw new Error('Send transport not created');

    const dataProducer = await this.sendTransport.produceData({
      ordered: options?.ordered ?? true,
      maxPacketLifeTime: options?.maxPacketLifeTime,
      maxRetransmits: options?.maxRetransmits,
      label: options?.label || 'chat',
      protocol: options?.protocol || 'json',
      appData: options?.appData || {},
    });

    this.dataProducers.set(dataProducer.id, dataProducer);

    dataProducer.on('transportclose', () => {
      console.log('DataProducer transport closed', dataProducer.id);
      this.dataProducers.delete(dataProducer.id);
    });

    dataProducer.observer.on('close', () => {
      this.dataProducers.delete(dataProducer.id);
    });

    return dataProducer;
  }

  async consumeData(dataConsumerData: DataConsumerData): Promise<DataConsumer> {
    if (!this.recvTransport) throw new Error('Recv transport not created');

    const dataConsumer = await this.recvTransport.consumeData({
      id: dataConsumerData.id,
      dataProducerId: dataConsumerData.dataProducerId,
      sctpStreamParameters: dataConsumerData.sctpStreamParameters,
      label: dataConsumerData.label,
      protocol: dataConsumerData.protocol,
      appData: dataConsumerData.appData || {},
    });

    this.dataConsumers.set(dataConsumer.id, dataConsumer);

    dataConsumer.on('transportclose', () => {
      console.log('DataConsumer transport closed', dataConsumer.id);
      this.dataConsumers.delete(dataConsumer.id);
    });

    dataConsumer.on('message', (message) => {
      this.emit('dataConsumer:message', {
        dataConsumerId: dataConsumer.id,
        message,
        appData: dataConsumer.appData,
      });
    });

    dataConsumer.observer.on('close', () => {
      this.dataConsumers.delete(dataConsumer.id);
    });

    return dataConsumer;
  }

  async setLocalStream(stream: MediaStream): Promise<void> {
    this.localStream = stream;

    // Produce audio track if available
    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      await this.produce(audioTrack, {
        appData: { source: 'microphone' }
      });
    }

    // Produce video track if available
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      await this.produce(videoTrack, {
        appData: { source: 'webcam' }
      });
    }
  }

  async shareScreen(): Promise<Producer | null> {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 }
        },
        audio: false
      });

      const track = stream.getVideoTracks()[0];
      if (!track) return null;

      const producer = await this.produce(track, {
        appData: { source: 'screen' }
      });

      track.onended = () => {
        producer.close();
        this.emit('screenShare:ended');
      };

      return producer;
    } catch (error) {
      console.error('Failed to share screen:', error);
      throw error;
    }
  }

  async pauseProducer(producerId: string): Promise<void> {
    const producer = this.producers.get(producerId);
    if (!producer) throw new Error('Producer not found');
    await producer.pause();
  }

  async resumeProducer(producerId: string): Promise<void> {
    const producer = this.producers.get(producerId);
    if (!producer) throw new Error('Producer not found');
    await producer.resume();
  }

  async pauseConsumer(consumerId: string): Promise<void> {
    const consumer = this.consumers.get(consumerId);
    if (!consumer) throw new Error('Consumer not found');
    await consumer.pause();
  }

  async resumeConsumer(consumerId: string): Promise<void> {
    const consumer = this.consumers.get(consumerId);
    if (!consumer) throw new Error('Consumer not found');
    await consumer.resume();
  }

  async setConsumerPreferredLayers(
    consumerId: string,
    layers: { spatialLayer: number; temporalLayer?: number }
  ): Promise<void> {
    const consumer = this.consumers.get(consumerId);
    if (!consumer) throw new Error('Consumer not found');
    if (consumer.kind !== 'video') throw new Error('Consumer is not video');
    
    await consumer.setPreferredLayers(layers);
  }

  async setConsumerPriority(consumerId: string, priority: number): Promise<void> {
    const consumer = this.consumers.get(consumerId);
    if (!consumer) throw new Error('Consumer not found');
    await consumer.setPriority(priority);
  }

  getProducer(producerId: string): Producer | undefined {
    return this.producers.get(producerId);
  }

  getConsumer(consumerId: string): Consumer | undefined {
    return this.consumers.get(consumerId);
  }

  getDataProducer(dataProducerId: string): DataProducer | undefined {
    return this.dataProducers.get(dataProducerId);
  }

  getDataConsumer(dataConsumerId: string): DataConsumer | undefined {
    return this.dataConsumers.get(dataConsumerId);
  }

  getAllProducers(): Producer[] {
    return Array.from(this.producers.values());
  }

  getAllConsumers(): Consumer[] {
    return Array.from(this.consumers.values());
  }

  async getStats(): Promise<{
    producers: Array<{ id: string; stats: RTCStatsReport }>;
    consumers: Array<{ id: string; stats: RTCStatsReport }>;
  }> {
    const producerStats = await Promise.all(
      Array.from(this.producers.entries()).map(async ([id, producer]) => ({
        id,
        stats: await producer.getStats()
      }))
    );

    const consumerStats = await Promise.all(
      Array.from(this.consumers.entries()).map(async ([id, consumer]) => ({
        id,
        stats: await consumer.getStats()
      }))
    );

    return { producers: producerStats, consumers: consumerStats };
  }

  async restartIce(transportType: 'send' | 'recv'): Promise<mediasoup.types.IceParameters | undefined> {
    const transport = transportType === 'send' ? this.sendTransport : this.recvTransport;
    if (!transport) throw new Error(`${transportType} transport not found`);
    
    const iceParameters = await transport.restartIce();
    return iceParameters;
  }

  close(): void {
    // Close all data consumers
    this.dataConsumers.forEach(dataConsumer => dataConsumer.close());
    this.dataConsumers.clear();

    // Close all data producers
    this.dataProducers.forEach(dataProducer => dataProducer.close());
    this.dataProducers.clear();

    // Close all consumers
    this.consumers.forEach(consumer => consumer.close());
    this.consumers.clear();

    // Close all producers
    this.producers.forEach(producer => producer.close());
    this.producers.clear();

    // Close transports
    this.sendTransport?.close();
    this.recvTransport?.close();

    this.device = undefined;
    this.sendTransport = undefined;
    this.recvTransport = undefined;
    this.localStream = undefined;

    console.log('MediasoupService closed');
  }
}