import { EncryptionContext } from './MLSEncryptionService';

// Frame header structure:
// [1 byte: version] [1 byte: keyId] [8 bytes: senderId hash] [4 bytes: timestamp] [12 bytes: IV]
const FRAME_HEADER_SIZE = 26;
const VERSION = 0x01;

export interface FrameEncryptorOptions {
  groupId: string;
  senderId: string;
  getEncryptionKey: (keyId: number) => Promise<CryptoKey | null>;
  onKeyRequest?: (senderId: string, keyId: number) => void;
}

export class FrameEncryptor {
  private options: FrameEncryptorOptions;
  private currentKeyId: number = 0;
  private encryptionKey: CryptoKey | null = null;
  private frameCounter: bigint = 0n;

  constructor(options: FrameEncryptorOptions) {
    this.options = options;
  }

  async updateKey(keyId: number, key: CryptoKey): Promise<void> {
    this.currentKeyId = keyId;
    this.encryptionKey = key;
    this.frameCounter = 0n;
  }

  async encryptFrame(frame: RTCEncodedVideoFrame | RTCEncodedAudioFrame): Promise<void> {
    if (!this.encryptionKey) {
      // Try to get current key
      this.encryptionKey = await this.options.getEncryptionKey(this.currentKeyId);
      if (!this.encryptionKey) {
        console.warn('No encryption key available, passing frame unencrypted');
        return;
      }
    }

    try {
      const data = new Uint8Array(frame.data);
      
      // Generate IV using frame counter
      const iv = new Uint8Array(12);
      const counterBytes = new ArrayBuffer(8);
      new DataView(counterBytes).setBigUint64(0, this.frameCounter++, false);
      iv.set(new Uint8Array(counterBytes), 4);

      // Create frame header
      const header = new Uint8Array(FRAME_HEADER_SIZE);
      header[0] = VERSION;
      header[1] = this.currentKeyId & 0xFF;
      
      // Add sender ID hash (8 bytes)
      const senderIdHash = await this.hashSenderId(this.options.senderId);
      header.set(senderIdHash.slice(0, 8), 2);
      
      // Add timestamp (4 bytes)
      const timestamp = Date.now();
      new DataView(header.buffer).setUint32(10, timestamp, false);
      
      // Add IV
      header.set(iv, 14);

      // Encrypt the frame data
      const encryptedData = await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: iv,
          additionalData: header.slice(0, 14) // Use header without IV as additional data
        },
        this.encryptionKey,
        data
      );

      // Combine header and encrypted data
      const output = new Uint8Array(header.length + encryptedData.byteLength);
      output.set(header);
      output.set(new Uint8Array(encryptedData), header.length);

      // Replace frame data
      frame.data = output.buffer;
    } catch (error) {
      console.error('Frame encryption failed:', error);
      // On error, pass frame unencrypted
    }
  }

  private async hashSenderId(senderId: string): Promise<Uint8Array> {
    const encoder = new TextEncoder();
    const data = encoder.encode(senderId);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return new Uint8Array(hash);
  }
}

export class FrameDecryptor {
  private options: FrameEncryptorOptions;
  private decryptionKeys: Map<number, CryptoKey> = new Map();
  private senderIdCache: Map<string, string> = new Map(); // hash -> senderId

  constructor(options: FrameEncryptorOptions) {
    this.options = options;
  }

  async addKey(keyId: number, key: CryptoKey): Promise<void> {
    this.decryptionKeys.set(keyId, key);
  }

  async decryptFrame(frame: RTCEncodedVideoFrame | RTCEncodedAudioFrame): Promise<void> {
    const data = new Uint8Array(frame.data);
    
    // Check if frame is encrypted (has our header)
    if (data.length < FRAME_HEADER_SIZE || data[0] !== VERSION) {
      // Frame is not encrypted, pass through
      return;
    }

    try {
      // Parse header
      const keyId = data[1];
      const senderIdHash = data.slice(2, 10);
      const timestamp = new DataView(data.buffer).getUint32(10, false);
      const iv = data.slice(14, 26);
      
      // Get decryption key
      let decryptionKey = this.decryptionKeys.get(keyId);
      if (!decryptionKey) {
        // Request key from service
        decryptionKey = await this.options.getEncryptionKey(keyId);
        if (!decryptionKey) {
          // Try to request key from sender
          const senderId = await this.findSenderByHash(senderIdHash);
          if (senderId && this.options.onKeyRequest) {
            this.options.onKeyRequest(senderId, keyId);
          }
          console.warn(`No decryption key available for keyId ${keyId}`);
          return;
        }
        this.decryptionKeys.set(keyId, decryptionKey);
      }

      // Decrypt the frame data
      const encryptedData = data.slice(FRAME_HEADER_SIZE);
      const decryptedData = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: iv,
          additionalData: data.slice(0, 14) // Header without IV
        },
        decryptionKey,
        encryptedData
      );

      // Replace frame data with decrypted data
      frame.data = decryptedData;
    } catch (error) {
      console.error('Frame decryption failed:', error);
      // On error, drop the frame by setting empty data
      frame.data = new ArrayBuffer(0);
    }
  }

  private async findSenderByHash(hash: Uint8Array): Promise<string | null> {
    const hashStr = Array.from(hash).map(b => b.toString(16).padStart(2, '0')).join('');
    
    // Check cache first
    const cached = this.senderIdCache.get(hashStr);
    if (cached) {
      return cached;
    }

    // This would need to be implemented based on your participant tracking
    // For now, return null
    return null;
  }

  async cacheSenderId(senderId: string): Promise<void> {
    const hash = await this.hashSenderId(senderId);
    const hashStr = Array.from(hash.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('');
    this.senderIdCache.set(hashStr, senderId);
  }

  private async hashSenderId(senderId: string): Promise<Uint8Array> {
    const encoder = new TextEncoder();
    const data = encoder.encode(senderId);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return new Uint8Array(hash);
  }

  cleanup(): void {
    this.decryptionKeys.clear();
    this.senderIdCache.clear();
  }
}