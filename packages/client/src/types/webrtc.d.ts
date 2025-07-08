// WebRTC Encoded Transform API type definitions

interface RTCRtpScriptTransform {
  constructor(worker: Worker, options?: any): RTCRtpScriptTransform;
}

interface RTCRtpSender {
  transform?: RTCRtpScriptTransform;
}

interface RTCRtpReceiver {
  transform?: RTCRtpScriptTransform;
}

interface RTCEncodedVideoFrame {
  data: ArrayBuffer;
  timestamp: number;
  type?: 'key' | 'delta';
  getMetadata(): RTCEncodedVideoFrameMetadata;
}

interface RTCEncodedAudioFrame {
  data: ArrayBuffer;
  timestamp: number;
  getMetadata(): RTCEncodedAudioFrameMetadata;
}

interface RTCEncodedVideoFrameMetadata {
  frameId?: number;
  dependencies?: number[];
  width?: number;
  height?: number;
  spatialIndex?: number;
  temporalIndex?: number;
  synchronizationSource?: number;
  payloadType?: number;
  contributingSources?: number[];
}

interface RTCEncodedAudioFrameMetadata {
  synchronizationSource?: number;
  payloadType?: number;
  contributingSources?: number[];
  sequenceNumber?: number;
}

interface RTCTransformEvent extends Event {
  readonly transformer: RTCRtpScriptTransformer;
}

interface RTCRtpScriptTransformer {
  readonly readable: ReadableStream<RTCEncodedVideoFrame | RTCEncodedAudioFrame>;
  readonly writable: WritableStream<RTCEncodedVideoFrame | RTCEncodedAudioFrame>;
  readonly options: any;
}

interface Window {
  RTCRtpScriptTransform?: typeof RTCRtpScriptTransform;
  RTCTransformEvent?: typeof RTCTransformEvent;
}

// Legacy API support
interface RTCRtpSender {
  createEncodedStreams?(): {
    readable: ReadableStream<RTCEncodedVideoFrame | RTCEncodedAudioFrame>;
    writable: WritableStream<RTCEncodedVideoFrame | RTCEncodedAudioFrame>;
  };
}

interface RTCRtpReceiver {
  createEncodedStreams?(): {
    readable: ReadableStream<RTCEncodedVideoFrame | RTCEncodedAudioFrame>;
    writable: WritableStream<RTCEncodedVideoFrame | RTCEncodedAudioFrame>;
  };
}

// Worker global scope extensions
interface DedicatedWorkerGlobalScope {
  onrtctransform?: (event: RTCTransformEvent) => void;
}