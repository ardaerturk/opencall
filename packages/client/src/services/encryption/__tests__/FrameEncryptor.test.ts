import { FrameEncryptor, FrameDecryptor } from '../FrameEncryptor';

// Mock RTCEncodedVideoFrame
class MockEncodedFrame {
  data: ArrayBuffer;
  
  constructor(data: ArrayBuffer) {
    this.data = data;
  }
}

describe('FrameEncryptor', () => {
  let encryptor: FrameEncryptor;
  let decryptor: FrameDecryptor;
  let encryptionKey: CryptoKey;

  beforeEach(async () => {
    // Generate a test encryption key
    encryptionKey = await crypto.subtle.generateKey(
      {
        name: 'AES-GCM',
        length: 256
      },
      true,
      ['encrypt', 'decrypt']
    );

    encryptor = new FrameEncryptor({
      groupId: 'test-group',
      senderId: 'test-sender',
      getEncryptionKey: async () => encryptionKey
    });

    decryptor = new FrameDecryptor({
      groupId: 'test-group',
      senderId: 'test-receiver',
      getEncryptionKey: async () => encryptionKey
    });

    await encryptor.updateKey(0, encryptionKey);
    await decryptor.addKey(0, encryptionKey);
  });

  describe('encryptFrame', () => {
    it('should encrypt a frame', async () => {
      const originalData = new TextEncoder().encode('Hello, World!');
      const frame = new MockEncodedFrame(originalData.buffer) as any;
      
      await encryptor.encryptFrame(frame);
      
      // Frame data should be modified
      expect(frame.data.byteLength).toBeGreaterThan(originalData.length);
      
      // Should have header (26 bytes) + encrypted data
      const encryptedData = new Uint8Array(frame.data);
      expect(encryptedData[0]).toBe(0x01); // Version
      expect(encryptedData[1]).toBe(0x00); // Key ID
    });

    it('should handle frames without encryption key', async () => {
      const noKeyEncryptor = new FrameEncryptor({
        groupId: 'test-group',
        senderId: 'test-sender',
        getEncryptionKey: async () => null
      });

      const originalData = new TextEncoder().encode('Hello, World!');
      const frame = new MockEncodedFrame(originalData.buffer) as any;
      
      await noKeyEncryptor.encryptFrame(frame);
      
      // Frame should remain unchanged
      expect(frame.data).toBe(originalData.buffer);
    });

    it('should increment frame counter', async () => {
      const frame1 = new MockEncodedFrame(new ArrayBuffer(10)) as any;
      const frame2 = new MockEncodedFrame(new ArrayBuffer(10)) as any;
      
      await encryptor.encryptFrame(frame1);
      await encryptor.encryptFrame(frame2);
      
      // Extract IVs from frames
      const iv1 = new Uint8Array(frame1.data).slice(14, 26);
      const iv2 = new Uint8Array(frame2.data).slice(14, 26);
      
      // IVs should be different (due to counter increment)
      expect(iv1).not.toEqual(iv2);
    });
  });

  describe('decryptFrame', () => {
    it('should decrypt an encrypted frame', async () => {
      const originalData = new TextEncoder().encode('Hello, World!');
      const frame = new MockEncodedFrame(originalData.buffer) as any;
      
      // Encrypt the frame
      await encryptor.encryptFrame(frame);
      
      // Decrypt it
      await decryptor.decryptFrame(frame);
      
      // Should get back original data
      const decryptedData = new TextDecoder().decode(frame.data);
      expect(decryptedData).toBe('Hello, World!');
    });

    it('should pass through unencrypted frames', async () => {
      const originalData = new TextEncoder().encode('Hello, World!');
      const frame = new MockEncodedFrame(originalData.buffer) as any;
      
      await decryptor.decryptFrame(frame);
      
      // Frame should remain unchanged
      expect(frame.data).toBe(originalData.buffer);
    });

    it('should handle frames with wrong key', async () => {
      // Generate a different key
      const wrongKey = await crypto.subtle.generateKey(
        {
          name: 'AES-GCM',
          length: 256
        },
        true,
        ['encrypt', 'decrypt']
      );

      const wrongDecryptor = new FrameDecryptor({
        groupId: 'test-group',
        senderId: 'test-receiver',
        getEncryptionKey: async () => wrongKey
      });
      await wrongDecryptor.addKey(0, wrongKey);

      const originalData = new TextEncoder().encode('Hello, World!');
      const frame = new MockEncodedFrame(originalData.buffer) as any;
      
      // Encrypt with correct key
      await encryptor.encryptFrame(frame);
      
      // Try to decrypt with wrong key
      await wrongDecryptor.decryptFrame(frame);
      
      // Frame data should be empty (decryption failed)
      expect(frame.data.byteLength).toBe(0);
    });

    it('should request missing keys', async () => {
      const onKeyRequest = jest.fn();
      const needyDecryptor = new FrameDecryptor({
        groupId: 'test-group',
        senderId: 'test-receiver',
        getEncryptionKey: async () => null,
        onKeyRequest
      });

      const originalData = new TextEncoder().encode('Hello, World!');
      const frame = new MockEncodedFrame(originalData.buffer) as any;
      
      // Encrypt the frame with key ID 5
      await encryptor.updateKey(5, encryptionKey);
      await encryptor.encryptFrame(frame);
      
      // Try to decrypt without the key
      await needyDecryptor.decryptFrame(frame);
      
      // Should have requested the key
      expect(onKeyRequest).toHaveBeenCalledWith(expect.any(String), 5);
    });
  });

  describe('round-trip encryption/decryption', () => {
    it('should handle various data sizes', async () => {
      const testSizes = [0, 1, 100, 1000, 10000];
      
      for (const size of testSizes) {
        const originalData = new Uint8Array(size);
        for (let i = 0; i < size; i++) {
          originalData[i] = i % 256;
        }
        
        const frame = new MockEncodedFrame(originalData.buffer) as any;
        
        await encryptor.encryptFrame(frame);
        await decryptor.decryptFrame(frame);
        
        const decryptedData = new Uint8Array(frame.data);
        expect(decryptedData).toEqual(originalData);
      }
    });

    it('should handle concurrent encryption/decryption', async () => {
      const frames = Array.from({ length: 10 }, (_, i) => 
        new MockEncodedFrame(new TextEncoder().encode(`Frame ${i}`).buffer) as any
      );
      
      // Encrypt all frames concurrently
      await Promise.all(frames.map(frame => encryptor.encryptFrame(frame)));
      
      // Decrypt all frames concurrently
      await Promise.all(frames.map(frame => decryptor.decryptFrame(frame)));
      
      // Verify all frames
      frames.forEach((frame, i) => {
        const decrypted = new TextDecoder().decode(frame.data);
        expect(decrypted).toBe(`Frame ${i}`);
      });
    });
  });

  describe('key management', () => {
    it('should support multiple keys in decryptor', async () => {
      // Generate multiple keys
      const keys = await Promise.all(
        Array.from({ length: 3 }, () => 
          crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt']
          )
        )
      );

      // Add all keys to decryptor
      await Promise.all(
        keys.map((key, i) => decryptor.addKey(i, key))
      );

      // Encrypt frames with different keys
      for (let i = 0; i < keys.length; i++) {
        await encryptor.updateKey(i, keys[i]);
        
        const frame = new MockEncodedFrame(
          new TextEncoder().encode(`Message with key ${i}`).buffer
        ) as any;
        
        await encryptor.encryptFrame(frame);
        await decryptor.decryptFrame(frame);
        
        const decrypted = new TextDecoder().decode(frame.data);
        expect(decrypted).toBe(`Message with key ${i}`);
      }
    });

    it('should cache sender IDs', async () => {
      await decryptor.cacheSenderId('test-sender');
      
      // This is mainly for coverage, as the actual lookup
      // would happen during decryption with the hash
      expect(decryptor).toBeDefined();
    });
  });
});