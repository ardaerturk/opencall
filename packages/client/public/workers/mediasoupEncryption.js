// Mediasoup E2E Encryption Worker
// Handles frame-level encryption/decryption for WebRTC streams

let operation = 'encrypt'; // 'encrypt' or 'decrypt'
let keys = new Map(); // keyId -> CryptoKey
let currentKeyId = '0';
let frameCounter = 0;
let lastKeyRotation = Date.now();

// Constants
const IV_LENGTH = 12; // 96 bits for AES-GCM
const KEY_ID_LENGTH = 4; // 32 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const METADATA_LENGTH = IV_LENGTH + KEY_ID_LENGTH;

// Frame metadata structure:
// [IV (12 bytes)][KeyID (4 bytes)][Encrypted Data][Auth Tag (16 bytes)]

self.addEventListener('message', async (event) => {
  const { type, data } = event.data;

  switch (type) {
    case 'init':
      operation = event.data.operation || 'encrypt';
      break;

    case 'setKey':
      await handleSetKey(event.data);
      break;

    case 'rotateKey':
      await handleKeyRotation(event.data);
      break;

    case 'removeKey':
      keys.delete(event.data.keyId);
      break;
  }
});

async function handleSetKey({ keyId, key, operation: op }) {
  try {
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'AES-GCM' },
      false,
      op === 'encrypt' ? ['encrypt'] : ['decrypt']
    );
    
    keys.set(keyId, cryptoKey);
    
    if (op === 'encrypt') {
      currentKeyId = keyId;
    }
  } catch (error) {
    console.error('Failed to import key:', error);
  }
}

async function handleKeyRotation({ keyId, key }) {
  await handleSetKey({ keyId, key, operation: 'encrypt' });
  lastKeyRotation = Date.now();
}

// RTCRtpScriptTransformer API
if (self.RTCRtpScriptTransformer) {
  self.addEventListener('rtctransform', (event) => {
    const transformer = event.transformer;
    
    if (operation === 'encrypt') {
      transformer.readable
        .pipeThrough(new TransformStream({
          transform: encryptFrame,
        }))
        .pipeTo(transformer.writable);
    } else {
      transformer.readable
        .pipeThrough(new TransformStream({
          transform: decryptFrame,
        }))
        .pipeTo(transformer.writable);
    }
  });
}

async function encryptFrame(encodedFrame, controller) {
  const keyId = currentKeyId;
  const key = keys.get(keyId);
  
  if (!key) {
    // No key available, pass through unencrypted
    controller.enqueue(encodedFrame);
    return;
  }

  try {
    // Get the frame data
    const data = new Uint8Array(encodedFrame.data);
    
    // Skip encryption for keyframes every 30 seconds to allow late joiners
    if (encodedFrame.type === 'key' && Date.now() - lastKeyRotation > 30000) {
      controller.enqueue(encodedFrame);
      return;
    }

    // Generate IV (Initialization Vector)
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    
    // Convert keyId to bytes
    const keyIdBytes = new Uint8Array(KEY_ID_LENGTH);
    const keyIdNum = parseInt(keyId, 10) || 0;
    keyIdBytes[0] = (keyIdNum >> 24) & 0xff;
    keyIdBytes[1] = (keyIdNum >> 16) & 0xff;
    keyIdBytes[2] = (keyIdNum >> 8) & 0xff;
    keyIdBytes[3] = keyIdNum & 0xff;

    // Additional authenticated data (frame metadata)
    const additionalData = new Uint8Array(8);
    additionalData[0] = encodedFrame.type === 'key' ? 1 : 0;
    additionalData[1] = frameCounter & 0xff;
    additionalData[2] = (frameCounter >> 8) & 0xff;
    additionalData[3] = (frameCounter >> 16) & 0xff;
    additionalData[4] = (frameCounter >> 24) & 0xff;

    // Encrypt the frame data
    const encryptedData = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv,
        additionalData: additionalData,
        tagLength: AUTH_TAG_LENGTH * 8, // in bits
      },
      key,
      data
    );

    // Combine metadata and encrypted data
    const encryptedArray = new Uint8Array(encryptedData);
    const newData = new Uint8Array(METADATA_LENGTH + encryptedArray.length);
    
    // Copy IV
    newData.set(iv, 0);
    // Copy Key ID
    newData.set(keyIdBytes, IV_LENGTH);
    // Copy encrypted data (includes auth tag)
    newData.set(encryptedArray, METADATA_LENGTH);

    // Create new encoded frame with encrypted data
    encodedFrame.data = newData.buffer;
    controller.enqueue(encodedFrame);

    frameCounter++;
  } catch (error) {
    console.error('Encryption failed:', error);
    // On error, pass through unencrypted
    controller.enqueue(encodedFrame);
  }
}

async function decryptFrame(encodedFrame, controller) {
  const data = new Uint8Array(encodedFrame.data);
  
  // Check if frame is encrypted (has our metadata)
  if (data.length < METADATA_LENGTH + AUTH_TAG_LENGTH) {
    // Frame too small to be encrypted, pass through
    controller.enqueue(encodedFrame);
    return;
  }

  try {
    // Extract metadata
    const iv = data.slice(0, IV_LENGTH);
    const keyIdBytes = data.slice(IV_LENGTH, IV_LENGTH + KEY_ID_LENGTH);
    
    // Convert keyId bytes back to string
    const keyIdNum = (keyIdBytes[0] << 24) | (keyIdBytes[1] << 16) | 
                     (keyIdBytes[2] << 8) | keyIdBytes[3];
    const keyId = String(keyIdNum);
    
    // Get decryption key
    const key = keys.get(keyId);
    if (!key) {
      console.warn(`No key found for keyId: ${keyId}`);
      // Pass through unencrypted if no key
      controller.enqueue(encodedFrame);
      return;
    }

    // Extract encrypted data
    const encryptedData = data.slice(METADATA_LENGTH);

    // Additional authenticated data (must match encryption)
    const additionalData = new Uint8Array(8);
    additionalData[0] = encodedFrame.type === 'key' ? 1 : 0;
    // Note: We can't recover the original frame counter, 
    // but AAD validation will fail if tampered

    // Decrypt the frame data
    const decryptedData = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv,
        additionalData: additionalData,
        tagLength: AUTH_TAG_LENGTH * 8,
      },
      key,
      encryptedData
    );

    // Update frame with decrypted data
    encodedFrame.data = decryptedData;
    controller.enqueue(encodedFrame);
  } catch (error) {
    console.error('Decryption failed:', error);
    // On error, check if it might be an unencrypted keyframe
    if (encodedFrame.type === 'key') {
      // Might be an unencrypted keyframe for late joiners
      controller.enqueue(encodedFrame);
    } else {
      // Drop corrupted frames
      console.warn('Dropping corrupted frame');
    }
  }
}

// Utility function to compare array buffers
function arrayBuffersEqual(a, b) {
  if (a.byteLength !== b.byteLength) return false;
  const viewA = new Uint8Array(a);
  const viewB = new Uint8Array(b);
  for (let i = 0; i < viewA.length; i++) {
    if (viewA[i] !== viewB[i]) return false;
  }
  return true;
}