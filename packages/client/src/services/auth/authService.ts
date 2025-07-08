/**
 * Client-side authentication service for SRP zero-knowledge authentication
 */

import { 
  SRP, 
  SRPClientSession, 
  bigIntToUint8Array,
  AuthenticationRequest,
  AuthenticationChallenge,
  AuthenticationProof,
  AuthenticationResponse,
  AuthenticationSession,
} from '@opencall/core';

export interface AuthServiceConfig {
  apiUrl: string;
  storageKey: string;
}

export class AuthService {
  private srp: SRP;
  private config: AuthServiceConfig;
  private currentSession: SRPClientSession | null = null;
  private authSession: AuthenticationSession | null = null;

  constructor(config?: Partial<AuthServiceConfig>) {
    this.srp = new SRP();
    this.config = {
      apiUrl: config?.apiUrl || '/api/auth',
      storageKey: config?.storageKey || 'opencall-auth-session',
    };

    // Load existing session from localStorage
    this.loadSession();
  }

  /**
   * Register a new user
   */
  public async register(identity: string, password: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const response = await fetch(`${this.config.apiUrl}/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ identity, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || 'Registration failed' };
      }

      return { success: true };
    } catch (error) {
      console.error('Registration error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  /**
   * Authenticate user with SRP
   */
  public async authenticate(identity: string, password: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      // Step 1: Start client authentication
      const { session, publicKey } = await this.srp.clientStartAuthentication(
        identity,
        password
      );
      this.currentSession = session;

      // Convert public key to hex string
      const publicKeyHex = bigIntToUint8Array(publicKey)
        .reduce((acc, byte) => acc + byte.toString(16).padStart(2, '0'), '');

      // Step 2: Request challenge from server
      const challengeResponse = await fetch(`${this.config.apiUrl}/challenge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          identity,
          publicKey: publicKeyHex,
        } as AuthenticationRequest),
      });

      if (!challengeResponse.ok) {
        const data = await challengeResponse.json();
        return { success: false, error: data.error || 'Authentication failed' };
      }

      const challenge: AuthenticationChallenge = await challengeResponse.json();

      // Convert challenge data
      const serverChallenge = {
        salt: Buffer.from(challenge.salt, 'base64'),
        serverPublicKey: BigInt('0x' + challenge.serverPublicKey),
        sessionId: challenge.sessionId,
      };

      // Step 3: Process challenge and create proof
      const proof = await this.srp.clientProcessChallenge(session, serverChallenge);

      // Convert proof data
      const authProof: AuthenticationProof = {
        sessionId: proof.sessionId,
        clientPublicKey: bigIntToUint8Array(proof.clientPublicKey)
          .reduce((acc, byte) => acc + byte.toString(16).padStart(2, '0'), ''),
        proof: Buffer.from(proof.proof).toString('base64'),
      };

      // Step 4: Verify proof with server
      const verifyResponse = await fetch(`${this.config.apiUrl}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(authProof),
      });

      if (!verifyResponse.ok) {
        const data = await verifyResponse.json();
        return { success: false, error: data.error || 'Authentication failed' };
      }

      const authResponse: AuthenticationResponse = await verifyResponse.json();

      if (!authResponse.success || !authResponse.serverProof) {
        return { success: false, error: 'Server verification failed' };
      }

      // Step 5: Verify server proof
      const serverProofValid = await this.srp.clientVerifyServerProof(
        session,
        Buffer.from(authResponse.serverProof, 'base64')
      );

      if (!serverProofValid) {
        return { success: false, error: 'Server proof verification failed' };
      }

      // Authentication successful, store session
      this.authSession = {
        sessionId: challenge.sessionId,
        identity,
        sessionKey: session.sessionKey,
        expiresAt: Date.now() + (authResponse.expiresIn || 3600) * 1000,
        isAuthenticated: true,
      };

      this.saveSession();

      return { success: true };
    } catch (error) {
      console.error('Authentication error:', error);
      return { success: false, error: 'Authentication failed' };
    }
  }

  /**
   * Get ephemeral identity for anonymous access
   */
  public async getEphemeralIdentity(): Promise<{
    success: boolean;
    identity?: string;
    error?: string;
  }> {
    try {
      const response = await fetch(`${this.config.apiUrl}/ephemeral`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        const data = await response.json();
        return { success: false, error: data.error || 'Failed to get ephemeral identity' };
      }

      const data = await response.json();

      // Store ephemeral session
      this.authSession = {
        sessionId: data.identity,
        identity: data.identity,
        expiresAt: Date.now() + data.expiresIn * 1000,
        isAuthenticated: false,
      };

      this.saveSession();

      return { success: true, identity: data.identity };
    } catch (error) {
      console.error('Ephemeral identity error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  /**
   * Get current user info
   */
  public async getCurrentUser(): Promise<{
    identity?: string;
    authenticated: boolean;
    error?: string;
  }> {
    try {
      const response = await fetch(`${this.config.apiUrl}/me`, {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Not authenticated, get ephemeral identity
          const ephemeral = await this.getEphemeralIdentity();
          if (ephemeral.success && ephemeral.identity) {
            return {
              identity: ephemeral.identity,
              authenticated: false,
            };
          }
        }
        return { authenticated: false, error: 'Not authenticated' };
      }

      const data = await response.json();
      return {
        identity: data.identity,
        authenticated: data.authenticated,
      };
    } catch (error) {
      console.error('Get current user error:', error);
      return { authenticated: false, error: 'Network error' };
    }
  }

  /**
   * Logout user
   */
  public async logout(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.apiUrl}/logout`, {
        method: 'POST',
        credentials: 'include',
      });

      // Clear local session regardless of server response
      this.clearSession();

      return response.ok;
    } catch (error) {
      console.error('Logout error:', error);
      this.clearSession();
      return false;
    }
  }

  /**
   * Check if user is authenticated
   */
  public isAuthenticated(): boolean {
    return this.authSession?.isAuthenticated || false;
  }

  /**
   * Get current identity (authenticated or ephemeral)
   */
  public getIdentity(): string | null {
    return this.authSession?.identity || null;
  }

  /**
   * Get session key for E2E encryption
   */
  public getSessionKey(): Uint8Array | null {
    return this.authSession?.sessionKey || null;
  }

  /**
   * Save session to localStorage
   */
  private saveSession(): void {
    if (this.authSession) {
      // Don't store sensitive session key in localStorage
      const storedSession = {
        sessionId: this.authSession.sessionId,
        identity: this.authSession.identity,
        expiresAt: this.authSession.expiresAt,
        isAuthenticated: this.authSession.isAuthenticated,
      };
      localStorage.setItem(this.config.storageKey, JSON.stringify(storedSession));
    }
  }

  /**
   * Load session from localStorage
   */
  private loadSession(): void {
    try {
      const stored = localStorage.getItem(this.config.storageKey);
      if (stored) {
        const session = JSON.parse(stored);
        if (session.expiresAt > Date.now()) {
          this.authSession = {
            ...session,
            sessionKey: undefined, // Session key is not persisted
          };
        } else {
          // Session expired
          this.clearSession();
        }
      }
    } catch (error) {
      console.error('Error loading session:', error);
      this.clearSession();
    }
  }

  /**
   * Clear session
   */
  private clearSession(): void {
    this.currentSession = null;
    this.authSession = null;
    localStorage.removeItem(this.config.storageKey);
  }
}

// Singleton instance
let authServiceInstance: AuthService | null = null;

export function getAuthService(config?: Partial<AuthServiceConfig>): AuthService {
  if (!authServiceInstance) {
    authServiceInstance = new AuthService(config);
  }
  return authServiceInstance;
}

export default AuthService;