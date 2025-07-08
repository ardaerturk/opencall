// This worker handles frame encryption using RTCRtpScriptTransform
// It runs in a separate context from the main thread

import { FrameEncryptor } from './FrameEncryptor';
import { measurePerformance } from './PerformanceMonitor';

declare const self: DedicatedWorkerGlobalScope & {
  RTCTransformEvent: any;
};

let frameEncryptor: FrameEncryptor | null = null;

// Message handler for communication with main thread
self.onmessage = async (event: MessageEvent) => {
  const { type, data } = event.data;

  switch (type) {
    case 'init':
      // Initialize the frame encryptor
      frameEncryptor = new FrameEncryptor({
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
        }
      });
      break;

    case 'updateKey':
      // Update encryption key
      if (frameEncryptor && data.key) {
        await frameEncryptor.updateKey(data.keyId, data.key);
      }
      break;

    case 'keyResponse':
      // This is handled by the promise in getEncryptionKey
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
        if (frameEncryptor) {
          // Measure encryption performance
          await measurePerformance(
            () => frameEncryptor.encryptFrame(frame),
            (duration) => {
              self.postMessage({ 
                type: 'performance', 
                operation: 'encryption',
                duration,
                frameType: (frame as any).type || 'unknown'
              });
            }
          );
        }
        
        // Pass the frame to the next stage
        controller.enqueue(frame);
      }
    }))
    .pipeTo(transformer.writable)
    .catch((error: Error) => {
      console.error('Encryption transform error:', error);
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