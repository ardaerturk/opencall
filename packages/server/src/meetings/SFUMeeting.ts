import { Meeting, Participant } from './Meeting';
import { MeetingId, MeetingOptions } from '@dmp/core';
import * as mediasoup from 'mediasoup';
import { Worker, Router, Transport, Producer, Consumer } from 'mediasoup/node/lib/types';
import { logger } from '../utils/logger';

interface SFUConnectionInfo {
  mode: 'sfu';
  routerId: string;
  capabilities: mediasoup.types.RtpCapabilities;
  transportOptions: {
    id: string;
    iceParameters: mediasoup.types.IceParameters;
    iceCandidates: mediasoup.types.IceCandidate[];
    dtlsParameters: mediasoup.types.DtlsParameters;
  };
}

interface ParticipantTransports {
  sendTransport?: Transport;
  recvTransport?: Transport;
  producers: Map<string, Producer>;
  consumers: Map<string, Consumer>;
}

export class SFUMeeting extends Meeting {
  private router: Router;
  private participantTransports = new Map<string, ParticipantTransports>();

  constructor(
    id: MeetingId,
    options: MeetingOptions,
    hostId: string,
    private worker: Worker
  ) {
    super(id, options, hostId);
    this.initializeSFU();
  }

  private async initializeSFU(): Promise<void> {
    try {
      this.router = await this.worker.createRouter({
        mediaCodecs: [
          {
            kind: 'audio',
            mimeType: 'audio/opus',
            clockRate: 48000,
            channels: 2,
          },
          {
            kind: 'video',
            mimeType: 'video/VP8',
            clockRate: 90000,
            parameters: {
              'x-google-start-bitrate': 1000,
            },
          },
          {
            kind: 'video',
            mimeType: 'video/VP9',
            clockRate: 90000,
            parameters: {
              'profile-id': 2,
              'x-google-start-bitrate': 1000,
            },
          },
        ],
      });

      logger.info(`SFU router created for meeting ${this.id}`, {
        routerId: this.router.id,
      });
    } catch (error) {
      logger.error(`Failed to initialize SFU for meeting ${this.id}`, error);
      throw error;
    }
  }

  async addParticipant(participant: Participant): Promise<void> {
    this.participants.set(participant.id, participant);
    
    // Initialize transport structure for participant
    this.participantTransports.set(participant.id, {
      producers: new Map(),
      consumers: new Map(),
    });

    this.emit('participant:joined', participant);
    
    logger.info(`Participant joined SFU meeting ${this.id}`, {
      participantId: participant.id,
      totalParticipants: this.participants.size,
    });
  }

  async removeParticipant(participantId: string): Promise<void> {
    const participant = this.participants.get(participantId);
    if (!participant) return;

    // Clean up transports and producers/consumers
    const transports = this.participantTransports.get(participantId);
    if (transports) {
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
    this.emit('participant:left', participant);
    
    logger.info(`Participant left SFU meeting ${this.id}`, {
      participantId,
      remainingParticipants: this.participants.size,
    });
  }

  async createWebRtcTransport(participantId: string, direction: 'send' | 'recv'): Promise<SFUConnectionInfo['transportOptions']> {
    const transport = await this.router.createWebRtcTransport({
      listenIps: [
        {
          ip: process.env.MEDIASOUP_LISTEN_IP || '0.0.0.0',
          announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || undefined,
        },
      ],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      initialAvailableOutgoingBitrate: 1000000,
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

    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    };
  }

  async connectTransport(
    participantId: string,
    transportId: string,
    dtlsParameters: mediasoup.types.DtlsParameters
  ): Promise<void> {
    const transports = this.participantTransports.get(participantId);
    if (!transports) {
      throw new Error('Participant transports not found');
    }

    const transport = transports.sendTransport?.id === transportId
      ? transports.sendTransport
      : transports.recvTransport;

    if (!transport) {
      throw new Error('Transport not found');
    }

    await transport.connect({ dtlsParameters });
  }

  async produce(
    participantId: string,
    transportId: string,
    kind: mediasoup.types.MediaKind,
    rtpParameters: mediasoup.types.RtpParameters,
    appData?: any
  ): Promise<string> {
    const transports = this.participantTransports.get(participantId);
    if (!transports || !transports.sendTransport) {
      throw new Error('Send transport not found');
    }

    const producer = await transports.sendTransport.produce({
      kind,
      rtpParameters,
      appData: {
        ...appData,
        participantId,
      },
    });

    transports.producers.set(producer.id, producer);

    // Notify other participants about new producer
    this.emit('producer:new', {
      participantId,
      producerId: producer.id,
      kind,
    });

    return producer.id;
  }

  async consume(
    participantId: string,
    producerId: string,
    rtpCapabilities: mediasoup.types.RtpCapabilities
  ): Promise<any> {
    const transports = this.participantTransports.get(participantId);
    if (!transports || !transports.recvTransport) {
      throw new Error('Receive transport not found');
    }

    // Find the producer
    let producer: Producer | undefined;
    for (const [_, pTransports] of this.participantTransports) {
      producer = pTransports.producers.get(producerId);
      if (producer) break;
    }

    if (!producer) {
      throw new Error('Producer not found');
    }

    if (!this.router.canConsume({ producerId, rtpCapabilities })) {
      throw new Error('Cannot consume producer');
    }

    const consumer = await transports.recvTransport.consume({
      producerId,
      rtpCapabilities,
      paused: false,
    });

    transports.consumers.set(consumer.id, consumer);

    return {
      id: consumer.id,
      producerId: producer.id,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
    };
  }

  async close(): Promise<void> {
    // Close all transports
    for (const [_, transports] of this.participantTransports) {
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
    logger.info(`SFU meeting ${this.id} closed`);
  }

  getConnectionInfo(): SFUConnectionInfo {
    return {
      mode: 'sfu',
      routerId: this.router.id,
      capabilities: this.router.rtpCapabilities,
      transportOptions: {
        id: '',
        iceParameters: {} as any,
        iceCandidates: [],
        dtlsParameters: {} as any,
      },
    };
  }
}