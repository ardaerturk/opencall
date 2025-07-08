export class DMPError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'DMPError';
  }
}

export class ConnectionError extends DMPError {
  constructor(message: string, details?: unknown) {
    super(message, 'CONNECTION_ERROR', details);
    this.name = 'ConnectionError';
  }
}

export class EncryptionError extends DMPError {
  constructor(message: string, details?: unknown) {
    super(message, 'ENCRYPTION_ERROR', details);
    this.name = 'EncryptionError';
  }
}

export class AuthenticationError extends DMPError {
  constructor(message: string, details?: unknown) {
    super(message, 'AUTHENTICATION_ERROR', details);
    this.name = 'AuthenticationError';
  }
}

export class NetworkError extends DMPError {
  constructor(message: string, details?: unknown) {
    super(message, 'NETWORK_ERROR', details);
    this.name = 'NetworkError';
  }
}

export class PermissionError extends DMPError {
  constructor(message: string, details?: unknown) {
    super(message, 'PERMISSION_ERROR', details);
    this.name = 'PermissionError';
  }
}

export class ValidationError extends DMPError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export const ErrorMessages = {
  CONNECTION_FAILED: 'Failed to establish connection',
  ENCRYPTION_FAILED: 'Failed to encrypt/decrypt data',
  AUTH_FAILED: 'Authentication failed',
  INVALID_MEETING_ID: 'Invalid meeting ID',
  PEER_NOT_FOUND: 'Peer not found',
  MIC_PERMISSION_DENIED: 'Microphone permission denied',
  CAMERA_PERMISSION_DENIED: 'Camera permission denied',
  NETWORK_UNREACHABLE: 'Network unreachable',
  QUOTA_EXCEEDED: 'Storage quota exceeded',
} as const;
