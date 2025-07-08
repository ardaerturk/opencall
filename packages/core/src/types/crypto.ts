export interface KeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

export interface EncryptedData {
  ciphertext: ArrayBuffer;
  iv: ArrayBuffer;
  salt?: ArrayBuffer;
  tag?: ArrayBuffer;
}

export interface ZKProof {
  commitment: string;
  challenge: string;
  response: string;
  timestamp: number;
}

export interface MLSCredential {
  identity: Uint8Array;
  signature_key: Uint8Array;
}

export interface MLSKeyPackage {
  data: Uint8Array;
  signature: Uint8Array;
  credential: MLSCredential;
}

export interface CryptoConfig {
  algorithm: 'AES-GCM' | 'ChaCha20-Poly1305';
  keyLength: 128 | 256;
  pbkdfIterations: number;
  saltLength: number;
}

export const DEFAULT_CRYPTO_CONFIG: CryptoConfig = {
  algorithm: 'AES-GCM',
  keyLength: 256,
  pbkdfIterations: 100000,
  saltLength: 32,
};
