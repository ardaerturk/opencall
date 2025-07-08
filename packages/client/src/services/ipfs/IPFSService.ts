import { create, IPFSHTTPClient } from 'ipfs-http-client';
import { MLSEncryptionService } from '../encryption/MLSEncryptionService';
import { EventEmitter } from 'events';

export interface FileUploadProgress {
  fileId: string;
  fileName: string;
  progress: number;
  total: number;
  status: 'preparing' | 'encrypting' | 'uploading' | 'complete' | 'error';
  ipfsHash?: string;
  error?: Error;
}

export interface SharedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  ipfsHash: string;
  encryptedSize: number;
  uploadedAt: number;
  uploadedBy: string;
}

export class IPFSService extends EventEmitter {
  private client: IPFSHTTPClient | null = null;
  private mlsService: MLSEncryptionService;
  private initialized = false;
  private uploads = new Map<string, FileUploadProgress>();

  constructor(mlsService: MLSEncryptionService) {
    super();
    this.mlsService = mlsService;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Connect to IPFS node - can be configured for local or remote node
      this.client = create({
        host: 'localhost',
        port: 5001,
        protocol: 'http'
      });

      // Test connection
      await this.client.version();
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize IPFS client:', error);
      throw new Error('IPFS initialization failed');
    }
  }

  async uploadFile(
    file: File,
    meetingId: string,
    onProgress?: (progress: FileUploadProgress) => void
  ): Promise<SharedFile> {
    if (!this.client) {
      throw new Error('IPFS client not initialized');
    }

    const fileId = crypto.randomUUID();
    const progress: FileUploadProgress = {
      fileId,
      fileName: file.name,
      progress: 0,
      total: file.size,
      status: 'preparing'
    };

    this.uploads.set(fileId, progress);
    this.emitProgress(progress, onProgress);

    try {
      // Read file as array buffer
      progress.status = 'encrypting';
      this.emitProgress(progress, onProgress);

      const arrayBuffer = await file.arrayBuffer();
      const fileData = new Uint8Array(arrayBuffer);

      // Encrypt file data using MLS
      const encryptedData = await this.mlsService.encryptData(fileData, meetingId);
      
      // Create metadata
      const metadata = {
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        uploadedAt: Date.now()
      };

      const encryptedMetadata = await this.mlsService.encryptData(
        new TextEncoder().encode(JSON.stringify(metadata)),
        meetingId
      );

      // Combine encrypted metadata and data
      const combinedData = new Uint8Array(
        4 + encryptedMetadata.length + encryptedData.length
      );
      
      // Write metadata length (4 bytes)
      new DataView(combinedData.buffer).setUint32(0, encryptedMetadata.length, true);
      
      // Write metadata and data
      combinedData.set(encryptedMetadata, 4);
      combinedData.set(encryptedData, 4 + encryptedMetadata.length);

      // Upload to IPFS
      progress.status = 'uploading';
      progress.total = combinedData.length;
      this.emitProgress(progress, onProgress);

      const result = await this.client.add(combinedData, {
        progress: (bytes) => {
          progress.progress = bytes;
          this.emitProgress(progress, onProgress);
        }
      });

      progress.status = 'complete';
      progress.ipfsHash = result.cid.toString();
      this.emitProgress(progress, onProgress);

      const sharedFile: SharedFile = {
        id: fileId,
        name: file.name,
        size: file.size,
        type: file.type,
        ipfsHash: result.cid.toString(),
        encryptedSize: combinedData.length,
        uploadedAt: Date.now(),
        uploadedBy: this.mlsService.getClientId()
      };

      return sharedFile;
    } catch (error) {
      progress.status = 'error';
      progress.error = error as Error;
      this.emitProgress(progress, onProgress);
      throw error;
    } finally {
      // Clean up after a delay
      setTimeout(() => this.uploads.delete(fileId), 5000);
    }
  }

  async downloadFile(
    ipfsHash: string,
    meetingId: string,
    onProgress?: (progress: number) => void
  ): Promise<{ file: Blob; metadata: any }> {
    if (!this.client) {
      throw new Error('IPFS client not initialized');
    }

    try {
      // Download from IPFS
      const chunks: Uint8Array[] = [];
      let totalSize = 0;

      for await (const chunk of this.client.cat(ipfsHash)) {
        chunks.push(chunk);
        totalSize += chunk.length;
        onProgress?.(totalSize);
      }

      // Combine chunks
      const combinedData = new Uint8Array(totalSize);
      let offset = 0;
      for (const chunk of chunks) {
        combinedData.set(chunk, offset);
        offset += chunk.length;
      }

      // Read metadata length
      const metadataLength = new DataView(combinedData.buffer).getUint32(0, true);
      
      // Extract and decrypt metadata
      const encryptedMetadata = combinedData.slice(4, 4 + metadataLength);
      const decryptedMetadata = await this.mlsService.decryptData(
        encryptedMetadata,
        meetingId
      );
      
      const metadata = JSON.parse(new TextDecoder().decode(decryptedMetadata));

      // Extract and decrypt file data
      const encryptedData = combinedData.slice(4 + metadataLength);
      const decryptedData = await this.mlsService.decryptData(
        encryptedData,
        meetingId
      );

      // Create blob with original file type
      const file = new Blob([decryptedData], { type: metadata.fileType });

      return { file, metadata };
    } catch (error) {
      console.error('Failed to download file from IPFS:', error);
      throw error;
    }
  }

  async pinFile(ipfsHash: string): Promise<void> {
    if (!this.client) {
      throw new Error('IPFS client not initialized');
    }

    await this.client.pin.add(ipfsHash);
  }

  async unpinFile(ipfsHash: string): Promise<void> {
    if (!this.client) {
      throw new Error('IPFS client not initialized');
    }

    await this.client.pin.rm(ipfsHash);
  }

  private emitProgress(
    progress: FileUploadProgress,
    callback?: (progress: FileUploadProgress) => void
  ): void {
    callback?.(progress);
    this.emit('uploadProgress', progress);
  }

  getUploadProgress(fileId: string): FileUploadProgress | undefined {
    return this.uploads.get(fileId);
  }

  getAllUploads(): FileUploadProgress[] {
    return Array.from(this.uploads.values());
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async disconnect(): Promise<void> {
    this.client = null;
    this.initialized = false;
    this.uploads.clear();
  }
}