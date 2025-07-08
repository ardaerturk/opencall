import { RtpCodecCapability, RtpCapabilities } from 'mediasoup/node/lib/types';
import { logger } from '../utils/logger';

interface DeviceInfo {
  platform?: string;
  browser?: string;
  isMobile?: boolean;
  hasHardwareAcceleration?: boolean;
}

interface NetworkConditions {
  bandwidth?: number; // kbps
  latency?: number; // ms
  packetLoss?: number; // percentage
  jitter?: number; // ms
}

interface CodecPreference {
  codec: RtpCodecCapability;
  score: number;
  reason: string;
}

export class CodecSelector {
  private static readonly CODEC_PRIORITIES = {
    // Audio codecs
    'audio/opus': {
      baseScore: 100,
      features: ['dtx', 'fec', 'stereo'],
      bandwidth: { min: 6, optimal: 32, max: 510 },
    },
    'audio/PCMU': {
      baseScore: 40,
      features: [],
      bandwidth: { min: 64, optimal: 64, max: 64 },
    },
    'audio/PCMA': {
      baseScore: 40,
      features: [],
      bandwidth: { min: 64, optimal: 64, max: 64 },
    },
    
    // Video codecs
    'video/VP9': {
      baseScore: 90,
      features: ['svc', 'simulcast'],
      bandwidth: { min: 30, optimal: 800, max: 4000 },
      complexity: 'high',
    },
    'video/VP8': {
      baseScore: 80,
      features: ['simulcast'],
      bandwidth: { min: 30, optimal: 600, max: 2000 },
      complexity: 'medium',
    },
    'video/h264': {
      baseScore: 85,
      features: ['hardware-acceleration'],
      bandwidth: { min: 30, optimal: 700, max: 3000 },
      complexity: 'low',
    },
    'video/h264-svc': {
      baseScore: 95,
      features: ['svc', 'hardware-acceleration'],
      bandwidth: { min: 50, optimal: 1000, max: 4000 },
      complexity: 'medium',
    },
  };

  static selectOptimalCodecs(
    supportedCodecs: RtpCodecCapability[],
    deviceInfo: DeviceInfo = {},
    networkConditions: NetworkConditions = {}
  ): RtpCodecCapability[] {
    const audioCodecs = this.selectAudioCodecs(supportedCodecs, deviceInfo, networkConditions);
    const videoCodecs = this.selectVideoCodecs(supportedCodecs, deviceInfo, networkConditions);
    
    return [...audioCodecs, ...videoCodecs];
  }

  private static selectAudioCodecs(
    supportedCodecs: RtpCodecCapability[],
    deviceInfo: DeviceInfo,
    networkConditions: NetworkConditions
  ): RtpCodecCapability[] {
    const audioCodecs = supportedCodecs.filter(codec => codec.kind === 'audio');
    const preferences: CodecPreference[] = [];

    for (const codec of audioCodecs) {
      const preference = this.calculateCodecPreference(codec, deviceInfo, networkConditions);
      preferences.push(preference);
    }

    // Sort by score and return
    preferences.sort((a, b) => b.score - a.score);
    
    logger.debug('Audio codec selection:', preferences.map(p => ({
      codec: p.codec.mimeType,
      score: p.score,
      reason: p.reason,
    })));

    return preferences.map(p => this.optimizeCodecParameters(p.codec, networkConditions));
  }

  private static selectVideoCodecs(
    supportedCodecs: RtpCodecCapability[],
    deviceInfo: DeviceInfo,
    networkConditions: NetworkConditions
  ): RtpCodecCapability[] {
    const videoCodecs = supportedCodecs.filter(codec => codec.kind === 'video');
    const preferences: CodecPreference[] = [];

    for (const codec of videoCodecs) {
      const preference = this.calculateCodecPreference(codec, deviceInfo, networkConditions);
      preferences.push(preference);
    }

    // Sort by score
    preferences.sort((a, b) => b.score - a.score);
    
    logger.debug('Video codec selection:', preferences.map(p => ({
      codec: p.codec.mimeType,
      score: p.score,
      reason: p.reason,
    })));

    // Select based on conditions
    const selectedCodecs: RtpCodecCapability[] = [];
    
    // Always include the best codec
    if (preferences.length > 0) {
      selectedCodecs.push(this.optimizeCodecParameters(preferences[0].codec, networkConditions));
    }

    // Include a fallback codec if network is poor
    if (networkConditions.bandwidth && networkConditions.bandwidth < 500 && preferences.length > 1) {
      const fallbackCodec = preferences.find(p => 
        p.codec.mimeType === 'video/VP8' || p.codec.mimeType === 'video/h264'
      );
      if (fallbackCodec && !selectedCodecs.some(c => c.mimeType === fallbackCodec.codec.mimeType)) {
        selectedCodecs.push(this.optimizeCodecParameters(fallbackCodec.codec, networkConditions));
      }
    }

    return selectedCodecs;
  }

  private static calculateCodecPreference(
    codec: RtpCodecCapability,
    deviceInfo: DeviceInfo,
    networkConditions: NetworkConditions
  ): CodecPreference {
    const codecInfo = this.CODEC_PRIORITIES[codec.mimeType];
    if (!codecInfo) {
      return { codec, score: 50, reason: 'Unknown codec' };
    }

    let score = codecInfo.baseScore;
    const reasons: string[] = [];

    // Device-based adjustments
    if (deviceInfo.isMobile) {
      // Prefer hardware-accelerated codecs on mobile
      if (codec.mimeType.includes('h264') && codecInfo.features?.includes('hardware-acceleration')) {
        score += 20;
        reasons.push('Hardware acceleration on mobile');
      }
      // Penalize high-complexity codecs
      if ((codecInfo as any).complexity === 'high') {
        score -= 15;
        reasons.push('High complexity on mobile');
      }
    }

    // Network-based adjustments
    if (networkConditions.bandwidth) {
      const bw = networkConditions.bandwidth;
      const { min, optimal, max } = codecInfo.bandwidth;
      
      if (bw < min) {
        score -= 50;
        reasons.push('Insufficient bandwidth');
      } else if (bw < optimal) {
        score -= 10;
        reasons.push('Below optimal bandwidth');
      } else if (bw > max) {
        score += 5;
        reasons.push('Excellent bandwidth');
      }
    }

    if (networkConditions.packetLoss && networkConditions.packetLoss > 2) {
      // Prefer codecs with FEC
      if (codecInfo.features?.includes('fec')) {
        score += 15;
        reasons.push('FEC for packet loss');
      }
      // VP9 handles packet loss better
      if (codec.mimeType === 'video/VP9') {
        score += 10;
        reasons.push('VP9 resilience');
      }
    }

    if (networkConditions.latency && networkConditions.latency > 100) {
      // Prefer lower-latency codecs
      if ((codecInfo as any).complexity === 'low') {
        score += 10;
        reasons.push('Low latency preference');
      }
    }

    // Platform-specific adjustments
    if (deviceInfo.platform === 'ios' && codec.mimeType.includes('h264')) {
      score += 15;
      reasons.push('iOS H264 optimization');
    }

    return { 
      codec, 
      score, 
      reason: reasons.join(', ') || 'Default selection' 
    };
  }

  private static optimizeCodecParameters(
    codec: RtpCodecCapability,
    networkConditions: NetworkConditions
  ): RtpCodecCapability {
    const optimizedCodec = { ...codec };
    const parameters = { ...(codec.parameters || {}) };

    // Optimize based on network conditions
    if (codec.kind === 'audio' && codec.mimeType === 'audio/opus') {
      // Always enable DTX for bandwidth savings
      parameters['usedtx'] = 1;
      
      // Adjust FEC based on packet loss
      if (networkConditions.packetLoss) {
        parameters['useinbandfec'] = networkConditions.packetLoss > 1 ? 1 : 0;
      }
      
      // Adjust bitrate based on bandwidth
      if (networkConditions.bandwidth) {
        if (networkConditions.bandwidth < 100) {
          parameters['maxaveragebitrate'] = 24000;
        } else if (networkConditions.bandwidth < 500) {
          parameters['maxaveragebitrate'] = 48000;
        } else {
          parameters['maxaveragebitrate'] = 128000;
        }
      }
    }

    if (codec.kind === 'video') {
      // Adjust start bitrate based on bandwidth
      if (networkConditions.bandwidth) {
        const bw = networkConditions.bandwidth;
        if (bw < 300) {
          parameters['x-google-start-bitrate'] = 50;
          parameters['x-google-max-bitrate'] = 200;
        } else if (bw < 1000) {
          parameters['x-google-start-bitrate'] = 100;
          parameters['x-google-max-bitrate'] = 800;
        } else {
          parameters['x-google-start-bitrate'] = 300;
          parameters['x-google-max-bitrate'] = 2000;
        }
      }

      // Enable specific features based on codec
      if (codec.mimeType === 'video/VP9') {
        parameters['profile-id'] = 2; // Profile 2 for better performance
      }
      
      if (codec.mimeType.includes('h264')) {
        // Use baseline profile for better compatibility
        if (networkConditions.bandwidth && networkConditions.bandwidth < 500) {
          parameters['profile-level-id'] = '42e01f'; // Constrained Baseline
        }
      }
    }

    optimizedCodec.parameters = parameters;
    return optimizedCodec;
  }

  static async detectNetworkConditions(
    transport: any // RTCTransport
  ): Promise<NetworkConditions> {
    try {
      const stats = await transport.getStats();
      let bandwidth = 0;
      let packetLoss = 0;
      let latency = 0;
      let jitter = 0;
      let statCount = 0;

      for (const [_, stat] of stats) {
        if (stat.type === 'outbound-rtp' || stat.type === 'inbound-rtp') {
          if (stat.availableOutgoingBitrate) {
            bandwidth = Math.max(bandwidth, stat.availableOutgoingBitrate / 1000); // Convert to kbps
          }
          
          if (stat.packetsLost && stat.packetsReceived) {
            const totalPackets = stat.packetsLost + stat.packetsReceived;
            packetLoss = (stat.packetsLost / totalPackets) * 100;
          }
          
          if (stat.jitter) {
            jitter = Math.max(jitter, stat.jitter * 1000); // Convert to ms
            statCount++;
          }
        }
        
        if (stat.type === 'candidate-pair' && stat.state === 'succeeded') {
          if (stat.currentRoundTripTime) {
            latency = stat.currentRoundTripTime * 1000; // Convert to ms
          }
        }
      }

      // Estimate bandwidth if not available
      if (!bandwidth && stats.size > 0) {
        bandwidth = 1000; // Default estimate
      }

      return {
        bandwidth: Math.round(bandwidth),
        latency: Math.round(latency),
        packetLoss: Math.round(packetLoss * 10) / 10,
        jitter: statCount > 0 ? Math.round(jitter / statCount) : 0,
      };
    } catch (error) {
      logger.error('Failed to detect network conditions:', error);
      return {
        bandwidth: 1000,
        latency: 50,
        packetLoss: 0,
        jitter: 0,
      };
    }
  }
}