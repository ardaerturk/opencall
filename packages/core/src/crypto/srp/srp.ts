/**
 * SRP-6a implementation for zero-knowledge authentication
 * Based on RFC 5054 and RFC 2945
 */

import {
  SRPParameters,
  SRPClientSession,
  SRPServerSession,
  SRPVerifier,
  SRPChallenge,
  SRPProof,
  SRPVerificationResult,
  SRP_PARAMS_2048,
  bigIntToUint8Array,
  uint8ArrayToBigInt,
} from './types';

export class SRP {
  private params: SRPParameters;

  constructor(params?: Partial<SRPParameters>) {
    this.params = {
      ...SRP_PARAMS_2048,
      H: params?.H || this.sha256,
      ...params,
    };
  }

  /**
   * SHA-256 hash function using WebCrypto API
   */
  private async sha256(data: Uint8Array): Promise<Uint8Array> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return new Uint8Array(hashBuffer);
  }

  /**
   * Compute x = H(salt || identity || password)
   */
  private async computeX(
    salt: Uint8Array,
    identity: string,
    password: string
  ): Promise<bigint> {
    const encoder = new TextEncoder();
    const identityBytes = encoder.encode(identity);
    const passwordBytes = encoder.encode(password);
    
    // Concatenate salt || identity || password
    const combined = new Uint8Array(
      salt.length + identityBytes.length + passwordBytes.length
    );
    combined.set(salt, 0);
    combined.set(identityBytes, salt.length);
    combined.set(passwordBytes, salt.length + identityBytes.length);
    
    const hash = await this.params.H(combined);
    return uint8ArrayToBigInt(hash);
  }

  /**
   * Compute u = H(A || B)
   */
  private async computeU(A: bigint, B: bigint): Promise<bigint> {
    const aBytes = bigIntToUint8Array(A);
    const bBytes = bigIntToUint8Array(B);
    
    const combined = new Uint8Array(aBytes.length + bBytes.length);
    combined.set(aBytes, 0);
    combined.set(bBytes, aBytes.length);
    
    const hash = await this.params.H(combined);
    return uint8ArrayToBigInt(hash);
  }

  /**
   * Generate a random bigint suitable for SRP
   */
  private generateRandomBigInt(bits: number = 256): bigint {
    const bytes = new Uint8Array(bits / 8);
    crypto.getRandomValues(bytes);
    return uint8ArrayToBigInt(bytes);
  }

  /**
   * Modular exponentiation: (base^exp) mod modulus
   */
  private modPow(base: bigint, exp: bigint, modulus: bigint): bigint {
    let result = BigInt(1);
    base = base % modulus;
    
    while (exp > 0) {
      if (exp % BigInt(2) === BigInt(1)) {
        result = (result * base) % modulus;
      }
      exp = exp / BigInt(2);
      base = (base * base) % modulus;
    }
    
    return result;
  }

  /**
   * Generate salt for a new user
   */
  public generateSalt(length: number = 32): Uint8Array {
    const salt = new Uint8Array(length);
    crypto.getRandomValues(salt);
    return salt;
  }

  /**
   * Create verifier for user registration
   */
  public async createVerifier(
    identity: string,
    password: string,
    salt?: Uint8Array
  ): Promise<SRPVerifier> {
    const userSalt = salt || this.generateSalt();
    const x = await this.computeX(userSalt, identity, password);
    const verifier = this.modPow(this.params.g, x, this.params.N);
    
    return {
      identity,
      salt: userSalt,
      verifier,
    };
  }

  /**
   * Client: Start authentication session
   */
  public async clientStartAuthentication(
    identity: string,
    password: string
  ): Promise<{ session: SRPClientSession; publicKey: bigint }> {
    const privateKey = this.generateRandomBigInt();
    const publicKey = this.modPow(this.params.g, privateKey, this.params.N);
    
    const session: SRPClientSession = {
      identity,
      password,
      salt: new Uint8Array(), // Will be filled when we receive the challenge
      privateKey,
      publicKey,
    };
    
    return { session, publicKey };
  }

  /**
   * Server: Create authentication challenge
   */
  public async serverCreateChallenge(
    verifier: SRPVerifier,
    sessionId: string
  ): Promise<{ session: SRPServerSession; challenge: SRPChallenge }> {
    const privateKey = this.generateRandomBigInt();
    
    // B = kv + g^b mod N
    const publicKey = (
      this.params.k * verifier.verifier +
      this.modPow(this.params.g, privateKey, this.params.N)
    ) % this.params.N;
    
    const session: SRPServerSession = {
      identity: verifier.identity,
      salt: verifier.salt,
      verifier: verifier.verifier,
      privateKey,
      publicKey,
    };
    
    const challenge: SRPChallenge = {
      salt: verifier.salt,
      serverPublicKey: publicKey,
      sessionId,
    };
    
    return { session, challenge };
  }

  /**
   * Client: Process challenge and create proof
   */
  public async clientProcessChallenge(
    session: SRPClientSession,
    challenge: SRPChallenge
  ): Promise<SRPProof> {
    // Store server's public key and salt
    session.serverPublicKey = challenge.serverPublicKey;
    session.salt = challenge.salt;
    
    // Compute u = H(A || B)
    const u = await this.computeU(session.publicKey, challenge.serverPublicKey);
    
    // Compute x = H(salt || identity || password)
    const x = await this.computeX(challenge.salt, session.identity, session.password);
    
    // Compute S = (B - kg^x)^(a + ux) mod N
    const kgx = (this.params.k * this.modPow(this.params.g, x, this.params.N)) % this.params.N;
    const base = (challenge.serverPublicKey - kgx + this.params.N) % this.params.N;
    const exp = (session.privateKey + u * x) % (this.params.N - BigInt(1));
    session.sharedSecret = this.modPow(base, exp, this.params.N);
    
    // Compute session key K = H(S)
    session.sessionKey = await this.params.H(bigIntToUint8Array(session.sharedSecret));
    
    // Compute M1 = H(H(N) XOR H(g) || H(identity) || salt || A || B || K)
    session.M1 = await this.computeClientProof(
      session.identity,
      session.salt,
      session.publicKey,
      challenge.serverPublicKey,
      session.sessionKey
    );
    
    return {
      clientPublicKey: session.publicKey,
      proof: session.M1,
      sessionId: challenge.sessionId,
    };
  }

  /**
   * Server: Verify client proof and generate server proof
   */
  public async serverVerifyProof(
    session: SRPServerSession,
    proof: SRPProof
  ): Promise<SRPVerificationResult> {
    // Store client's public key
    session.clientPublicKey = proof.clientPublicKey;
    
    // Compute u = H(A || B)
    const u = await this.computeU(proof.clientPublicKey, session.publicKey);
    
    // Compute S = (Av^u)^b mod N
    const avu = (proof.clientPublicKey * this.modPow(session.verifier, u, this.params.N)) % this.params.N;
    session.sharedSecret = this.modPow(avu, session.privateKey, this.params.N);
    
    // Compute session key K = H(S)
    session.sessionKey = await this.params.H(bigIntToUint8Array(session.sharedSecret));
    
    // Compute expected M1
    session.M1 = await this.computeClientProof(
      session.identity,
      session.salt,
      proof.clientPublicKey,
      session.publicKey,
      session.sessionKey
    );
    
    // Verify client proof
    const proofValid = this.compareUint8Arrays(session.M1, proof.proof);
    
    if (!proofValid) {
      return { success: false };
    }
    
    // Compute M2 = H(A || M1 || K)
    session.M2 = await this.computeServerProof(
      proof.clientPublicKey,
      session.M1,
      session.sessionKey
    );
    
    return {
      success: true,
      sessionKey: session.sessionKey,
      serverProof: session.M2,
    };
  }

  /**
   * Client: Verify server proof
   */
  public async clientVerifyServerProof(
    session: SRPClientSession,
    serverProof: Uint8Array
  ): Promise<boolean> {
    if (!session.M1 || !session.sessionKey || !session.publicKey) {
      return false;
    }
    
    // Compute expected M2 = H(A || M1 || K)
    const expectedM2 = await this.computeServerProof(
      session.publicKey,
      session.M1,
      session.sessionKey
    );
    
    return this.compareUint8Arrays(expectedM2, serverProof);
  }

  /**
   * Compute client proof M1 = H(H(N) XOR H(g) || H(identity) || salt || A || B || K)
   */
  private async computeClientProof(
    identity: string,
    salt: Uint8Array,
    A: bigint,
    B: bigint,
    K: Uint8Array
  ): Promise<Uint8Array> {
    // H(N) XOR H(g)
    const hN = await this.params.H(bigIntToUint8Array(this.params.N));
    const hg = await this.params.H(bigIntToUint8Array(this.params.g));
    const hNxorHg = new Uint8Array(hN.length);
    for (let i = 0; i < hN.length; i++) {
      hNxorHg[i] = hN[i] ^ hg[i];
    }
    
    // H(identity)
    const encoder = new TextEncoder();
    const hIdentity = await this.params.H(encoder.encode(identity));
    
    // Concatenate all parts
    const aBytes = bigIntToUint8Array(A);
    const bBytes = bigIntToUint8Array(B);
    
    const combined = new Uint8Array(
      hNxorHg.length + hIdentity.length + salt.length + 
      aBytes.length + bBytes.length + K.length
    );
    
    let offset = 0;
    combined.set(hNxorHg, offset);
    offset += hNxorHg.length;
    combined.set(hIdentity, offset);
    offset += hIdentity.length;
    combined.set(salt, offset);
    offset += salt.length;
    combined.set(aBytes, offset);
    offset += aBytes.length;
    combined.set(bBytes, offset);
    offset += bBytes.length;
    combined.set(K, offset);
    
    return await this.params.H(combined);
  }

  /**
   * Compute server proof M2 = H(A || M1 || K)
   */
  private async computeServerProof(
    A: bigint,
    M1: Uint8Array,
    K: Uint8Array
  ): Promise<Uint8Array> {
    const aBytes = bigIntToUint8Array(A);
    const combined = new Uint8Array(aBytes.length + M1.length + K.length);
    
    let offset = 0;
    combined.set(aBytes, offset);
    offset += aBytes.length;
    combined.set(M1, offset);
    offset += M1.length;
    combined.set(K, offset);
    
    return await this.params.H(combined);
  }

  /**
   * Constant-time comparison of Uint8Arrays
   */
  private compareUint8Arrays(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) {
      return false;
    }
    
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a[i] ^ b[i];
    }
    
    return result === 0;
  }
}

export default SRP;