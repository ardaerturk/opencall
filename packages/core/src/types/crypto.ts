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

// SRP Authentication Types
export interface AuthenticationSession {
  sessionId: string;
  identity: string;
  sessionKey?: Uint8Array;
  expiresAt: number;
  isAuthenticated: boolean;
}

export interface AuthenticationRequest {
  identity: string;
  publicKey: string; // Base64 encoded
}

export interface AuthenticationChallenge {
  sessionId: string;
  salt: string; // Base64 encoded
  serverPublicKey: string; // Base64 encoded
}

export interface AuthenticationProof {
  sessionId: string;
  clientPublicKey: string; // Base64 encoded
  proof: string; // Base64 encoded M1
}

export interface AuthenticationResponse {
  success: boolean;
  sessionKey?: string; // Base64 encoded
  serverProof?: string; // Base64 encoded M2
  token?: string; // JWT for session management
  expiresIn?: number; // Seconds until expiration
}

export interface EphemeralIdentity {
  id: string;
  publicKey: CryptoKey;
  privateKey: CryptoKey;
  certificate?: string; // Optional self-signed certificate
  createdAt: number;
  expiresAt: number;
}