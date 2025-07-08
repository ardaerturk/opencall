export declare class DMPError extends Error {
    readonly code: string;
    readonly details?: unknown | undefined;
    constructor(message: string, code: string, details?: unknown | undefined);
}
export declare class ConnectionError extends DMPError {
    constructor(message: string, details?: unknown);
}
export declare class EncryptionError extends DMPError {
    constructor(message: string, details?: unknown);
}
export declare class AuthenticationError extends DMPError {
    constructor(message: string, details?: unknown);
}
export declare class NetworkError extends DMPError {
    constructor(message: string, details?: unknown);
}
export declare class PermissionError extends DMPError {
    constructor(message: string, details?: unknown);
}
export declare class ValidationError extends DMPError {
    constructor(message: string, details?: unknown);
}
export declare const ErrorMessages: {
    readonly CONNECTION_FAILED: "Failed to establish connection";
    readonly ENCRYPTION_FAILED: "Failed to encrypt/decrypt data";
    readonly AUTH_FAILED: "Authentication failed";
    readonly INVALID_MEETING_ID: "Invalid meeting ID";
    readonly PEER_NOT_FOUND: "Peer not found";
    readonly MIC_PERMISSION_DENIED: "Microphone permission denied";
    readonly CAMERA_PERMISSION_DENIED: "Camera permission denied";
    readonly NETWORK_UNREACHABLE: "Network unreachable";
    readonly QUOTA_EXCEEDED: "Storage quota exceeded";
};
//# sourceMappingURL=errors.d.ts.map