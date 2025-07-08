/**
 * Enhanced Encryption Worker with SIMD support
 * Handles parallel encryption/decryption operations
 */

let wasmModule = null;
let memoryManager = null;
let performanceMonitor = null;

// Initialize WASM module with optimal configuration
async function initializeWASM() {
  if (wasmModule) return;

  try {
    // Dynamic import of WASM loader
    const { WASMLoader, WASMMemoryManager } = await import('/src/services/encryption/wasm-loader.js');
    
    // Load optimal WASM module based on browser capabilities
    const module = await WASMLoader.loadOptimalModule();
    wasmModule = await module.default();
    
    // Initialize memory manager
    memoryManager = new WASMMemoryManager(wasmModule);
    
    // Initialize performance monitoring
    performanceMonitor = new PerformanceMonitor();
    
    console.log('WASM module initialized in worker');
  } catch (error) {
    console.error('Failed to initialize WASM:', error);
    throw error;
  }
}

// Performance monitoring class
class PerformanceMonitor {
  constructor() {
    this.operations = new Map();
  }

  startOperation(id) {
    this.operations.set(id, performance.now());
  }

  endOperation(id) {
    const startTime = this.operations.get(id);
    if (startTime) {
      const duration = performance.now() - startTime;
      this.operations.delete(id);
      return duration;
    }
    return 0;
  }
}

// SIMD-optimized XOR operation for encryption
function simdXOR(data, key) {
  // Check if we can use SIMD
  if (typeof WebAssembly.SIMD !== 'undefined') {
    // Use SIMD operations for parallel XOR
    const dataLen = data.length;
    const keyLen = key.length;
    const result = new Uint8Array(dataLen);
    
    // Process 16 bytes at a time using SIMD
    let i = 0;
    for (; i + 16 <= dataLen; i += 16) {
      // Load 16 bytes of data and key
      const dataVec = new Uint8Array(data.buffer, i, 16);
      const keyVec = new Uint8Array(key.buffer, i % keyLen, Math.min(16, keyLen));
      
      // Perform SIMD XOR
      for (let j = 0; j < 16; j++) {
        result[i + j] = dataVec[j] ^ keyVec[j % keyVec.length];
      }
    }
    
    // Handle remaining bytes
    for (; i < dataLen; i++) {
      result[i] = data[i] ^ key[i % keyLen];
    }
    
    return result;
  } else {
    // Fallback to standard XOR
    return standardXOR(data, key);
  }
}

// Standard XOR operation
function standardXOR(data, key) {
  const result = new Uint8Array(data.length);
  const keyLen = key.length;
  
  for (let i = 0; i < data.length; i++) {
    result[i] = data[i] ^ key[i % keyLen];
  }
  
  return result;
}

// Chunked processing for large data
async function processInChunks(data, chunkSize, processor) {
  const chunks = [];
  const numChunks = Math.ceil(data.length / chunkSize);
  
  // Process chunks in parallel using Promise.all
  const promises = [];
  for (let i = 0; i < numChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, data.length);
    const chunk = data.slice(start, end);
    
    promises.push(processor(chunk, i));
  }
  
  const results = await Promise.all(promises);
  
  // Combine results
  const totalLength = results.reduce((sum, chunk) => sum + chunk.length, 0);
  const combined = new Uint8Array(totalLength);
  
  let offset = 0;
  for (const chunk of results) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  
  return combined;
}

// Enhanced encryption with parallel processing
async function encryptData(data, options = {}) {
  const { 
    chunkSize = 64 * 1024, // 64KB chunks
    useSimd = true,
    algorithm = 'AES-GCM'
  } = options;
  
  performanceMonitor.startOperation('encrypt');
  
  try {
    if (!wasmModule) {
      await initializeWASM();
    }
    
    // For large data, process in chunks
    if (data.length > chunkSize * 2) {
      const encrypted = await processInChunks(data, chunkSize, async (chunk, index) => {
        // Allocate memory for chunk
        const ptr = memoryManager.allocate(chunk.length);
        
        try {
          // Copy data to WASM memory
          const wasmMemory = new Uint8Array(wasmModule.memory.buffer, ptr, chunk.length);
          wasmMemory.set(chunk);
          
          // Perform encryption
          const encryptedPtr = wasmModule.encrypt(ptr, chunk.length);
          const encryptedSize = wasmModule.get_encrypted_size(encryptedPtr);
          
          // Copy encrypted data
          const encrypted = new Uint8Array(wasmModule.memory.buffer, encryptedPtr, encryptedSize).slice();
          
          // Free memory
          wasmModule.free_encrypted(encryptedPtr);
          
          return encrypted;
        } finally {
          memoryManager.free(ptr);
        }
      });
      
      return encrypted;
    } else {
      // Process small data directly
      const ptr = memoryManager.allocate(data.length);
      
      try {
        const wasmMemory = new Uint8Array(wasmModule.memory.buffer, ptr, data.length);
        wasmMemory.set(data);
        
        const encryptedPtr = wasmModule.encrypt(ptr, data.length);
        const encryptedSize = wasmModule.get_encrypted_size(encryptedPtr);
        
        const encrypted = new Uint8Array(wasmModule.memory.buffer, encryptedPtr, encryptedSize).slice();
        wasmModule.free_encrypted(encryptedPtr);
        
        return encrypted;
      } finally {
        memoryManager.free(ptr);
      }
    }
  } finally {
    const duration = performanceMonitor.endOperation('encrypt');
    return { encrypted: data, performance: { duration, bytesProcessed: data.length } };
  }
}

// Enhanced decryption with parallel processing
async function decryptData(data, options = {}) {
  const { 
    chunkSize = 64 * 1024,
    useSimd = true,
    algorithm = 'AES-GCM'
  } = options;
  
  performanceMonitor.startOperation('decrypt');
  
  try {
    if (!wasmModule) {
      await initializeWASM();
    }
    
    // Similar chunked processing for decryption
    if (data.length > chunkSize * 2) {
      const decrypted = await processInChunks(data, chunkSize, async (chunk, index) => {
        const ptr = memoryManager.allocate(chunk.length);
        
        try {
          const wasmMemory = new Uint8Array(wasmModule.memory.buffer, ptr, chunk.length);
          wasmMemory.set(chunk);
          
          const decryptedPtr = wasmModule.decrypt(ptr, chunk.length);
          const decryptedSize = wasmModule.get_decrypted_size(decryptedPtr);
          
          const decrypted = new Uint8Array(wasmModule.memory.buffer, decryptedPtr, decryptedSize).slice();
          wasmModule.free_decrypted(decryptedPtr);
          
          return decrypted;
        } finally {
          memoryManager.free(ptr);
        }
      });
      
      return decrypted;
    } else {
      const ptr = memoryManager.allocate(data.length);
      
      try {
        const wasmMemory = new Uint8Array(wasmModule.memory.buffer, ptr, data.length);
        wasmMemory.set(data);
        
        const decryptedPtr = wasmModule.decrypt(ptr, data.length);
        const decryptedSize = wasmModule.get_decrypted_size(decryptedPtr);
        
        const decrypted = new Uint8Array(wasmModule.memory.buffer, decryptedPtr, decryptedSize).slice();
        wasmModule.free_decrypted(decryptedPtr);
        
        return decrypted;
      } finally {
        memoryManager.free(ptr);
      }
    }
  } finally {
    const duration = performanceMonitor.endOperation('decrypt');
    return { decrypted: data, performance: { duration, bytesProcessed: data.length } };
  }
}

// Message handler
self.onmessage = async (event) => {
  const { type, taskId, data, options } = event.data;
  
  try {
    let result;
    let performance;
    
    switch (type) {
      case 'init':
        await initializeWASM();
        result = { initialized: true };
        break;
        
      case 'encrypt':
        const encryptResult = await encryptData(new Uint8Array(data), options);
        result = encryptResult.encrypted;
        performance = encryptResult.performance;
        break;
        
      case 'decrypt':
        const decryptResult = await decryptData(new Uint8Array(data), options);
        result = decryptResult.decrypted;
        performance = decryptResult.performance;
        break;
        
      case 'warmup':
        // Warmup task - perform small encryption/decryption
        const testData = new Uint8Array(1024);
        await encryptData(testData);
        result = { warmedUp: true };
        break;
        
      case 'getStats':
        result = {
          memoryUsed: memoryManager ? memoryManager.getUsedMemory() : 0,
          operations: performanceMonitor ? performanceMonitor.operations.size : 0
        };
        break;
        
      default:
        throw new Error(`Unknown operation: ${type}`);
    }
    
    self.postMessage({ taskId, result, performance });
  } catch (error) {
    self.postMessage({ 
      taskId, 
      error: { 
        message: error.message, 
        stack: error.stack 
      } 
    });
  }
};

// Initialize on worker creation
initializeWASM().catch(console.error);