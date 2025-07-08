export interface MLSClientConfig {
  identity: string;
  storageProvider?: MLSStorageProvider;
}

export interface MLSStorageProvider {
  saveKeyPackage(id: string, data: Uint8Array): Promise<void>;
  loadKeyPackage(id: string): Promise<Uint8Array | null>;
  deleteKeyPackage(id: string): Promise<void>;
  saveGroupState(groupId: string, state: Uint8Array): Promise<void>;
  loadGroupState(groupId: string): Promise<Uint8Array | null>;
}

export interface MLSGroup {
  addMember(keyPackage: Uint8Array): Promise<MLSCommit>;
  removeMember(memberId: string): Promise<MLSCommit>;
  encrypt(plaintext: Uint8Array): Promise<MLSCiphertext>;
  decrypt(ciphertext: MLSCiphertext): Promise<Uint8Array>;
  getCurrentEpoch(): number;
  processCommit(commitData: Uint8Array): Promise<void>;
}

export interface MLSCommit {
  commit: Uint8Array;
  welcome: Uint8Array[];
}

export interface MLSCiphertext {
  data: Uint8Array;
  epoch: number;
}

export interface GroupInfo {
  id: string;
  epoch: number;
  members: MemberInfo[];
}

export interface MemberInfo {
  id: string;
  credential: Uint8Array;
  addedAtEpoch: number;
}

export class MLSError extends Error {
  constructor(message: string, public code: MLSErrorCode) {
    super(message);
    this.name = 'MLSError';
  }
}

export enum MLSErrorCode {
  INITIALIZATION_FAILED = 'INITIALIZATION_FAILED',
  GROUP_NOT_FOUND = 'GROUP_NOT_FOUND',
  MEMBER_NOT_FOUND = 'MEMBER_NOT_FOUND',
  ENCRYPTION_FAILED = 'ENCRYPTION_FAILED',
  DECRYPTION_FAILED = 'DECRYPTION_FAILED',
  INVALID_KEY_PACKAGE = 'INVALID_KEY_PACKAGE',
  EPOCH_MISMATCH = 'EPOCH_MISMATCH',
}