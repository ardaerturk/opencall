// This worker handles frame decryption using RTCRtpScriptTransform
// It runs in a separate context from the main thread

import { FrameDecryptor } from './FrameEncryptor';
import { measurePerformance } from './PerformanceMonitor';

declare const self: DedicatedWorkerGlobalScope & {
  RTCTransformEvent: any;
};

let frameDecryptor: FrameDecryptor | null = null;

// Message handler for communication with main thread
self.onmessage = async (event: MessageEvent) => {
  const { type, data } = event.data;

  switch (type) {
    case 'init':
      // Initialize the frame decryptor
      frameDecryptor = new FrameDecryptor({
        groupId: data.groupId,
        senderId: data.senderId,
        getEncryptionKey: async (keyId: number) => {
          // Request key from main thread
          self.postMessage({ type: 'keyRequest', keyId });
          
          // Wait for response
          return new Promise((resolve) => {
            const handler = (e: MessageEvent) => {
              if (e.data.type === 'keyResponse' && e.data.keyId === keyId) {
                self.removeEventListener('message', handler);
                resolve(e.data.key);
              }
            };
            self.addEventListener('message', handler);
          });
        },
        onKeyRequest: (senderId: string, keyId: number) => {
          // Notify main thread that we need a key from a specific sender
          self.postMessage({ 
            type: 'keyNeeded', 
            senderId, 
            keyId 
          });
        }
      });
      break;

    case 'addKey':
      // Add a decryption key
      if (frameDecryptor && data.key) {
        await frameDecryptor.addKey(data.keyId, data.key);
      }
      break;

    case 'cacheSender':
      // Cache sender ID for hash lookup
      if (frameDecryptor && data.senderId) {
        await frameDecryptor.cacheSenderId(data.senderId);
      }
      break;

    case 'keyResponse':
      // This is handled by the promise in getEncryptionKey
      break;

    case 'cleanup':
      // Clean up resources
      if (frameDecryptor) {
        frameDecryptor.cleanup();
        frameDecryptor = null;
      }
      break;

    default:
      console.warn('Unknown message type:', type);
  }
};

// RTCTransformEvent handler
self.addEventListener('rtctransform', (event: any) => {
  const transformer = event.transformer;
  
  // Set up the transform stream
  transformer.readable
    .pipeThrough(new TransformStream({
      async transform(frame: RTCEncodedVideoFrame | RTCEncodedAudioFrame, controller: TransformStreamDefaultController) {
        if (frameDecryptor) {
          let decryptionFailed = false;
          
          // Measure decryption performance
          await measurePerformance(
            () => frameDecryptor.decryptFrame(frame),
            (duration) => {
              self.postMessage({ 
                type: 'performance', 
                operation: 'decryption',
                duration,
                frameType: (frame as any).type || 'unknown'
              });
            }
          );
          
          // Check if frame was successfully decrypted (non-empty data)
          if (frame.data.byteLength === 0) {
            // Drop the frame if decryption failed
            self.postMessage({ type: 'frameDropped', reason: 'decryption_failed' });
            return;
          }
        }
        
        // Pass the frame to the next stage
        controller.enqueue(frame);
      }
    }))
    .pipeTo(transformer.writable)
    .catch((error: Error) => {
      console.error('Decryption transform error:', error);
      self.postMessage({ type: 'error', error: error.message });
    });
});

// Error handling
self.addEventListener('error', (event: ErrorEvent) => {
  console.error('Worker error:', event.error);
  self.postMessage({ type: 'error', error: event.error?.message || 'Unknown error' });
});

// Export for TypeScript
export {};