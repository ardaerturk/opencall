import { useState, useEffect, useCallback, useRef } from 'react';

export interface DataChannelMessage {
  type: string;
  data: any;
  timestamp: number;
}

export interface UseDataChannelOptions {
  label?: string;
  ordered?: boolean;
  maxRetransmits?: number;
  onMessage?: (message: DataChannelMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Error) => void;
}

export interface UseDataChannelReturn {
  dataChannel: RTCDataChannel | null;
  isOpen: boolean;
  sendMessage: (type: string, data: any) => void;
  sendRawData: (data: string | ArrayBuffer | Blob) => void;
  bufferedAmount: number;
}

export function useDataChannel(
  peerConnection: RTCPeerConnection | null,
  options: UseDataChannelOptions = {}
): UseDataChannelReturn {
  const [dataChannel, setDataChannel] = useState<RTCDataChannel | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [bufferedAmount, setBufferedAmount] = useState(0);
  const bufferedAmountIntervalRef = useRef<NodeJS.Timeout>();

  const {
    label = 'collaboration',
    ordered = true,
    maxRetransmits = 3,
    onMessage,
    onOpen,
    onClose,
    onError
  } = options;

  useEffect(() => {
    if (!peerConnection) return;

    let channel: RTCDataChannel | null = null;

    // Create data channel if we're the offerer
    if (peerConnection.connectionState === 'new') {
      try {
        channel = peerConnection.createDataChannel(label, {
          ordered,
          maxRetransmits
        });
        setupDataChannel(channel);
      } catch (error) {
        console.error('Failed to create data channel:', error);
        onError?.(error as Error);
      }
    }

    // Handle incoming data channel
    const handleDataChannel = (event: RTCDataChannelEvent) => {
      if (event.channel.label === label) {
        channel = event.channel;
        setupDataChannel(channel);
      }
    };

    peerConnection.addEventListener('datachannel', handleDataChannel);

    return () => {
      peerConnection.removeEventListener('datachannel', handleDataChannel);
      if (channel) {
        channel.close();
      }
      if (bufferedAmountIntervalRef.current) {
        clearInterval(bufferedAmountIntervalRef.current);
      }
    };
  }, [peerConnection, label, ordered, maxRetransmits, onMessage, onOpen, onClose, onError]);

  const setupDataChannel = (channel: RTCDataChannel) => {
    channel.onopen = () => {
      console.log(`Data channel '${label}' opened`);
      setIsOpen(true);
      onOpen?.();

      // Start monitoring buffered amount
      bufferedAmountIntervalRef.current = setInterval(() => {
        setBufferedAmount(channel.bufferedAmount);
      }, 100);
    };

    channel.onclose = () => {
      console.log(`Data channel '${label}' closed`);
      setIsOpen(false);
      onClose?.();

      if (bufferedAmountIntervalRef.current) {
        clearInterval(bufferedAmountIntervalRef.current);
      }
    };

    channel.onerror = (event) => {
      console.error(`Data channel '${label}' error:`, event);
      onError?.(new Error('Data channel error'));
    };

    channel.onmessage = (event) => {
      try {
        const message: DataChannelMessage = JSON.parse(event.data);
        message.timestamp = message.timestamp || Date.now();
        onMessage?.(message);
      } catch (error) {
        console.error('Failed to parse data channel message:', error);
        // Handle raw data
        onMessage?.({
          type: 'raw',
          data: event.data,
          timestamp: Date.now()
        });
      }
    };

    setDataChannel(channel);
  };

  const sendMessage = useCallback((type: string, data: any) => {
    if (!dataChannel || dataChannel.readyState !== 'open') {
      console.warn('Data channel is not open');
      return;
    }

    const message: DataChannelMessage = {
      type,
      data,
      timestamp: Date.now()
    };

    try {
      dataChannel.send(JSON.stringify(message));
    } catch (error) {
      console.error('Failed to send message:', error);
      onError?.(error as Error);
    }
  }, [dataChannel, onError]);

  const sendRawData = useCallback((data: string | ArrayBuffer | Blob) => {
    if (!dataChannel || dataChannel.readyState !== 'open') {
      console.warn('Data channel is not open');
      return;
    }

    try {
      dataChannel.send(data);
    } catch (error) {
      console.error('Failed to send raw data:', error);
      onError?.(error as Error);
    }
  }, [dataChannel, onError]);

  return {
    dataChannel,
    isOpen,
    sendMessage,
    sendRawData,
    bufferedAmount
  };
}