import type { MLSClient as WasmMLSClient, MLSGroup as WasmMLSGroup, MLSCommit as WasmMLSCommit, MLSCiphertext as WasmMLSCiphertext } from './wasm/mls';
import type {
  MLSClientConfig,
  MLSGroup,
  MLSCommit,
  MLSCiphertext,
  MLSStorageProvider,
} from './types';
import { MLSError, MLSErrorCode } from './types';

let wasmModule: typeof import('./wasm/mls') | null = null;

export class MLSClient {
  private wasmClient?: WasmMLSClient;
  private groups = new Map<string, MLSGroupWrapper>();
  private storage?: MLSStorageProvider;

  constructor(private config: MLSClientConfig) {
    this.storage = config.storageProvider;
  }

  async initialize(): Promise<void> {
    if (!wasmModule) {
      try {
        wasmModule = await import('./wasm/mls');
        await wasmModule.default();
      } catch (error) {
        throw new MLSError(
          `Failed to load MLS WASM module: ${error}`,
          MLSErrorCode.INITIALIZATION_FAILED
        );
      }
    }

    try {
      this.wasmClient = wasmModule.MLSClient.initialize(this.config.identity);
    } catch (error) {
      throw new MLSError(
        `Failed to initialize MLS client: ${error}`,
        MLSErrorCode.INITIALIZATION_FAILED
      );
    }
  }

  async createGroup(groupId: string): Promise<MLSGroup> {
    if (!this.wasmClient) {
      throw new MLSError('Client not initialized', MLSErrorCode.INITIALIZATION_FAILED);
    }

    try {
      const groupIdBytes = new TextEncoder().encode(groupId);
      const wasmGroup = this.wasmClient.createGroup(groupIdBytes);
      
      const group = new MLSGroupWrapper(groupId, wasmGroup, this.storage);
      this.groups.set(groupId, group);
      
      if (this.storage) {
        await this.storage.saveGroupState(groupId, await group.serialize());
      }
      
      return group;
    } catch (error) {
      throw new MLSError(
        `Failed to create group: ${error}`,
        MLSErrorCode.GROUP_NOT_FOUND
      );
    }
  }

  async joinGroup(welcome: Uint8Array): Promise<MLSGroup> {
    if (!this.wasmClient) {
      throw new MLSError('Client not initialized', MLSErrorCode.INITIALIZATION_FAILED);
    }

    try {
      const wasmGroup = this.wasmClient.joinGroup(welcome);
      const groupId = crypto.randomUUID(); // Extract from welcome in real implementation
      
      const group = new MLSGroupWrapper(groupId, wasmGroup, this.storage);
      this.groups.set(groupId, group);
      
      if (this.storage) {
        await this.storage.saveGroupState(groupId, await group.serialize());
      }
      
      return group;
    } catch (error) {
      throw new MLSError(
        `Failed to join group: ${error}`,
        MLSErrorCode.GROUP_NOT_FOUND
      );
    }
  }

  async exportKeyPackage(): Promise<Uint8Array> {
    if (!this.wasmClient) {
      throw new MLSError('Client not initialized', MLSErrorCode.INITIALIZATION_FAILED);
    }

    try {
      return this.wasmClient.exportKeyPackage();
    } catch (error) {
      throw new MLSError(
        `Failed to export key package: ${error}`,
        MLSErrorCode.INVALID_KEY_PACKAGE
      );
    }
  }

  getGroup(groupId: string): MLSGroup | undefined {
    return this.groups.get(groupId);
  }
}

class MLSGroupWrapper implements MLSGroup {
  constructor(
    private groupId: string,
    private wasmGroup: WasmMLSGroup,
    private storage?: MLSStorageProvider
  ) {}

  async addMember(keyPackage: Uint8Array): Promise<MLSCommit> {
    try {
      const result = this.wasmGroup.addMember(keyPackage);
      await this.saveState();
      return result;
    } catch (error) {
      throw new MLSError(
        `Failed to add member: ${error}`,
        MLSErrorCode.MEMBER_NOT_FOUND
      );
    }
  }

  async removeMember(memberId: string): Promise<MLSCommit> {
    try {
      const result = this.wasmGroup.removeMember(memberId);
      await this.saveState();
      return result;
    } catch (error) {
      throw new MLSError(
        `Failed to remove member: ${error}`,
        MLSErrorCode.MEMBER_NOT_FOUND
      );
    }
  }

  async encrypt(plaintext: Uint8Array): Promise<MLSCiphertext> {
    try {
      const result = this.wasmGroup.encryptMessage(plaintext);
      return result as MLSCiphertext;
    } catch (error) {
      throw new MLSError(
        `Failed to encrypt: ${error}`,
        MLSErrorCode.ENCRYPTION_FAILED
      );
    }
  }

  async decrypt(ciphertext: MLSCiphertext): Promise<Uint8Array> {
    try {
      const result = this.wasmGroup.decryptMessage(ciphertext.data);
      await this.saveState();
      return result;
    } catch (error) {
      throw new MLSError(
        `Failed to decrypt: ${error}`,
        MLSErrorCode.DECRYPTION_FAILED
      );
    }
  }

  getCurrentEpoch(): number {
    return this.wasmGroup.getCurrentEpoch();
  }

  async processCommit(commitData: Uint8Array): Promise<void> {
    try {
      this.wasmGroup.processCommit(commitData);
      await this.saveState();
    } catch (error) {
      throw new MLSError(
        `Failed to process commit: ${error}`,
        MLSErrorCode.EPOCH_MISMATCH
      );
    }
  }

  async serialize(): Promise<Uint8Array> {
    // In real implementation, serialize the group state
    return new Uint8Array();
  }

  private async saveState(): Promise<void> {
    if (this.storage) {
      await this.storage.saveGroupState(this.groupId, await this.serialize());
    }
  }
}