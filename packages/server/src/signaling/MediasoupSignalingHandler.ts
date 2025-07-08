import { WebSocket } from 'ws';
import { logger } from '../utils/logger';
import { RoomManager } from './RoomManager';
import { MediasoupRoom } from '../meetings/MediasoupRoom';
import { MediasoupManager } from '../mediasoup/MediasoupManager';
import { ConnectionManager } from '../connection/ConnectionManager';
import * as mediasoup from 'mediasoup';

interface MediasoupMessage {
  type: string;
  id?: string;
  data?: any;
}

interface SocketInfo {
  socket: WebSocket;
  meetingId?: string;
  participantId?: string;
}

export class MediasoupSignalingHandler {
  private sockets = new Map<WebSocket, SocketInfo>();

  constructor(
    private connectionManager: ConnectionManager
  ) {}

  public handleConnection(socket: WebSocket): void {
    const socketInfo: SocketInfo = { socket };
    this.sockets.set(socket, socketInfo);

    socket.on('message', async (data: Buffer | ArrayBuffer | Buffer[]) => {
      try {
        const message = JSON.parse(data.toString()) as MediasoupMessage;
        await this.handleMessage(socket, message);
      } catch (error) {
        logger.error('Error handling mediasoup message', error);
        this.sendError(socket, 'Invalid message format');
      }
    });

    socket.on('close', () => {
      this.handleDisconnect(socket);
    });

    socket.on('error', (error) => {
      logger.error('MediaSoup WebSocket error', error);
    });
  }

  private async handleMessage(socket: WebSocket, message: MediasoupMessage): Promise<void> {
    const { type, id, data } = message;
    const socketInfo = this.sockets.get(socket);
    if (!socketInfo) return;

    try {
      let response: any;

      switch (type) {
        case 'mediasoup:getRouterCapabilities':
          response = await this.handleGetRouterCapabilities(data, socketInfo);
          break;
        case 'mediasoup:setRtpCapabilities':
          await this.handleSetRtpCapabilities(data, socketInfo);
          break;
        case 'mediasoup:createTransport':
          response = await this.handleCreateTransport(data, socketInfo);
          break;
        case 'mediasoup:connectTransport':
          await this.handleConnectTransport(data, socketInfo);
          break;
        case 'mediasoup:produce':
          response = await this.handleProduce(data, socketInfo);
          break;
        case 'mediasoup:produceData':
          response = await this.handleProduceData(data, socketInfo);
          break;
        case 'mediasoup:consume':
          response = await this.handleConsume(data, socketInfo);
          break;
        case 'mediasoup:consumeData':
          response = await this.handleConsumeData(data, socketInfo);
          break;
        case 'mediasoup:pauseProducer':
          await this.handlePauseProducer(data, socketInfo);
          break;
        case 'mediasoup:resumeProducer':
          await this.handleResumeProducer(data, socketInfo);
          break;
        case 'mediasoup:pauseConsumer':
          await this.handlePauseConsumer(data, socketInfo);
          break;
        case 'mediasoup:resumeConsumer':
          await this.handleResumeConsumer(data, socketInfo);
          break;
        case 'mediasoup:setConsumerPreferredLayers':
          await this.handleSetConsumerPreferredLayers(data, socketInfo);
          break;
        case 'mediasoup:setConsumerPriority':
          await this.handleSetConsumerPriority(data, socketInfo);
          break;
        case 'mediasoup:restartIce':
          response = await this.handleRestartIce(data, socketInfo);
          break;
        case 'mediasoup:getStats':
          response = await this.handleGetStats(data, socketInfo);
          break;
        default:
          this.sendError(socket, `Unknown message type: ${type}`);
          return;
      }

      // Send response if message had an ID
      if (id) {
        this.sendMessage(socket, {
          type: 'response',
          id,
          data: response,
        });
      }
    } catch (error) {
      logger.error(`Error handling ${type}`, error);
      if (id) {
        this.sendMessage(socket, {
          type: 'error',
          id,
          error: error.message,
        });
      }
    }
  }

  private async handleGetRouterCapabilities(data: any, socketInfo: SocketInfo): Promise<any> {
    const { meetingId } = data;
    socketInfo.meetingId = meetingId;
    
    const meeting = this.connectionManager.getMeeting(meetingId);
    if (!meeting || !(meeting instanceof MediasoupRoom)) {
      throw new Error('Meeting not found or not a MediasoupRoom');
    }

    const connectionInfo = meeting.getConnectionInfo();
    return connectionInfo.capabilities;
  }

  private async handleSetRtpCapabilities(data: any, socketInfo: SocketInfo): Promise<void> {
    const { meetingId, participantId, rtpCapabilities } = data;
    socketInfo.participantId = participantId;
    
    const meeting = this.connectionManager.getMeeting(meetingId);
    if (!meeting || !(meeting instanceof MediasoupRoom)) {
      throw new Error('Meeting not found or not a MediasoupRoom');
    }

    await meeting.setParticipantRtpCapabilities(participantId, rtpCapabilities);
  }

  private async handleCreateTransport(data: any, socketInfo: SocketInfo): Promise<any> {
    const { meetingId, participantId, direction } = data;
    const meeting = this.connectionManager.getMeeting(meetingId);
    
    if (!meeting || !(meeting instanceof MediasoupRoom)) {
      throw new Error('Meeting not found or not a MediasoupRoom');
    }

    const transportOptions = await meeting.createWebRtcTransport(
      participantId,
      direction
    );
    
    return transportOptions;
  }

  private async handleConnectTransport(data: any, socketInfo: SocketInfo): Promise<void> {
    const { meetingId, participantId, transportId, dtlsParameters } = data;
    const meeting = this.connectionManager.getMeeting(meetingId);
    
    if (!meeting || !(meeting instanceof MediasoupRoom)) {
      throw new Error('Meeting not found or not a MediasoupRoom');
    }

    await meeting.connectTransport(participantId, transportId, dtlsParameters);
  }

  private async handleProduce(data: any, socketInfo: SocketInfo): Promise<any> {
    const { meetingId, participantId, transportId, kind, rtpParameters, appData } = data;
    const meeting = this.connectionManager.getMeeting(meetingId);
    
    if (!meeting || !(meeting instanceof MediasoupRoom)) {
      throw new Error('Meeting not found or not a MediasoupRoom');
    }

    const producerId = await meeting.produce(
      participantId,
      transportId,
      kind,
      rtpParameters,
      appData
    );

    // Notify other participants
    this.broadcastToMeeting(meetingId, {
      type: 'mediasoup:newProducer',
      data: {
        participantId,
        producerId,
        kind,
        appData,
      },
    }, socketInfo.socket);

    return { producerId };
  }

  private async handleProduceData(data: any, socketInfo: SocketInfo): Promise<any> {
    const { 
      meetingId, 
      participantId, 
      transportId, 
      sctpStreamParameters,
      label,
      protocol,
      appData 
    } = data;
    
    const meeting = this.connectionManager.getMeeting(meetingId);
    
    if (!meeting || !(meeting instanceof MediasoupRoom)) {
      throw new Error('Meeting not found or not a MediasoupRoom');
    }

    const dataProducerId = await meeting.produceData(
      participantId,
      transportId,
      sctpStreamParameters,
      label,
      protocol,
      appData
    );

    // Notify other participants
    this.broadcastToMeeting(meetingId, {
      type: 'mediasoup:newDataProducer',
      data: {
        participantId,
        dataProducerId,
        label,
        protocol,
      },
    }, socketInfo.socket);

    return { dataProducerId };
  }

  private async handleConsume(data: any, socketInfo: SocketInfo): Promise<any> {
    const { meetingId, participantId, producerId, rtpCapabilities } = data;
    const meeting = this.connectionManager.getMeeting(meetingId);
    
    if (!meeting || !(meeting instanceof MediasoupRoom)) {
      throw new Error('Meeting not found or not a MediasoupRoom');
    }

    const consumerData = await meeting.consume(
      participantId,
      producerId,
      rtpCapabilities
    );

    // Notify participant about new consumer
    this.sendMessage(socketInfo.socket, {
      type: 'mediasoup:newConsumer',
      data: {
        participantId,
        consumerData,
      },
    });

    return consumerData;
  }

  private async handleConsumeData(data: any, socketInfo: SocketInfo): Promise<any> {
    const { meetingId, participantId, dataProducerId } = data;
    const meeting = this.connectionManager.getMeeting(meetingId);
    
    if (!meeting || !(meeting instanceof MediasoupRoom)) {
      throw new Error('Meeting not found or not a MediasoupRoom');
    }

    const dataConsumerData = await meeting.consumeData(
      participantId,
      dataProducerId
    );

    // Notify participant about new data consumer
    this.sendMessage(socketInfo.socket, {
      type: 'mediasoup:newDataConsumer',
      data: {
        participantId,
        dataConsumerData,
      },
    });

    return dataConsumerData;
  }

  private async handlePauseProducer(data: any, socketInfo: SocketInfo): Promise<void> {
    const { meetingId, producerId } = data;
    // Implementation would go through meeting to pause producer
    // TODO: Implement pause producer in MediasoupRoom
  }

  private async handleResumeProducer(data: any, socketInfo: SocketInfo): Promise<void> {
    const { meetingId, producerId } = data;
    // Implementation would go through meeting to resume producer
    // TODO: Implement resume producer in MediasoupRoom
  }

  private async handlePauseConsumer(data: any, socketInfo: SocketInfo): Promise<void> {
    const { meetingId, participantId, consumerId } = data;
    const meeting = this.connectionManager.getMeeting(meetingId);
    
    if (!meeting || !(meeting instanceof MediasoupRoom)) {
      throw new Error('Meeting not found or not a MediasoupRoom');
    }

    await meeting.pauseConsumer(participantId, consumerId);
  }

  private async handleResumeConsumer(data: any, socketInfo: SocketInfo): Promise<void> {
    const { meetingId, participantId, consumerId } = data;
    const meeting = this.connectionManager.getMeeting(meetingId);
    
    if (!meeting || !(meeting instanceof MediasoupRoom)) {
      throw new Error('Meeting not found or not a MediasoupRoom');
    }

    await meeting.resumeConsumer(participantId, consumerId);
  }

  private async handleSetConsumerPreferredLayers(data: any, socketInfo: SocketInfo): Promise<void> {
    const { meetingId, participantId, consumerId, layers } = data;
    const meeting = this.connectionManager.getMeeting(meetingId);
    
    if (!meeting || !(meeting instanceof MediasoupRoom)) {
      throw new Error('Meeting not found or not a MediasoupRoom');
    }

    await meeting.setConsumerPreferredLayers(participantId, consumerId, layers);
  }

  private async handleSetConsumerPriority(data: any, socketInfo: SocketInfo): Promise<void> {
    const { meetingId, participantId, consumerId, priority } = data;
    const meeting = this.connectionManager.getMeeting(meetingId);
    
    if (!meeting || !(meeting instanceof MediasoupRoom)) {
      throw new Error('Meeting not found or not a MediasoupRoom');
    }

    await meeting.setConsumerPriority(participantId, consumerId, priority);
  }

  private async handleRestartIce(data: any, socketInfo: SocketInfo): Promise<any> {
    const { meetingId, participantId, transportId } = data;
    const meeting = this.connectionManager.getMeeting(meetingId);
    
    if (!meeting || !(meeting instanceof MediasoupRoom)) {
      throw new Error('Meeting not found or not a MediasoupRoom');
    }

    const iceParameters = await meeting.restartIce(participantId, transportId);
    return iceParameters;
  }

  private async handleGetStats(data: any, socketInfo: SocketInfo): Promise<any> {
    const { meetingId } = data;
    const meeting = this.connectionManager.getMeeting(meetingId);
    
    if (!meeting || !(meeting instanceof MediasoupRoom)) {
      throw new Error('Meeting not found or not a MediasoupRoom');
    }

    // TODO: Implement stats collection
    const stats = {};
    return stats;
  }

  public handleMeetingEvent(meetingId: string, event: string, data: any): void {
    switch (event) {
      case 'activeSpeakers:changed':
        this.broadcastToMeeting(meetingId, {
          type: 'mediasoup:activeSpeakers',
          data,
        });
        break;
      
      case 'producer:new':
        // Already handled in produce handler
        break;
      
      case 'consumer:new':
        // Already handled in consume handler
        break;
      
      case 'participant:left':
        // Clean up producers/consumers for this participant
        this.broadcastToMeeting(meetingId, {
          type: 'mediasoup:participantLeft',
          data: {
            participantId: data.id,
          },
        });
        break;
    }
  }

  private handleDisconnect(socket: WebSocket): void {
    const socketInfo = this.sockets.get(socket);
    if (socketInfo) {
      logger.info('MediaSoup WebSocket disconnected', {
        meetingId: socketInfo.meetingId,
        participantId: socketInfo.participantId,
      });
      this.sockets.delete(socket);
    }
  }

  private sendMessage(socket: WebSocket, message: any): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  private sendError(socket: WebSocket, error: string): void {
    this.sendMessage(socket, {
      type: 'error',
      error,
    });
  }

  private broadcastToMeeting(meetingId: string, message: any, excludeSocket?: WebSocket): void {
    for (const [socket, info] of this.sockets) {
      if (info.meetingId === meetingId && socket !== excludeSocket) {
        this.sendMessage(socket, message);
      }
    }
  }
}