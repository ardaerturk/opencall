export enum WebRTCErrorType {
  MEDIA_ACCESS_DENIED = 'MEDIA_ACCESS_DENIED',
  MEDIA_NOT_FOUND = 'MEDIA_NOT_FOUND',
  MEDIA_OVERCONSTRAINED = 'MEDIA_OVERCONSTRAINED',
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  SIGNALING_ERROR = 'SIGNALING_ERROR',
  PEER_CONNECTION_ERROR = 'PEER_CONNECTION_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export class WebRTCError extends Error {
  type: WebRTCErrorType;
  details?: any;

  constructor(type: WebRTCErrorType, message: string, details?: any) {
    super(message);
    this.name = 'WebRTCError';
    this.type = type;
    this.details = details;
  }
}

export function handleMediaError(error: any): WebRTCError {
  if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
    return new WebRTCError(
      WebRTCErrorType.MEDIA_ACCESS_DENIED,
      'Permission denied to access camera/microphone',
      error
    );
  }
  
  if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
    return new WebRTCError(
      WebRTCErrorType.MEDIA_NOT_FOUND,
      'No camera or microphone found',
      error
    );
  }
  
  if (error.name === 'OverconstrainedError' || error.name === 'ConstraintNotSatisfiedError') {
    return new WebRTCError(
      WebRTCErrorType.MEDIA_OVERCONSTRAINED,
      'Media constraints cannot be satisfied',
      error
    );
  }
  
  return new WebRTCError(
    WebRTCErrorType.UNKNOWN_ERROR,
    error.message || 'Unknown media error',
    error
  );
}

export function handleConnectionError(error: any): WebRTCError {
  if (error.message?.includes('ICE') || error.message?.includes('ice')) {
    return new WebRTCError(
      WebRTCErrorType.CONNECTION_FAILED,
      'Failed to establish peer connection (ICE failure)',
      error
    );
  }
  
  if (error.message?.includes('signaling') || error.message?.includes('signal')) {
    return new WebRTCError(
      WebRTCErrorType.SIGNALING_ERROR,
      'Signaling error occurred',
      error
    );
  }
  
  return new WebRTCError(
    WebRTCErrorType.PEER_CONNECTION_ERROR,
    error.message || 'Peer connection error',
    error
  );
}

export function isRecoverableError(error: WebRTCError): boolean {
  switch (error.type) {
    case WebRTCErrorType.NETWORK_ERROR:
    case WebRTCErrorType.CONNECTION_FAILED:
    case WebRTCErrorType.SIGNALING_ERROR:
      return true;
    default:
      return false;
  }
}

export function getErrorMessage(error: WebRTCError): string {
  switch (error.type) {
    case WebRTCErrorType.MEDIA_ACCESS_DENIED:
      return 'Please allow access to your camera and microphone to join the call.';
    case WebRTCErrorType.MEDIA_NOT_FOUND:
      return 'No camera or microphone found. Please check your device settings.';
    case WebRTCErrorType.MEDIA_OVERCONSTRAINED:
      return 'Your camera or microphone settings are not supported. Please try different settings.';
    case WebRTCErrorType.CONNECTION_FAILED:
      return 'Failed to connect to the call. Please check your network connection.';
    case WebRTCErrorType.SIGNALING_ERROR:
      return 'Failed to connect to the server. Please try again.';
    case WebRTCErrorType.PEER_CONNECTION_ERROR:
      return 'Failed to connect to other participants. Please try again.';
    case WebRTCErrorType.NETWORK_ERROR:
      return 'Network error occurred. Please check your internet connection.';
    default:
      return 'An unexpected error occurred. Please try again.';
  }
}