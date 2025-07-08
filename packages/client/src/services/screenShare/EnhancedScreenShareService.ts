import { EventEmitter } from 'events';

export interface ScreenShareOptions {
  video: {
    width?: { ideal: number; max?: number };
    height?: { ideal: number; max?: number };
    frameRate?: { ideal: number; max?: number };
    displaySurface?: 'window' | 'browser' | 'monitor';
  };
  audio?: boolean | {
    echoCancellation?: boolean;
    noiseSuppression?: boolean;
    autoGainControl?: boolean;
  };
  preferCurrentTab?: boolean;
  selfBrowserSurface?: 'include' | 'exclude';
  systemAudio?: 'include' | 'exclude';
  surfaceSwitching?: 'include' | 'exclude';
  monitorTypeSurfaces?: 'include' | 'exclude';
}

export interface ScreenShare {
  id: string;
  userId: string;
  userName: string;
  stream: MediaStream;
  quality: 'auto' | 'low' | 'medium' | 'high' | '4k';
  isAnnotating: boolean;
  startedAt: number;
}

export interface Annotation {
  id: string;
  type: 'drawing' | 'pointer' | 'text' | 'arrow' | 'rectangle';
  userId: string;
  color: string;
  points?: { x: number; y: number }[];
  text?: string;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
  timestamp: number;
}

export type LayoutMode = 'focus' | 'grid' | 'presenter' | 'side-by-side';

export class EnhancedScreenShareService extends EventEmitter {
  private activeShares = new Map<string, ScreenShare>();
  private annotations = new Map<string, Annotation[]>();
  private currentLayout: LayoutMode = 'focus';
  private maxSimultaneousShares = 4;
  private annotationCanvas: HTMLCanvasElement | null = null;
  private annotationContext: CanvasRenderingContext2D | null = null;
  private isDrawing = false;
  private currentAnnotation: Partial<Annotation> | null = null;

  constructor() {
    super();
  }

  async startScreenShare(
    userId: string,
    userName: string,
    options?: ScreenShareOptions
  ): Promise<ScreenShare> {
    // Check if we've reached the maximum number of shares
    if (this.activeShares.size >= this.maxSimultaneousShares) {
      throw new Error(`Maximum of ${this.maxSimultaneousShares} simultaneous screen shares allowed`);
    }

    // Default options for different quality levels
    const qualityPresets = {
      low: { width: 1280, height: 720, frameRate: 15 },
      medium: { width: 1920, height: 1080, frameRate: 30 },
      high: { width: 2560, height: 1440, frameRate: 30 },
      '4k': { width: 3840, height: 2160, frameRate: 30 }
    };

    const defaultOptions: ScreenShareOptions = {
      video: {
        width: { ideal: qualityPresets.high.width },
        height: { ideal: qualityPresets.high.height },
        frameRate: { ideal: qualityPresets.high.frameRate }
      },
      audio: false,
      preferCurrentTab: false,
      selfBrowserSurface: 'exclude',
      systemAudio: 'exclude',
      surfaceSwitching: 'include',
      monitorTypeSurfaces: 'include'
    };

    const mergedOptions = { ...defaultOptions, ...options };

    try {
      // @ts-ignore - getDisplayMedia types might not include all options
      const stream = await navigator.mediaDevices.getDisplayMedia(mergedOptions);

      const screenShare: ScreenShare = {
        id: crypto.randomUUID(),
        userId,
        userName,
        stream,
        quality: 'auto',
        isAnnotating: false,
        startedAt: Date.now()
      };

      // Handle stream ending
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        this.stopScreenShare(screenShare.id);
      });

      this.activeShares.set(screenShare.id, screenShare);
      this.emit('screenShareStarted', screenShare);

      // Auto-adjust layout based on number of shares
      this.adjustLayout();

      return screenShare;
    } catch (error) {
      console.error('Failed to start screen share:', error);
      throw error;
    }
  }

  stopScreenShare(shareId: string): void {
    const share = this.activeShares.get(shareId);
    if (!share) return;

    // Stop all tracks
    share.stream.getTracks().forEach(track => track.stop());

    // Remove from active shares
    this.activeShares.delete(shareId);

    // Clear annotations for this share
    this.annotations.delete(shareId);

    this.emit('screenShareStopped', shareId);

    // Re-adjust layout
    this.adjustLayout();
  }

  changeQuality(shareId: string, quality: ScreenShare['quality']): void {
    const share = this.activeShares.get(shareId);
    if (!share) return;

    const qualitySettings = {
      low: { width: 1280, height: 720, bitrate: 1000000 },
      medium: { width: 1920, height: 1080, bitrate: 2500000 },
      high: { width: 2560, height: 1440, bitrate: 5000000 },
      '4k': { width: 3840, height: 2160, bitrate: 10000000 }
    };

    if (quality === 'auto') {
      // Implement auto quality based on network conditions
      share.quality = quality;
      this.emit('qualityChanged', shareId, quality);
      return;
    }

    const settings = qualitySettings[quality];
    const videoTrack = share.stream.getVideoTracks()[0];

    if (videoTrack) {
      videoTrack.applyConstraints({
        width: { ideal: settings.width },
        height: { ideal: settings.height }
      }).then(() => {
        share.quality = quality;
        this.emit('qualityChanged', shareId, quality, settings.bitrate);
      }).catch(error => {
        console.error('Failed to change quality:', error);
      });
    }
  }

  setLayout(mode: LayoutMode): void {
    this.currentLayout = mode;
    this.emit('layoutChanged', mode);
  }

  private adjustLayout(): void {
    const shareCount = this.activeShares.size;

    if (shareCount === 0) {
      this.setLayout('focus');
    } else if (shareCount === 1) {
      this.setLayout('focus');
    } else if (shareCount === 2) {
      this.setLayout('side-by-side');
    } else {
      this.setLayout('grid');
    }
  }

  // Annotation methods
  initializeAnnotationCanvas(canvas: HTMLCanvasElement): void {
    this.annotationCanvas = canvas;
    this.annotationContext = canvas.getContext('2d');

    if (!this.annotationContext) {
      throw new Error('Failed to get canvas context');
    }

    // Set up canvas event listeners
    canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
    canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
    canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
    canvas.addEventListener('mouseleave', this.handleMouseUp.bind(this));

    // Touch events for mobile
    canvas.addEventListener('touchstart', this.handleTouchStart.bind(this));
    canvas.addEventListener('touchmove', this.handleTouchMove.bind(this));
    canvas.addEventListener('touchend', this.handleTouchEnd.bind(this));
  }

  startAnnotation(
    shareId: string,
    type: Annotation['type'],
    color: string = '#FF0000'
  ): void {
    const share = this.activeShares.get(shareId);
    if (!share) return;

    share.isAnnotating = true;
    this.currentAnnotation = {
      id: crypto.randomUUID(),
      type,
      userId: share.userId,
      color,
      points: [],
      timestamp: Date.now()
    };

    this.emit('annotationStarted', shareId, type);
  }

  stopAnnotation(shareId: string): void {
    const share = this.activeShares.get(shareId);
    if (!share) return;

    share.isAnnotating = false;
    this.currentAnnotation = null;
    this.isDrawing = false;

    this.emit('annotationStopped', shareId);
  }

  private handleMouseDown(event: MouseEvent): void {
    if (!this.currentAnnotation) return;

    this.isDrawing = true;
    const rect = this.annotationCanvas!.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (this.currentAnnotation.type === 'drawing') {
      this.currentAnnotation.points = [{ x, y }];
    } else if (this.currentAnnotation.type === 'pointer') {
      this.currentAnnotation.position = { x, y };
    }
  }

  private handleMouseMove(event: MouseEvent): void {
    if (!this.isDrawing || !this.currentAnnotation) return;

    const rect = this.annotationCanvas!.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (this.currentAnnotation.type === 'drawing' && this.currentAnnotation.points) {
      this.currentAnnotation.points.push({ x, y });
      this.drawAnnotation(this.currentAnnotation as Annotation);
    } else if (this.currentAnnotation.type === 'pointer') {
      this.currentAnnotation.position = { x, y };
      this.emit('pointerMoved', this.currentAnnotation.position);
    }
  }

  private handleMouseUp(): void {
    if (!this.isDrawing || !this.currentAnnotation) return;

    this.isDrawing = false;

    // Save the annotation
    const activeShare = Array.from(this.activeShares.values()).find(
      share => share.isAnnotating
    );

    if (activeShare) {
      const shareAnnotations = this.annotations.get(activeShare.id) || [];
      shareAnnotations.push(this.currentAnnotation as Annotation);
      this.annotations.set(activeShare.id, shareAnnotations);

      this.emit('annotationAdded', activeShare.id, this.currentAnnotation);
    }
  }

  private handleTouchStart(event: TouchEvent): void {
    event.preventDefault();
    const touch = event.touches[0];
    const mouseEvent = new MouseEvent('mousedown', {
      clientX: touch.clientX,
      clientY: touch.clientY
    });
    this.handleMouseDown(mouseEvent);
  }

  private handleTouchMove(event: TouchEvent): void {
    event.preventDefault();
    const touch = event.touches[0];
    const mouseEvent = new MouseEvent('mousemove', {
      clientX: touch.clientX,
      clientY: touch.clientY
    });
    this.handleMouseMove(mouseEvent);
  }

  private handleTouchEnd(event: TouchEvent): void {
    event.preventDefault();
    this.handleMouseUp();
  }

  private drawAnnotation(annotation: Annotation): void {
    if (!this.annotationContext) return;

    const ctx = this.annotationContext;
    ctx.strokeStyle = annotation.color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (annotation.type === 'drawing' && annotation.points) {
      ctx.beginPath();
      annotation.points.forEach((point, index) => {
        if (index === 0) {
          ctx.moveTo(point.x, point.y);
        } else {
          ctx.lineTo(point.x, point.y);
        }
      });
      ctx.stroke();
    }
  }

  clearAnnotations(shareId: string): void {
    this.annotations.delete(shareId);
    if (this.annotationContext && this.annotationCanvas) {
      this.annotationContext.clearRect(
        0,
        0,
        this.annotationCanvas.width,
        this.annotationCanvas.height
      );
    }
    this.emit('annotationsCleared', shareId);
  }

  getActiveShares(): ScreenShare[] {
    return Array.from(this.activeShares.values());
  }

  getShareById(shareId: string): ScreenShare | undefined {
    return this.activeShares.get(shareId);
  }

  getAnnotations(shareId: string): Annotation[] {
    return this.annotations.get(shareId) || [];
  }

  getCurrentLayout(): LayoutMode {
    return this.currentLayout;
  }

  setMaxSimultaneousShares(max: number): void {
    this.maxSimultaneousShares = max;
  }

  destroy(): void {
    // Stop all active shares
    this.activeShares.forEach((share, id) => {
      this.stopScreenShare(id);
    });

    // Clear all data
    this.activeShares.clear();
    this.annotations.clear();

    // Remove canvas event listeners if initialized
    if (this.annotationCanvas) {
      this.annotationCanvas.removeEventListener('mousedown', this.handleMouseDown);
      this.annotationCanvas.removeEventListener('mousemove', this.handleMouseMove);
      this.annotationCanvas.removeEventListener('mouseup', this.handleMouseUp);
      this.annotationCanvas.removeEventListener('mouseleave', this.handleMouseUp);
      this.annotationCanvas.removeEventListener('touchstart', this.handleTouchStart);
      this.annotationCanvas.removeEventListener('touchmove', this.handleTouchMove);
      this.annotationCanvas.removeEventListener('touchend', this.handleTouchEnd);
    }

    this.removeAllListeners();
  }
}