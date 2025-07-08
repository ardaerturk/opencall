import { MLSKeyPackage, MLSCredential, CryptoConfig, DEFAULT_CRYPTO_CONFIG } from '@opencall/core';
import { EventEmitter } from 'events';

export interface MLSMember {
  id: string;
  keyPackage: MLSKeyPackage;
  encryptionKey: CryptoKey;
  currentKeyId: number;
}

export interface MLSGroup {
  id: string;
  members: Map<string, MLSMember>;
  epochKey: CryptoKey;
  epoch: number;
}

export interface EncryptionContext {
  groupId: string;
  senderId: string;
  keyId: number;
  timestamp: number;
}

export class MLSEncryptionService extends EventEmitter {
  private groups: Map<string, MLSGroup> = new Map();
  private identity: MLSCredential | null = null;
  private keyPairs: Map<string, CryptoKeyPair> = new Map();
  private config: CryptoConfig;
  private currentUserId: string | null = null;

  constructor(config?: Partial<CryptoConfig>) {
    super();
    this.config = { ...DEFAULT_CRYPTO_CONFIG, ...config };
  }

  async initialize(userId: string): Promise<void> {
    this.currentUserId = userId;
    
    // Generate identity key pair
    const identityKeyPair = await crypto.subtle.generateKey(
      {
        name: 'ECDSA',
        namedCurve: 'P-256'
      },
      true,
      ['sign', 'verify']
    );
    
    this.keyPairs.set('identity', identityKeyPair);
    
    // Create MLS credential
    const publicKeyData = await crypto.subtle.exportKey('raw', identityKeyPair.publicKey);
    this.identity = {
      identity: new TextEncoder().encode(userId),
      signature_key: new Uint8Array(publicKeyData)
    };
  }

  async createGroup(groupId: string): Promise<MLSGroup> {
    if (!this.currentUserId || !this.identity) {
      throw new Error('Service not initialized');
    }

    // Generate group epoch key
    const epochKey = await crypto.subtle.generateKey(
      {
        name: 'AES-GCM',
        length: this.config.keyLength
      },
      true,
      ['encrypt', 'decrypt']
    );

    const group: MLSGroup = {
      id: groupId,
      members: new Map(),
      epochKey,
      epoch: 0
    };

    // Add self as first member
    const selfMember: MLSMember = {
      id: this.currentUserId,
      keyPackage: await this.generateKeyPackage(),
      encryptionKey: epochKey,
      currentKeyId: 0
    };

    group.members.set(this.currentUserId, selfMember);
    this.groups.set(groupId, group);

    this.emit('groupCreated', { groupId, epoch: 0 });
    return group;
  }

  async generateKeyPackage(): Promise<MLSKeyPackage> {
    if (!this.identity) {
      throw new Error('Service not initialized');
    }

    // Generate ephemeral key pair for this package
    const ephemeralKeyPair = await crypto.subtle.generateKey(
      {
        name: 'ECDH',
        namedCurve: 'P-256'
      },
      true,
      ['deriveKey', 'deriveBits']
    );

    // Export public key
    const publicKeyData = await crypto.subtle.exportKey('raw', ephemeralKeyPair.publicKey);
    
    // Create package data
    const packageData = new Uint8Array([
      ...this.identity.identity,
      ...new Uint8Array(publicKeyData),
      ...new Uint8Array([0, 0, 0, 1]) // Version
    ]);

    // Sign the package
    const identityKeyPair = this.keyPairs.get('identity');
    if (!identityKeyPair) {
      throw new Error('Identity key pair not found');
    }

    const signature = await crypto.subtle.sign(
      {
        name: 'ECDSA',
        hash: 'SHA-256'
      },
      identityKeyPair.privateKey,
      packageData
    );

    return {
      data: packageData,
      signature: new Uint8Array(signature),
      credential: this.identity
    };
  }

  async addMember(groupId: string, memberId: string, keyPackage: MLSKeyPackage): Promise<void> {
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error(`Group ${groupId} not found`);
    }

    // Verify key package signature
    const isValid = await this.verifyKeyPackage(keyPackage);
    if (!isValid) {
      throw new Error('Invalid key package signature');
    }

    // Derive shared encryption key for new member
    const memberKey = await this.deriveKeyForMember(group.epochKey, memberId);

    const member: MLSMember = {
      id: memberId,
      keyPackage,
      encryptionKey: memberKey,
      currentKeyId: 0
    };

    group.members.set(memberId, member);
    
    // Increment epoch and rotate keys
    await this.rotateGroupKeys(groupId);
    
    this.emit('memberAdded', { groupId, memberId, epoch: group.epoch });
  }

  async removeMember(groupId: string, memberId: string): Promise<void> {
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error(`Group ${groupId} not found`);
    }

    group.members.delete(memberId);
    
    // Rotate keys after member removal
    await this.rotateGroupKeys(groupId);
    
    this.emit('memberRemoved', { groupId, memberId, epoch: group.epoch });
  }

  private async rotateGroupKeys(groupId: string): Promise<void> {
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error(`Group ${groupId} not found`);
    }

    // Generate new epoch key
    const newEpochKey = await crypto.subtle.generateKey(
      {
        name: 'AES-GCM',
        length: this.config.keyLength
      },
      true,
      ['encrypt', 'decrypt']
    );

    group.epochKey = newEpochKey;
    group.epoch++;

    // Update all member keys
    for (const [memberId, member] of group.members) {
      member.encryptionKey = await this.deriveKeyForMember(newEpochKey, memberId);
      member.currentKeyId++;
    }

    this.emit('keysRotated', { groupId, epoch: group.epoch });
  }

  private async deriveKeyForMember(epochKey: CryptoKey, memberId: string): Promise<CryptoKey> {
    // Export epoch key
    const epochKeyData = await crypto.subtle.exportKey('raw', epochKey);
    
    // Derive member-specific key using HKDF
    const memberInfo = new TextEncoder().encode(`member-${memberId}`);
    const derivedKeyMaterial = await crypto.subtle.importKey(
      'raw',
      epochKeyData,
      'HKDF',
      false,
      ['deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new Uint8Array(32),
        info: memberInfo
      },
      derivedKeyMaterial,
      {
        name: 'AES-GCM',
        length: this.config.keyLength
      },
      true,
      ['encrypt', 'decrypt']
    );
  }

  private async verifyKeyPackage(keyPackage: MLSKeyPackage): Promise<boolean> {
    try {
      // Import the signature key from the credential
      const signatureKey = await crypto.subtle.importKey(
        'raw',
        keyPackage.credential.signature_key,
        {
          name: 'ECDSA',
          namedCurve: 'P-256'
        },
        false,
        ['verify']
      );

      // Verify the signature
      return crypto.subtle.verify(
        {
          name: 'ECDSA',
          hash: 'SHA-256'
        },
        signatureKey,
        keyPackage.signature,
        keyPackage.data
      );
    } catch (error) {
      console.error('Key package verification failed:', error);
      return false;
    }
  }

  async getEncryptionKey(groupId: string, memberId: string): Promise<CryptoKey | null> {
    const group = this.groups.get(groupId);
    if (!group) {
      return null;
    }

    const member = group.members.get(memberId);
    return member?.encryptionKey || null;
  }

  async getCurrentKeyId(groupId: string, memberId: string): Promise<number> {
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error(`Group ${groupId} not found`);
    }

    const member = group.members.get(memberId);
    if (!member) {
      throw new Error(`Member ${memberId} not found in group`);
    }

    return member.currentKeyId;
  }

  getGroup(groupId: string): MLSGroup | undefined {
    return this.groups.get(groupId);
  }

  async exportKeyPackage(): Promise<MLSKeyPackage> {
    if (!this.identity) {
      throw new Error('Service not initialized');
    }
    return this.generateKeyPackage();
  }

  // Data encryption/decryption methods for collaboration features
  async encryptData(data: Uint8Array, groupId: string): Promise<Uint8Array> {
    if (!this.currentUserId) {
      throw new Error('Service not initialized');
    }

    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error(`Group ${groupId} not found`);
    }

    const member = group.members.get(this.currentUserId);
    if (!member) {
      throw new Error('Current user not a member of group');
    }

    // Generate IV
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Encrypt data
    const encryptedData = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv
      },
      member.encryptionKey,
      data
    );

    // Create context
    const context: EncryptionContext = {
      groupId,
      senderId: this.currentUserId,
      keyId: member.currentKeyId,
      timestamp: Date.now()
    };

    // Serialize context
    const contextData = new TextEncoder().encode(JSON.stringify(context));
    
    // Combine: [context length (4 bytes)] [context] [iv (12 bytes)] [encrypted data]
    const result = new Uint8Array(4 + contextData.length + 12 + encryptedData.byteLength);
    const view = new DataView(result.buffer);
    
    // Write context length
    view.setUint32(0, contextData.length, true);
    
    // Write context
    result.set(contextData, 4);
    
    // Write IV
    result.set(iv, 4 + contextData.length);
    
    // Write encrypted data
    result.set(new Uint8Array(encryptedData), 4 + contextData.length + 12);

    return result;
  }

  async decryptData(encryptedData: Uint8Array, groupId: string): Promise<Uint8Array> {
    if (encryptedData.length < 16) {
      throw new Error('Invalid encrypted data');
    }

    const view = new DataView(encryptedData.buffer);
    
    // Read context length
    const contextLength = view.getUint32(0, true);
    
    if (encryptedData.length < 4 + contextLength + 12) {
      throw new Error('Invalid encrypted data format');
    }

    // Read context
    const contextData = encryptedData.slice(4, 4 + contextLength);
    const context: EncryptionContext = JSON.parse(new TextDecoder().decode(contextData));

    // Verify group
    if (context.groupId !== groupId) {
      throw new Error('Group ID mismatch');
    }

    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error(`Group ${groupId} not found`);
    }

    const member = group.members.get(context.senderId);
    if (!member) {
      throw new Error(`Sender ${context.senderId} not found in group`);
    }

    // Read IV
    const iv = encryptedData.slice(4 + contextLength, 4 + contextLength + 12);
    
    // Read encrypted data
    const ciphertext = encryptedData.slice(4 + contextLength + 12);

    // Decrypt
    try {
      const decrypted = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv
        },
        member.encryptionKey,
        ciphertext
      );

      return new Uint8Array(decrypted);
    } catch (error) {
      throw new Error('Decryption failed: ' + (error as Error).message);
    }
  }

  getClientId(): string {
    if (!this.currentUserId) {
      throw new Error('Service not initialized');
    }
    return this.currentUserId;
  }

  cleanup(): void {
    this.groups.clear();
    this.keyPairs.clear();
    this.identity = null;
    this.currentUserId = null;
    this.removeAllListeners();
  }
}

// Singleton instance
export const mlsEncryptionService = new MLSEncryptionService();