import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChatService, ChatMessage, TypingIndicator } from '../../services/chat/ChatService';
import { SharedFile } from '../../services/ipfs/IPFSService';
import styles from './Chat.module.css';

interface ChatProps {
  chatService: ChatService;
  roomId: string;
  currentUserId: string;
  onFileReference?: (ipfsHash: string) => void;
  sharedFiles?: SharedFile[];
}

export const Chat: React.FC<ChatProps> = ({
  chatService,
  roomId,
  currentUserId,
  onFileReference,
  sharedFiles = []
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [typingUsers, setTypingUsers] = useState<TypingIndicator[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();

  const commonEmojis = ['👍', '❤️', '😂', '🎉', '👏', '🙌', '✅', '❌'];

  useEffect(() => {
    loadMessages();

    // Subscribe to chat events
    chatService.on('message', handleNewMessage);
    chatService.on('typingUpdate', handleTypingUpdate);
    chatService.on('reactionAdded', handleReactionUpdate);
    chatService.on('reactionRemoved', handleReactionUpdate);

    return () => {
      chatService.off('message', handleNewMessage);
      chatService.off('typingUpdate', handleTypingUpdate);
      chatService.off('reactionAdded', handleReactionUpdate);
      chatService.off('reactionRemoved', handleReactionUpdate);
    };
  }, [roomId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadMessages = async () => {
    setIsLoading(true);
    try {
      const history = await chatService.loadMessageHistory(roomId, 50);
      setMessages(history);
    } catch (error) {
      console.error('Failed to load messages:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewMessage = (message: ChatMessage) => {
    if (message.roomId === roomId) {
      setMessages(prev => [...prev, message]);
    }
  };

  const handleTypingUpdate = (updateRoomId: string, users: TypingIndicator[]) => {
    if (updateRoomId === roomId) {
      setTypingUsers(users.filter(u => u.userId !== currentUserId));
    }
  };

  const handleReactionUpdate = () => {
    loadMessages(); // Reload to get updated reactions
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async () => {
    const trimmedMessage = inputValue.trim();
    if (!trimmedMessage) return;

    try {
      await chatService.sendMessage(
        roomId,
        trimmedMessage,
        'text',
        undefined,
        replyingTo?.id
      );
      setInputValue('');
      setReplyingTo(null);
      inputRef.current?.focus();
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleTyping = () => {
    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Send typing indicator
    chatService.sendTypingIndicator(roomId);

    // Set new timeout
    typingTimeoutRef.current = setTimeout(() => {
      // Typing stopped
    }, 1000);
  };

  const handleReaction = async (messageId: string, emoji: string) => {
    await chatService.addReaction(messageId, emoji, currentUserId);
    setShowEmojiPicker(false);
  };

  const handleFileShare = async (file: SharedFile) => {
    await chatService.sendMessage(
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
  };

  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const renderMessage = (message: ChatMessage) => {
    const isOwn = message.senderId === currentUserId;
    const reactions = message.reactions ? Array.from(message.reactions.entries()) : [];

    return (
      <div
        key={message.id}
        className={`${styles.message} ${isOwn ? styles.ownMessage : ''}`}
      >
        {!isOwn && (
          <div className={styles.senderName}>{message.senderName}</div>
        )}
        
        {message.replyTo && (
          <div className={styles.replyIndicator}>
            Replying to a message
          </div>
        )}

        <div className={styles.messageContent}>
          {message.type === 'text' ? (
            <div
              dangerouslySetInnerHTML={{
                __html: chatService.renderMarkdown(message.content)
              }}
            />
          ) : message.type === 'file' && message.fileReference ? (
            <div className={styles.fileMessage}>
              <div className={styles.fileIcon}>📎</div>
              <div className={styles.fileInfo}>
                <p className={styles.fileName}>{message.fileReference.fileName}</p>
                <p className={styles.fileSize}>
                  {formatFileSize(message.fileReference.fileSize)}
                </p>
              </div>
              <button
                className={styles.downloadButton}
                onClick={() => onFileReference?.(message.fileReference!.ipfsHash)}
              >
                Download
              </button>
            </div>
          ) : (
            <p>{message.content}</p>
          )}
        </div>

        <div className={styles.messageFooter}>
          <span className={styles.timestamp}>{formatTime(message.timestamp)}</span>
          {message.edited && <span className={styles.edited}>(edited)</span>}
        </div>

        {reactions.length > 0 && (
          <div className={styles.reactions}>
            {reactions.map(([emoji, users]) => (
              <button
                key={emoji}
                className={styles.reaction}
                onClick={() => {
                  if (users.includes(currentUserId)) {
                    chatService.removeReaction(message.id, emoji, currentUserId);
                  } else {
                    chatService.addReaction(message.id, emoji, currentUserId);
                  }
                }}
              >
                {emoji} {users.length}
              </button>
            ))}
          </div>
        )}

        <div className={styles.messageActions}>
          <button
            className={styles.actionButton}
            onClick={() => setReplyingTo(message)}
            title="Reply"
          >
            ↩️
          </button>
          <button
            className={styles.actionButton}
            onClick={() => setShowEmojiPicker(true)}
            title="React"
          >
            😊
          </button>
        </div>

        {showEmojiPicker && (
          <div className={styles.emojiPicker}>
            {commonEmojis.map(emoji => (
              <button
                key={emoji}
                className={styles.emojiButton}
                onClick={() => handleReaction(message.id, emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3>Chat</h3>
      </div>

      <div className={styles.messagesContainer}>
        {isLoading ? (
          <div className={styles.loading}>Loading messages...</div>
        ) : messages.length === 0 ? (
          <div className={styles.emptyState}>
            No messages yet. Start the conversation!
          </div>
        ) : (
          <>
            {messages.map(renderMessage)}
            <div ref={messagesEndRef} />
          </>
        )}

        {typingUsers.length > 0 && (
          <div className={styles.typingIndicator}>
            {typingUsers.map(u => u.userName).join(', ')}
            {typingUsers.length === 1 ? ' is' : ' are'} typing...
          </div>
        )}
      </div>

      {replyingTo && (
        <div className={styles.replyBar}>
          <div className={styles.replyContent}>
            <span>Replying to {replyingTo.senderName}</span>
            <p>{replyingTo.content.substring(0, 50)}...</p>
          </div>
          <button
            className={styles.cancelReply}
            onClick={() => setReplyingTo(null)}
          >
            ✕
          </button>
        </div>
      )}

      <div className={styles.inputContainer}>
        <textarea
          ref={inputRef}
          className={styles.input}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            handleTyping();
          }}
          onKeyPress={handleKeyPress}
          placeholder="Type a message..."
          rows={1}
        />
        <button
          className={styles.sendButton}
          onClick={handleSendMessage}
          disabled={!inputValue.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
};