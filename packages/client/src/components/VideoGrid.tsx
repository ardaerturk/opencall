import { useEffect, useRef } from 'react';
import { usePeers } from '../hooks/usePeers';
import { useMediaStore } from '../stores/mediaStore';

interface VideoTileProps {
  stream: MediaStream;
  muted?: boolean;
  label?: string;
  isLocal?: boolean;
}

function VideoTile({ stream, muted = false, label, isLocal = false }: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      paddingBottom: '56.25%', // 16:9 aspect ratio
      background: '#000',
      borderRadius: '8px',
      overflow: 'hidden',
    }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />
      {label && (
        <div style={{
          position: 'absolute',
          bottom: '10px',
          left: '10px',
          background: 'rgba(0, 0, 0, 0.7)',
          color: 'white',
          padding: '5px 10px',
          borderRadius: '4px',
          fontSize: '14px',
        }}>
          {label} {isLocal && '(You)'}
        </div>
      )}
    </div>
  );
}

export function VideoGrid() {
  const localStream = useMediaStore((state) => state.localStream);
  const { connectedPeers } = usePeers();

  const totalVideos = (localStream ? 1 : 0) + connectedPeers.length;
  
  // Calculate grid layout
  const getGridColumns = () => {
    if (totalVideos <= 1) return 1;
    if (totalVideos <= 4) return 2;
    if (totalVideos <= 9) return 3;
    return 4;
  };

  const gridColumns = getGridColumns();

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${gridColumns}, 1fr)`,
      gap: '10px',
      width: '100%',
      maxWidth: '1200px',
      margin: '0 auto',
    }}>
      {localStream && (
        <VideoTile
          stream={localStream}
          muted={true}
          label="You"
          isLocal={true}
        />
      )}
      
      {connectedPeers.map((peer) => (
        peer.remoteStream && (
          <VideoTile
            key={peer.peerId}
            stream={peer.remoteStream}
            label={peer.displayName || peer.peerId.slice(0, 8)}
          />
        )
      ))}
    </div>
  );
}