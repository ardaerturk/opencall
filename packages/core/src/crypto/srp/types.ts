/**
 * SRP (Secure Remote Password) types for zero-knowledge authentication
 */

export interface SRPParameters {
  N: bigint; // Large safe prime
  g: bigint; // Generator
  k: bigint; // Multiplier parameter (k = H(N, g))
  H: (data: Uint8Array) => Promise<Uint8Array>; // Hash function
}

export interface SRPClientSession {
  identity: string;
  password: string;
  salt: Uint8Array;
  privateKey: bigint; // a
  publicKey: bigint; // A = g^a mod N
  serverPublicKey?: bigint; // B
  sharedSecret?: bigint; // S
  sessionKey?: Uint8Array; // K = H(S)
  M1?: Uint8Array; // Client proof
  M2?: Uint8Array; // Server proof
}

export interface SRPServerSession {
  identity: string;
  salt: Uint8Array;
  verifier: bigint; // v = g^x mod N where x = H(salt, identity, password)
  privateKey: bigint; // b
  publicKey: bigint; // B = kv + g^b mod N
  clientPublicKey?: bigint; // A
  sharedSecret?: bigint; // S
  sessionKey?: Uint8Array; // K = H(S)
  M1?: Uint8Array; // Expected client proof
  M2?: Uint8Array; // Server proof
}

export interface SRPVerifier {
  identity: string;
  salt: Uint8Array;
  verifier: bigint;
}

export interface SRPChallenge {
  salt: Uint8Array;
  serverPublicKey: bigint;
  sessionId: string;
}

export interface SRPProof {
  clientPublicKey: bigint;
  proof: Uint8Array; // M1
  sessionId: string;
}

export interface SRPVerificationResult {
  success: boolean;
  sessionKey?: Uint8Array;
  serverProof?: Uint8Array; // M2
}

// Standard SRP-6a parameters (2048-bit)
export const SRP_PARAMS_2048: Omit<SRPParameters, 'H'> = {
  // NIST-recommended 2048-bit prime from RFC 5054
  N: BigInt('0x' + 
    'AC6BDB41324A9A9BF166DE5E1389582FAF72B6651987EE07FC3192943DB56050' +
    'A37329CBB4A099ED8193E0757767A13DD52312AB4B03310DCD7F48A9DA04FD50' +
    'E8083969EDB767B0CF6095179A163AB3661A05FBD5FAAAE82918A9962F0B93B8' +
    '55F97993EC975EEAA80D740ADBF4FF747359D041D5C33EA71D281E446B14773B' +
    'CA97B43A23FB801676BD207A436C6481F1D2B9078717461A5B9D32E688F87748' +
    '544523B524B0D57D5EA77A2775D2ECFA032CFBDBF52FB3786160279004E57AE6' +
    'AF874E7303CE53299CCC041C7BC308D82A5698F3A8D0C38271AE35F8E9DBFBB6' +
    '94B5C803D89F7AE435DE236D525F54759B65E372FCD68EF20FA7111F9E4AFF73'
  ),
  g: BigInt('2'),
  k: BigInt('0x' + '6B8B60B1E2BA7FF4D7C01F5E4366ACC93FECC3D51136230F432756C312F6703E') // Pre-computed k = H(N, g)
};

// Helper to convert between different number representations
export const bigIntToUint8Array = (value: bigint): Uint8Array => {
  const hex = value.toString(16);
  const paddedHex = hex.length % 2 === 0 ? hex : '0' + hex;
  const bytes = new Uint8Array(paddedHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(paddedHex.substr(i * 2, 2), 16);
  }
  return bytes;
};

export const uint8ArrayToBigInt = (bytes: Uint8Array): bigint => {
  let hex = '0x';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return BigInt(hex);
};