# OpenCall Collaboration Features

This module provides advanced collaboration features for OpenCall meetings, including encrypted file sharing via IPFS, enhanced screen sharing with annotations, and real-time encrypted chat.

## Features

### 1. IPFS File Sharing
- **Encrypted file uploads**: Files are encrypted using MLS before uploading to IPFS
- **Drag-and-drop support**: Easy file sharing with visual feedback
- **Progress tracking**: Real-time upload/download progress
- **Secure sharing**: Only meeting participants can decrypt shared files

### 2. Enhanced Screen Sharing
- **Multiple simultaneous shares**: Support up to 4 concurrent screen shares
- **Annotation tools**: Draw and point on shared screens
- **Quality control**: Adjustable quality from 720p to 4K
- **Layout modes**: Focus, grid, and side-by-side views
- **Application-specific capture**: Share specific windows or entire screen

### 3. Encrypted Chat
- **End-to-end encryption**: All messages encrypted using MLS
- **Rich text support**: Markdown formatting for messages
- **File references**: Link to shared files in chat
- **Message reactions**: React to messages with emojis
- **Typing indicators**: See when others are typing
- **Persistent history**: Messages stored locally in IndexedDB

## Usage

### Basic Integration

```tsx
import { CollaborationSidebar } from '@opencall/client/components/collaboration';
import { mlsEncryptionService } from '@opencall/client/services/encryption';

function MeetingRoom({ meetingId, userId, userName }) {
  const [dataChannel, setDataChannel] = useState(null);
  
  // Initialize MLS encryption
  useEffect(() => {
    mlsEncryptionService.initialize(userId);
    mlsEncryptionService.createGroup(meetingId);
  }, []);

  return (
    <CollaborationSidebar
      roomId={meetingId}
      currentUserId={userId}
      currentUserName={userName}
      mlsService={mlsEncryptionService}
      dataChannel={dataChannel}
      isOpen={true}
      onToggle={(isOpen) => console.log('Sidebar:', isOpen)}
    />
  );
}
```

### Data Channel Setup

```tsx
import { useDataChannel } from '@opencall/client/hooks/useDataChannel';

function Meeting({ peerConnection }) {
  const { dataChannel, isOpen, sendMessage } = useDataChannel(peerConnection, {
    label: 'collaboration',
    onMessage: (message) => {
      console.log('Received:', message);
    }
  });

  // Pass dataChannel to CollaborationSidebar
  return <CollaborationSidebar dataChannel={dataChannel} ... />;
}
```

## Architecture

### Service Layer
- **IPFSService**: Handles file encryption, upload, and retrieval
- **ChatService**: Manages encrypted messaging and history
- **EnhancedScreenShareService**: Controls screen sharing and annotations

### Security
- All data is encrypted using MLS group encryption
- Files are encrypted before IPFS upload
- Chat messages include sender verification
- Screen share annotations are ephemeral (not stored)

### Performance
- IPFS client is lazy-loaded
- Large files are chunked for upload
- Chat history uses virtual scrolling
- Images are compressed before sharing

## Configuration

### IPFS Node
By default, connects to local IPFS node at `http://localhost:5001`. Can be configured:

```typescript
const ipfsService = new IPFSService(mlsService);
// Configure custom IPFS node in the service
```

### Chat Settings
```typescript
const chatService = new ChatService(mlsService, {
  maxMessageLength: 5000,
  typingTimeout: 3000,
  historyLimit: 1000
});
```

### Screen Share Quality
```typescript
const screenShareService = new EnhancedScreenShareService();
screenShareService.setMaxSimultaneousShares(4);
```

## Browser Support
- Chrome/Edge: Full support
- Firefox: Full support (screen share may have limitations)
- Safari: Limited screen share support, full chat/file support

## Dependencies
- `ipfs-http-client`: IPFS connectivity
- `marked` & `dompurify`: Safe markdown rendering
- `events`: Event emitter for service communication
- IndexedDB: Local storage for chat history