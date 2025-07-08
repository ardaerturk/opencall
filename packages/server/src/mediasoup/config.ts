import { WorkerSettings, RouterOptions, WebRtcTransportOptions } from 'mediasoup/node/lib/types';

export const mediasoupConfig = {
  // Worker settings
  worker: {
    rtcMinPort: Number(process.env['RTC_MIN_PORT']) || 2000,
    rtcMaxPort: Number(process.env['RTC_MAX_PORT']) || 2020,
    logLevel: 'warn' as WorkerSettings['logLevel'],
    logTags: [
      'info',
      'ice',
      'dtls',
      'rtp',
      'srtp',
      'rtcp',
      'bwe', // Bandwidth estimation
    ] as WorkerSettings['logTags'],
  },

  // Router settings
  router: {
    mediaCodecs: [
      {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2,
        parameters: {
          'minptime': 10,
          'useinbandfec': 1,
          'usedtx': 1, // Enable DTX (Discontinuous Transmission)
          'sprop-stereo': 1,
          'stereo': 1,
          'maxaveragebitrate': 128000,
          'maxplaybackrate': 48000,
          'ptime': 20,
          'x-google-min-bitrate': 6000,
          'x-google-max-bitrate': 128000,
          'x-google-start-bitrate': 32000,
        },
      },
      {
        kind: 'video',
        mimeType: 'video/VP8',
        clockRate: 90000,
        parameters: {
          'x-google-start-bitrate': 100,
          'x-google-max-bitrate': 4000,
          'x-google-min-bitrate': 30,
        },
        rtcpFeedback: [
          { type: 'goog-remb', parameter: '' },
          { type: 'transport-cc', parameter: '' },
          { type: 'ccm', parameter: 'fir' },
          { type: 'nack', parameter: '' },
          { type: 'nack', parameter: 'pli' },
        ],
      },
      {
        kind: 'video',
        mimeType: 'video/VP9',
        clockRate: 90000,
        parameters: {
          'profile-id': 2,
          'x-google-start-bitrate': 100,
          'x-google-max-bitrate': 4000,
          'x-google-min-bitrate': 30,
        },
        rtcpFeedback: [
          { type: 'goog-remb', parameter: '' },
          { type: 'transport-cc', parameter: '' },
          { type: 'ccm', parameter: 'fir' },
          { type: 'nack', parameter: '' },
          { type: 'nack', parameter: 'pli' },
        ],
      },
      {
        kind: 'video',
        mimeType: 'video/h264',
        clockRate: 90000,
        parameters: {
          'packetization-mode': 1,
          'profile-level-id': '42e01f', // Constrained Baseline
          'level-asymmetry-allowed': 1,
          'x-google-start-bitrate': 100,
          'x-google-max-bitrate': 4000,
          'x-google-min-bitrate': 30,
        },
        rtcpFeedback: [
          { type: 'goog-remb', parameter: '' },
          { type: 'transport-cc', parameter: '' },
          { type: 'ccm', parameter: 'fir' },
          { type: 'nack', parameter: '' },
          { type: 'nack', parameter: 'pli' },
        ],
      },
      // H264 SVC (Scalable Video Coding) for better performance
      {
        kind: 'video',
        mimeType: 'video/h264-svc',
        clockRate: 90000,
        parameters: {
          'packetization-mode': 1,
          'profile-level-id': '640032',
        },
        rtcpFeedback: [
          { type: 'goog-remb', parameter: '' },
          { type: 'transport-cc', parameter: '' },
          { type: 'ccm', parameter: 'fir' },
          { type: 'nack', parameter: '' },
          { type: 'nack', parameter: 'pli' },
        ],
      },
    ],
  } as RouterOptions,

  // WebRTC transport settings
  webRtcTransport: {
    listenIps: [
      (() => {
        const listenIp: any = {
          ip: process.env['MEDIASOUP_LISTEN_IP'] || '0.0.0.0',
        };
        const announcedIp = process.env['MEDIASOUP_ANNOUNCED_IP'];
        if (announcedIp) {
          listenIp.announcedIp = announcedIp;
        }
        return listenIp;
      })(),
    ],
    // Adaptive bitrate settings
    initialAvailableOutgoingBitrate: 600000, // Start conservative
    minimumAvailableOutgoingBitrate: 200000, // Lower minimum for poor connections
    maxIncomingBitrate: 4000000, // Allow higher quality when possible
    maxSctpMessageSize: 262144,
    // Enable REMB and Transport-CC for better bandwidth estimation
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    preferTcp: false,
    // Congestion control
    congestionWindow: 1024,
  } as WebRtcTransportOptions,

  // Plain transport settings (for recording, streaming, etc.)
  plainTransport: {
    listenIp: (() => {
      const listenIp: any = {
        ip: process.env['MEDIASOUP_LISTEN_IP'] || '0.0.0.0',
      };
      const announcedIp = process.env['MEDIASOUP_ANNOUNCED_IP'];
      if (announcedIp) {
        listenIp.announcedIp = announcedIp;
      }
      return listenIp;
    })(),
    maxSctpMessageSize: 262144,
    // RTP settings for recording
    rtcpMux: false,
    comedia: true,
  },

  // Performance optimizations
  performance: {
    // Audio optimizations
    audio: {
      // Opus specific
      opusStereo: true,
      opusFec: true,
      opusDtx: true,
      opusMaxPlaybackRate: 48000,
      opusMaxAverageBitrate: 128000,
      opusPtime: 20,
      // General audio
      audioLevelThreshold: -40, // dB threshold for voice activity
    },
    // Video optimizations
    video: {
      // VP8/VP9 specific
      videoGoogleStartBitrate: 100,
      videoGoogleMaxBitrate: 4000,
      videoGoogleMinBitrate: 30,
      // H264 specific
      h264MaxBitrate: 4000,
      // General video
      maxFramerate: 30,
      adaptiveFramerate: true,
      // Simulcast settings
      simulcast: {
        low: {
          maxBitrate: 150000,
          scaleResolutionDownBy: 4,
          maxFramerate: 15,
        },
        medium: {
          maxBitrate: 500000,
          scaleResolutionDownBy: 2,
          maxFramerate: 20,
        },
        high: {
          maxBitrate: 1500000,
          scaleResolutionDownBy: 1,
          maxFramerate: 30,
        },
      },
      // SVC (Scalable Video Coding) settings
      svc: {
        spatialLayers: 3,
        temporalLayers: 3,
      },
    },
    // Network optimizations
    network: {
      // Jitter buffer
      maxJitterBufferDelay: 200, // ms
      // Packet loss recovery
      maxPacketLossPercentage: 10,
      // FEC (Forward Error Correction)
      enableFec: true,
      // RTX (Retransmission)
      enableRtx: true,
      rtxPacketRetransmitTimeout: 1000, // ms
    },
  },
};