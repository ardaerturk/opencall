import { MediasoupService } from './MediasoupService';
import { Producer, Consumer } from 'mediasoup-client/lib/types';
import { EventEmitter } from 'events';

interface EncryptionConfig {
  enableE2E: boolean;
  keyRotationInterval?: number;
  encryptionAlgorithm?: 'AES-GCM' | 'AES-CTR';
}

interface FrameMetadata {
  keyId: string;
  timestamp: number;
  sequenceNumber: number;
}

export class EncryptedMediasoupService extends MediasoupService {
  private encryptionConfig: EncryptionConfig;
  private encryptionKeys = new Map<string, CryptoKey>();
  private decryptionKeys = new Map<string, CryptoKey>();
  private frameEncryptors = new Map<string, RTCRtpScriptTransform>();
  private frameDecryptors = new Map<string, RTCRtpScriptTransform>();
  private keyRotationTimer?: NodeJS.Timer;
  private currentKeyId: string = '0';
  private sequenceNumbers = new Map<string, number>();

  constructor(encryptionConfig: EncryptionConfig = { enableE2E: true }) {
    super();
    this.encryptionConfig = encryptionConfig;
    
    if (encryptionConfig.enableE2E && encryptionConfig.keyRotationInterval) {
      this.startKeyRotation(encryptionConfig.keyRotationInterval);
    }
  }

  async produce(
    track: MediaStreamTrack,
    options?: any
  ): Promise<Producer> {
    const producer = await super.produce(track, options);

    if (this.encryptionConfig.enableE2E && track.kind === 'video') {
      await this.setupProducerEncryption(producer);
    }

    return producer;
  }

  async consume(consumerData: any): Promise<Consumer> {
    const consumer = await super.consume(consumerData);

    if (this.encryptionConfig.enableE2E && consumer.kind === 'video') {
      await this.setupConsumerDecryption(consumer);
    }

    return consumer;
  }

  private async setupProducerEncryption(producer: Producer): Promise<void> {
    if (!('RTCRtpScriptTransform' in window)) {
      console.warn('RTCRtpScriptTransform not supported, E2E encryption disabled');
      return;
    }

    // Get the RTCRtpSender from the producer
    const rtpSender = producer.rtpSender;
    if (!rtpSender) return;

    // Create encryption worker
    const worker = new Worker('/workers/mediasoupEncryption.js');
    
    // Generate or get current encryption key
    const key = await this.getOrCreateEncryptionKey(this.currentKeyId);
    
    // Send key to worker
    worker.postMessage({
      type: 'setKey',
      keyId: this.currentKeyId,
      key: await crypto.subtle.exportKey('raw', key),
      operation: 'encrypt'
    });

    // Create transform
    const transform = new RTCRtpScriptTransform(worker, {
      producerId: producer.id,
      operation: 'encrypt'
    });

    // Apply transform to sender
    (rtpSender as any).transform = transform;
    
    this.frameEncryptors.set(producer.id, transform);
  }

  private async setupConsumerDecryption(consumer: Consumer): Promise<void> {
    if (!('RTCRtpScriptTransform' in window)) {
      console.warn('RTCRtpScriptTransform not supported, E2E decryption disabled');
      return;
    }

    // Get the RTCRtpReceiver from the consumer
    const rtpReceiver = consumer.rtpReceiver;
    if (!rtpReceiver) return;

    // Create decryption worker
    const worker = new Worker('/workers/mediasoupEncryption.js');
    
    // We'll receive keys through signaling
    worker.postMessage({
      type: 'init',
      operation: 'decrypt',
      consumerId: consumer.id
    });

    // Create transform
    const transform = new RTCRtpScriptTransform(worker, {
      consumerId: consumer.id,
      operation: 'decrypt'
    });

    // Apply transform to receiver
    (rtpReceiver as any).transform = transform;
    
    this.frameDecryptors.set(consumer.id, transform);
  }

  async setDecryptionKey(keyId: string, keyData: ArrayBuffer, consumerId?: string): Promise<void> {
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    this.decryptionKeys.set(keyId, key);

    // Send key to specific decryptor or all decryptors
    if (consumerId) {
      const transform = this.frameDecryptors.get(consumerId);
      if (transform) {
        (transform as any).worker.postMessage({
          type: 'setKey',
          keyId,
          key: keyData,
          operation: 'decrypt'
        });
      }
    } else {
      // Send to all decryptors
      for (const [_, transform] of this.frameDecryptors) {
        (transform as any).worker.postMessage({
          type: 'setKey',
          keyId,
          key: keyData,
          operation: 'decrypt'
        });
      }
    }
  }

  private async getOrCreateEncryptionKey(keyId: string): Promise<CryptoKey> {
    let key = this.encryptionKeys.get(keyId);
    if (!key) {
      key = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );
      this.encryptionKeys.set(keyId, key);
    }
    return key;
  }

  private startKeyRotation(interval: number): void {
    this.keyRotationTimer = setInterval(async () => {
      // Generate new key
      const newKeyId = String(Date.now());
      const newKey = await this.getOrCreateEncryptionKey(newKeyId);
      
      // Export key for sharing
      const exportedKey = await crypto.subtle.exportKey('raw', newKey);
      
      // Notify about key rotation
      this.emit('keyRotation', {
        keyId: newKeyId,
        key: exportedKey
      });

      // Update all encryptors with new key
      for (const [_, transform] of this.frameEncryptors) {
        (transform as any).worker.postMessage({
          type: 'rotateKey',
          keyId: newKeyId,
          key: exportedKey
        });
      }

      this.currentKeyId = newKeyId;
      
      // Clean up old keys after a delay
      setTimeout(() => {
        for (const [id, _] of this.encryptionKeys) {
          if (id !== this.currentKeyId) {
            this.encryptionKeys.delete(id);
          }
        }
      }, 30000); // Keep old keys for 30 seconds
    }, interval);
  }

  async getStats(): Promise<any> {
    const stats = await super.getStats();
    
    // Add encryption stats
    const encryptionStats = {
      encryptedProducers: this.frameEncryptors.size,
      decryptedConsumers: this.frameDecryptors.size,
      currentKeyId: this.currentKeyId,
      totalKeys: this.encryptionKeys.size + this.decryptionKeys.size
    };

    return {
      ...stats,
      encryption: encryptionStats
    };
  }

  close(): void {
    // Clean up key rotation
    if (this.keyRotationTimer) {
      clearInterval(this.keyRotationTimer);
    }

    // Clean up workers
    for (const [_, transform] of this.frameEncryptors) {
      (transform as any).worker.terminate();
    }
    for (const [_, transform] of this.frameDecryptors) {
      (transform as any).worker.terminate();
    }

    this.frameEncryptors.clear();
    this.frameDecryptors.clear();
    this.encryptionKeys.clear();
    this.decryptionKeys.clear();

    super.close();
  }
}