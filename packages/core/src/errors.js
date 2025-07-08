"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorMessages = exports.ValidationError = exports.PermissionError = exports.NetworkError = exports.AuthenticationError = exports.EncryptionError = exports.ConnectionError = exports.DMPError = void 0;
class DMPError extends Error {
    code;
    details;
    constructor(message, code, details) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = 'DMPError';
    }
}
exports.DMPError = DMPError;
class ConnectionError extends DMPError {
    constructor(message, details) {
        super(message, 'CONNECTION_ERROR', details);
        this.name = 'ConnectionError';
    }
}
exports.ConnectionError = ConnectionError;
class EncryptionError extends DMPError {
    constructor(message, details) {
        super(message, 'ENCRYPTION_ERROR', details);
        this.name = 'EncryptionError';
    }
}
exports.EncryptionError = EncryptionError;
class AuthenticationError extends DMPError {
    constructor(message, details) {
        super(message, 'AUTHENTICATION_ERROR', details);
        this.name = 'AuthenticationError';
    }
}
exports.AuthenticationError = AuthenticationError;
class NetworkError extends DMPError {
    constructor(message, details) {
        super(message, 'NETWORK_ERROR', details);
        this.name = 'NetworkError';
    }
}
exports.NetworkError = NetworkError;
class PermissionError extends DMPError {
    constructor(message, details) {
        super(message, 'PERMISSION_ERROR', details);
        this.name = 'PermissionError';
    }
}
exports.PermissionError = PermissionError;
class ValidationError extends DMPError {
    constructor(message, details) {
        super(message, 'VALIDATION_ERROR', details);
        this.name = 'ValidationError';
    }
}
exports.ValidationError = ValidationError;
exports.ErrorMessages = {
    CONNECTION_FAILED: 'Failed to establish connection',
    ENCRYPTION_FAILED: 'Failed to encrypt/decrypt data',
    AUTH_FAILED: 'Authentication failed',
    INVALID_MEETING_ID: 'Invalid meeting ID',
    PEER_NOT_FOUND: 'Peer not found',
    MIC_PERMISSION_DENIED: 'Microphone permission denied',
    CAMERA_PERMISSION_DENIED: 'Camera permission denied',
    NETWORK_UNREACHABLE: 'Network unreachable',
    QUOTA_EXCEEDED: 'Storage quota exceeded',
};
//# sourceMappingURL=errors.js.map