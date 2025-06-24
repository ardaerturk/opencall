import { WorkerSettings, RouterOptions, WebRtcTransportOptions } from 'mediasoup/node/lib/types';

export const mediasoupConfig = {
  // Worker settings
  worker: {
    rtcMinPort: Number(process.env.RTC_MIN_PORT) || 2000,
    rtcMaxPort: Number(process.env.RTC_MAX_PORT) || 2020,
    logLevel: 'warn' as WorkerSettings['logLevel'],
    logTags: [
      'info',
      'ice',
      'dtls',
      'rtp',
      'srtp',
      'rtcp',
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
          'sprop-stereo': 1,
        },
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
      {
        kind: 'video',
        mimeType: 'video/h264',
        clockRate: 90000,
        parameters: {
          'packetization-mode': 1,
          'profile-level-id': '4d0032',
          'level-asymmetry-allowed': 1,
          'x-google-start-bitrate': 1000,
        },
      },
    ],
  } as RouterOptions,

  // WebRTC transport settings
  webRtcTransport: {
    listenIps: [
      {
        ip: process.env.MEDIASOUP_LISTEN_IP || '0.0.0.0',
        announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || undefined,
      },
    ],
    initialAvailableOutgoingBitrate: 1000000,
    minimumAvailableOutgoingBitrate: 600000,
    maxSctpMessageSize: 262144,
    // Additional options from the spec
    maxIncomingBitrate: 1500000,
  } as WebRtcTransportOptions,

  // Plain transport settings (for recording, streaming, etc.)
  plainTransport: {
    listenIp: {
      ip: process.env.MEDIASOUP_LISTEN_IP || '0.0.0.0',
      announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || undefined,
    },
    maxSctpMessageSize: 262144,
  },
};