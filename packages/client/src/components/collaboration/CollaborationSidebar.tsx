import React, { useState, useEffect, useCallback } from 'react';
import { IPFSService } from '../../services/ipfs/IPFSService';
import { ChatService } from '../../services/chat/ChatService';
import { EnhancedScreenShareService } from '../../services/screenShare/EnhancedScreenShareService';
import { MLSEncryptionService } from '../../services/encryption/MLSEncryptionService';
import { FileSharing } from './FileSharing';
import { Chat } from './Chat';
import { ScreenShareControls } from './ScreenShareControls';
import styles from './CollaborationSidebar.module.css';

interface CollaborationSidebarProps {
  roomId: string;
  currentUserId: string;
  currentUserName: string;
  mlsService: MLSEncryptionService;
  dataChannel?: RTCDataChannel;
  isOpen?: boolean;
  onToggle?: (isOpen: boolean) => void;
}

type TabType = 'chat' | 'files' | 'screen';

export const CollaborationSidebar: React.FC<CollaborationSidebarProps> = ({
  roomId,
  currentUserId,
  currentUserName,
  mlsService,
  dataChannel,
  isOpen = true,
  onToggle
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('chat');
  const [ipfsService, setIpfsService] = useState<IPFSService | null>(null);
  const [chatService, setChatService] = useState<ChatService | null>(null);
  const [screenShareService, setScreenShareService] = useState<EnhancedScreenShareService | null>(null);
  const [unreadCounts, setUnreadCounts] = useState({
    chat: 0,
    files: 0,
    screen: 0
  });
  const [sharedFiles, setSharedFiles] = useState<any[]>([]);

  useEffect(() => {
    initializeServices();
    return () => {
      cleanupServices();
    };
  }, [mlsService]);

  useEffect(() => {
    if (chatService && dataChannel) {
      chatService.setDataChannel(dataChannel);
    }
  }, [chatService, dataChannel]);

  const initializeServices = async () => {
    // Initialize IPFS service
    const ipfs = new IPFSService(mlsService);
    try {
      await ipfs.initialize();
      setIpfsService(ipfs);
    } catch (error) {
      console.error('Failed to initialize IPFS:', error);
    }

    // Initialize chat service
    const chat = new ChatService(mlsService);
    await chat.initialize();
    setChatService(chat);

    // Initialize screen share service
    const screenShare = new EnhancedScreenShareService();
    setScreenShareService(screenShare);

    // Subscribe to events
    chat.on('message', handleNewMessage);
    ipfs.on('uploadProgress', handleFileUploadProgress);
  };

  const cleanupServices = () => {
    ipfsService?.disconnect();
    chatService?.destroy();
    screenShareService?.destroy();
  };

  const handleNewMessage = useCallback(() => {
    if (activeTab !== 'chat') {
      setUnreadCounts(prev => ({ ...prev, chat: prev.chat + 1 }));
    }
  }, [activeTab]);

  const handleFileUploadProgress = useCallback(() => {
    if (activeTab !== 'files') {
      setUnreadCounts(prev => ({ ...prev, files: prev.files + 1 }));
    }
  }, [activeTab]);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setUnreadCounts(prev => ({ ...prev, [tab]: 0 }));
  };

  const handleFileShared = (file: any) => {
    setSharedFiles(prev => [...prev, file]);
    
    // Send file share notification in chat
    if (chatService) {
      chatService.sendMessage(
        roomId,
        `Shared file: ${file.name}`,
        'file',
        {
          fileId: file.id,
          fileName: file.name,
          fileSize: file.size,
          ipfsHash: file.ipfsHash
        }
      );
    }
  };

  const handleFileReference = async (ipfsHash: string) => {
    if (!ipfsService) return;

    try {
      const { file, metadata } = await ipfsService.downloadFile(
        ipfsHash,
        roomId,
        (progress) => {
          console.log(`Download progress: ${progress} bytes`);
        }
      );

      // Create download link
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = metadata.fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download file:', error);
    }
  };

  const tabs = [
    { id: 'chat' as TabType, label: 'Chat', icon: '💬' },
    { id: 'files' as TabType, label: 'Files', icon: '📁' },
    { id: 'screen' as TabType, label: 'Screen', icon: '🖥️' }
  ];

  return (
    <div className={`${styles.container} ${isOpen ? styles.open : styles.closed}`}>
      <div className={styles.header}>
        <button
          className={styles.toggleButton}
          onClick={() => onToggle?.(!isOpen)}
          title={isOpen ? 'Close sidebar' : 'Open sidebar'}
        >
          {isOpen ? '←' : '→'}
        </button>
        {isOpen && <h2>Collaboration</h2>}
      </div>

      {isOpen && (
        <>
          <div className={styles.tabs}>
            {tabs.map(tab => (
              <button
                key={tab.id}
                className={`${styles.tab} ${activeTab === tab.id ? styles.activeTab : ''}`}
                onClick={() => handleTabChange(tab.id)}
              >
                <span className={styles.tabIcon}>{tab.icon}</span>
                <span className={styles.tabLabel}>{tab.label}</span>
                {unreadCounts[tab.id] > 0 && (
                  <span className={styles.badge}>{unreadCounts[tab.id]}</span>
                )}
              </button>
            ))}
          </div>

          <div className={styles.content}>
            {activeTab === 'chat' && chatService && (
              <Chat
                chatService={chatService}
                roomId={roomId}
                currentUserId={currentUserId}
                onFileReference={handleFileReference}
                sharedFiles={sharedFiles}
              />
            )}

            {activeTab === 'files' && ipfsService && (
              <FileSharing
                ipfsService={ipfsService}
                meetingId={roomId}
                onFileShared={handleFileShared}
              />
            )}

            {activeTab === 'screen' && screenShareService && (
              <ScreenShareControls
                screenShareService={screenShareService}
                currentUserId={currentUserId}
                currentUserName={currentUserName}
              />
            )}
          </div>
        </>
      )}

      {!isOpen && (
        <div className={styles.collapsedTabs}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`${styles.collapsedTab} ${activeTab === tab.id ? styles.activeTab : ''}`}
              onClick={() => {
                onToggle?.(true);
                handleTabChange(tab.id);
              }}
              title={tab.label}
            >
              <span className={styles.tabIcon}>{tab.icon}</span>
              {unreadCounts[tab.id] > 0 && (
                <span className={styles.collapsedBadge}>{unreadCounts[tab.id]}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};