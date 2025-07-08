import { useState, useEffect, useCallback, useRef } from 'react';
import { MediasoupService } from '../services/mediasoup/MediasoupService';
import { Consumer, Producer, DataProducer, DataConsumer } from 'mediasoup-client/lib/types';
import { useWebSocketContext } from './useWebSocketContext';

interface MediasoupMessage {
  type: string;
  id?: string;
  data?: any;
  error?: string;
}

interface MediasoupState {
  isInitialized: boolean;
  isConnected: boolean;
  producers: Map<string, Producer>;
  consumers: Map<string, Consumer>;
  dataProducers: Map<string, DataProducer>;
  dataConsumers: Map<string, DataConsumer>;
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  activeSpeakers: string[];
  connectionQuality: 'excellent' | 'good' | 'poor' | 'disconnected';
}

interface UseMediasoupOptions {
  meetingId: string;
  participantId: string;
  enableAudio?: boolean;
  enableVideo?: boolean;
  enableDataChannel?: boolean;
}

export function useMediasoup(options: UseMediasoupOptions) {
  const { meetingId, participantId, enableAudio = true, enableVideo = true, enableDataChannel = true } = options;
  const { socket, isConnected: wsConnected } = useWebSocketContext();
  const mediasoupService = useRef<MediasoupService | null>(null);
  const messageCallbacks = useRef<Map<string, (response: any) => void>>(new Map());
  const messageIdCounter = useRef(0);
  
  const [state, setState] = useState<MediasoupState>({
    isInitialized: false,
    isConnected: false,
    producers: new Map(),
    consumers: new Map(),
    dataProducers: new Map(),
    dataConsumers: new Map(),
    localStream: null,
    remoteStreams: new Map(),
    activeSpeakers: [],
    connectionQuality: 'disconnected',
  });

  // Send message with response handling
  const sendMessage = useCallback((type: string, data: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      const id = String(++messageIdCounter.current);
      const message: MediasoupMessage = { type, id, data };
      
      // Set up callback for response
      messageCallbacks.current.set(id, (response: any) => {
        if (response.error) {
          reject(new Error(response.error));
        } else {
          resolve(response.data);
        }
      });

      // Send message
      socket.send(JSON.stringify(message));

      // Timeout after 30 seconds
      setTimeout(() => {
        if (messageCallbacks.current.has(id)) {
          messageCallbacks.current.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }, [socket]);

  // Initialize MediaSoup
  const initialize = useCallback(async () => {
    if (!socket || !wsConnected) return;

    try {
      // Get router capabilities
      const capabilities = await sendMessage('mediasoup:getRouterCapabilities', { meetingId });
      
      mediasoupService.current = new MediasoupService();
      await mediasoupService.current.initialize(capabilities);

      // Send RTP capabilities to server
      const rtpCapabilities = mediasoupService.current.getRtpCapabilities();
      await sendMessage('mediasoup:setRtpCapabilities', { 
        meetingId, 
        participantId, 
        rtpCapabilities 
      });

      setState(prev => ({ ...prev, isInitialized: true }));

      // Create transports
      await createTransports();
    } catch (error) {
      console.error('Failed to initialize MediaSoup:', error);
    }
  }, [socket, wsConnected, meetingId, participantId, sendMessage]);

  // Create WebRTC transports
  const createTransports = useCallback(async () => {
    if (!socket || !mediasoupService.current) return;

    // Create send transport
    const sendTransportOptions = await sendMessage('mediasoup:createTransport', { 
      meetingId, 
      participantId, 
      direction: 'send' 
    });

    await mediasoupService.current.createSendTransport(
      sendTransportOptions,
      async ({ dtlsParameters }) => {
        await sendMessage('mediasoup:connectTransport', {
          meetingId,
          participantId,
          transportId: sendTransportOptions.id,
          dtlsParameters,
        });
      },
      async ({ kind, rtpParameters, appData }) => {
        const response = await sendMessage('mediasoup:produce', {
          meetingId,
          participantId,
          transportId: sendTransportOptions.id,
          kind,
          rtpParameters,
          appData,
        });
        return response.producerId;
      },
      async ({ sctpStreamParameters, label, protocol, appData }) => {
        const response = await sendMessage('mediasoup:produceData', {
          meetingId,
          participantId,
          transportId: sendTransportOptions.id,
          sctpStreamParameters,
          label,
          protocol,
          appData,
        });
        return response.dataProducerId;
      }
    );

    // Create receive transport
    const recvTransportOptions = await sendMessage('mediasoup:createTransport', { 
      meetingId, 
      participantId, 
      direction: 'recv' 
    });

    await mediasoupService.current.createRecvTransport(
      recvTransportOptions,
      async ({ dtlsParameters }) => {
        await sendMessage('mediasoup:connectTransport', {
          meetingId,
          participantId,
          transportId: recvTransportOptions.id,
          dtlsParameters,
        });
      }
    );

    setState(prev => ({ ...prev, isConnected: true }));
  }, [socket, meetingId, participantId, sendMessage]);

  // Start producing media
  const startProducing = useCallback(async () => {
    if (!mediasoupService.current || !state.isConnected) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: enableAudio ? {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
        } : false,
        video: enableVideo ? {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        } : false,
      });

      await mediasoupService.current.setLocalStream(stream);
      setState(prev => ({ ...prev, localStream: stream }));

      // Update producers state
      const producers = mediasoupService.current.getAllProducers();
      setState(prev => ({
        ...prev,
        producers: new Map(producers.map(p => [p.id, p])),
      }));
    } catch (error) {
      console.error('Failed to start producing:', error);
    }
  }, [state.isConnected, enableAudio, enableVideo]);

  // Handle new consumer
  const handleNewConsumer = useCallback(async (data: {
    participantId: string;
    consumerData: any;
  }) => {
    if (!mediasoupService.current) return;

    try {
      const consumer = await mediasoupService.current.consume(data.consumerData);
      
      // Get or create remote stream for participant
      let remoteStream = state.remoteStreams.get(data.participantId);
      if (!remoteStream) {
        remoteStream = new MediaStream();
        setState(prev => ({
          ...prev,
          remoteStreams: new Map(prev.remoteStreams).set(data.participantId, remoteStream!),
        }));
      }

      // Add track to remote stream
      remoteStream.addTrack(consumer.track);

      // Update consumers state
      setState(prev => ({
        ...prev,
        consumers: new Map(prev.consumers).set(consumer.id, consumer),
      }));
    } catch (error) {
      console.error('Failed to handle new consumer:', error);
    }
  }, [state.remoteStreams]);

  // Handle new data consumer
  const handleNewDataConsumer = useCallback(async (data: {
    participantId: string;
    dataConsumerData: any;
  }) => {
    if (!mediasoupService.current) return;

    try {
      const dataConsumer = await mediasoupService.current.consumeData(data.dataConsumerData);
      
      setState(prev => ({
        ...prev,
        dataConsumers: new Map(prev.dataConsumers).set(dataConsumer.id, dataConsumer),
      }));
    } catch (error) {
      console.error('Failed to handle new data consumer:', error);
    }
  }, []);

  // Share screen
  const shareScreen = useCallback(async () => {
    if (!mediasoupService.current) return null;

    try {
      const producer = await mediasoupService.current.shareScreen();
      if (producer) {
        setState(prev => ({
          ...prev,
          producers: new Map(prev.producers).set(producer.id, producer),
        }));
      }
      return producer;
    } catch (error) {
      console.error('Failed to share screen:', error);
      return null;
    }
  }, []);

  // Send data message
  const sendData = useCallback(async (message: any) => {
    if (!mediasoupService.current || !enableDataChannel) return;

    // Create data producer if not exists
    let dataProducer = Array.from(state.dataProducers.values())[0];
    if (!dataProducer) {
      dataProducer = await mediasoupService.current.produceData({
        label: 'chat',
        protocol: 'json',
      });
      
      setState(prev => ({
        ...prev,
        dataProducers: new Map(prev.dataProducers).set(dataProducer!.id, dataProducer!),
      }));
    }

    // Send message
    if (dataProducer.readyState === 'open') {
      dataProducer.send(JSON.stringify(message));
    }
  }, [state.dataProducers, enableDataChannel]);

  // Toggle audio/video
  const toggleAudio = useCallback(async () => {
    const audioProducer = Array.from(state.producers.values())
      .find(p => p.kind === 'audio' && p.appData.source === 'microphone');
    
    if (audioProducer) {
      if (audioProducer.paused) {
        await mediasoupService.current?.resumeProducer(audioProducer.id);
      } else {
        await mediasoupService.current?.pauseProducer(audioProducer.id);
      }
    }
  }, [state.producers]);

  const toggleVideo = useCallback(async () => {
    const videoProducer = Array.from(state.producers.values())
      .find(p => p.kind === 'video' && p.appData.source === 'webcam');
    
    if (videoProducer) {
      if (videoProducer.paused) {
        await mediasoupService.current?.resumeProducer(videoProducer.id);
      } else {
        await mediasoupService.current?.pauseProducer(videoProducer.id);
      }
    }
  }, [state.producers]);

  // Set consumer quality
  const setConsumerQuality = useCallback(async (
    consumerId: string,
    quality: 'high' | 'medium' | 'low'
  ) => {
    const layers = {
      high: { spatialLayer: 2, temporalLayer: 2 },
      medium: { spatialLayer: 1, temporalLayer: 2 },
      low: { spatialLayer: 0, temporalLayer: 1 },
    };

    await mediasoupService.current?.setConsumerPreferredLayers(
      consumerId,
      layers[quality]
    );
  }, []);

  // Clean up
  const cleanup = useCallback(() => {
    if (state.localStream) {
      state.localStream.getTracks().forEach(track => track.stop());
    }
    
    state.remoteStreams.forEach(stream => {
      stream.getTracks().forEach(track => track.stop());
    });

    mediasoupService.current?.close();
    mediasoupService.current = null;

    setState({
      isInitialized: false,
      isConnected: false,
      producers: new Map(),
      consumers: new Map(),
      dataProducers: new Map(),
      dataConsumers: new Map(),
      localStream: null,
      remoteStreams: new Map(),
      activeSpeakers: [],
      connectionQuality: 'disconnected',
    });
  }, [state.localStream, state.remoteStreams]);

  // Handle incoming WebSocket messages
  useEffect(() => {
    if (!socket || !wsConnected) return;

    const handleMessage = async (event: MessageEvent) => {
      try {
        const message: MediasoupMessage = JSON.parse(event.data);
        
        // Handle response messages
        if (message.type === 'response' && message.id) {
          const callback = messageCallbacks.current.get(message.id);
          if (callback) {
            messageCallbacks.current.delete(message.id);
            callback(message);
          }
          return;
        }

        // Handle error messages
        if (message.type === 'error' && message.id) {
          const callback = messageCallbacks.current.get(message.id);
          if (callback) {
            messageCallbacks.current.delete(message.id);
            callback({ error: message.error });
          }
          return;
        }

        // Handle event messages
        switch (message.type) {
          case 'mediasoup:newProducer':
            // Auto-consume new producers from other participants
            if (message.data.participantId !== participantId && mediasoupService.current?.getRtpCapabilities()) {
              await sendMessage('mediasoup:consume', {
                meetingId,
                participantId,
                producerId: message.data.producerId,
                rtpCapabilities: mediasoupService.current.getRtpCapabilities(),
              });
            }
            break;

          case 'mediasoup:newConsumer':
            handleNewConsumer(message.data);
            break;

          case 'mediasoup:newDataProducer':
            if (message.data.participantId !== participantId) {
              await sendMessage('mediasoup:consumeData', {
                meetingId,
                participantId,
                dataProducerId: message.data.dataProducerId,
              });
            }
            break;

          case 'mediasoup:newDataConsumer':
            handleNewDataConsumer(message.data);
            break;

          case 'mediasoup:activeSpeakers':
            setState(prev => ({ ...prev, activeSpeakers: message.data }));
            break;

          case 'mediasoup:connectionQuality':
            setState(prev => ({ ...prev, connectionQuality: message.data }));
            break;

          case 'mediasoup:consumerClosed':
            const consumer = state.consumers.get(message.data.consumerId);
            if (consumer) {
              consumer.close();
              setState(prev => ({
                ...prev,
                consumers: new Map(Array.from(prev.consumers).filter(([id]) => id !== message.data.consumerId)),
              }));
            }
            break;

          case 'mediasoup:producerClosed':
            const producer = state.producers.get(message.data.producerId);
            if (producer) {
              producer.close();
              setState(prev => ({
                ...prev,
                producers: new Map(Array.from(prev.producers).filter(([id]) => id !== message.data.producerId)),
              }));
            }
            break;
        }
      } catch (error) {
        console.error('Error handling mediasoup message:', error);
      }
    };

    socket.addEventListener('message', handleMessage);

    return () => {
      socket.removeEventListener('message', handleMessage);
    };
  }, [
    socket,
    wsConnected,
    meetingId,
    participantId,
    handleNewConsumer,
    handleNewDataConsumer,
    state.consumers,
    state.producers,
    sendMessage,
  ]);

  // Initialize when WebSocket connects
  useEffect(() => {
    if (wsConnected && !state.isInitialized) {
      initialize();
    }
  }, [wsConnected, state.isInitialized, initialize]);

  // Start producing when initialized
  useEffect(() => {
    if (state.isConnected && state.producers.size === 0) {
      startProducing();
    }
  }, [state.isConnected, state.producers.size, startProducing]);

  // Listen for data messages
  useEffect(() => {
    if (!mediasoupService.current) return;

    const handleDataMessage = (event: any) => {
      try {
        const message = JSON.parse(event.message);
        // Emit custom event or handle message
        window.dispatchEvent(new CustomEvent('mediasoup:dataMessage', { 
          detail: { 
            dataConsumerId: event.dataConsumerId,
            message,
            appData: event.appData,
          } 
        }));
      } catch (error) {
        console.error('Failed to parse data message:', error);
      }
    };

    mediasoupService.current.on('dataConsumer:message', handleDataMessage);

    return () => {
      mediasoupService.current?.off('dataConsumer:message', handleDataMessage);
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  return {
    // State
    isInitialized: state.isInitialized,
    isConnected: state.isConnected,
    localStream: state.localStream,
    remoteStreams: state.remoteStreams,
    activeSpeakers: state.activeSpeakers,
    connectionQuality: state.connectionQuality,
    
    // Media controls
    toggleAudio,
    toggleVideo,
    shareScreen,
    
    // Data channel
    sendData,
    
    // Quality control
    setConsumerQuality,
    
    // Getters
    getProducer: (id: string) => state.producers.get(id),
    getConsumer: (id: string) => state.consumers.get(id),
    getDataProducer: (id: string) => state.dataProducers.get(id),
    getDataConsumer: (id: string) => state.dataConsumers.get(id),
    
    // Cleanup
    cleanup,
  };
}