import { EventEmitter } from 'events';
import { MLSEncryptionService } from '../encryption/MLSEncryptionService';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: number;
  type: 'text' | 'file' | 'system';
  fileReference?: {
    fileId: string;
    fileName: string;
    fileSize: number;
    ipfsHash: string;
  };
  reactions?: Map<string, string[]>; // emoji -> userIds
  edited?: boolean;
  editedAt?: number;
  replyTo?: string;
}

export interface TypingIndicator {
  userId: string;
  userName: string;
  timestamp: number;
}

export interface ChatServiceConfig {
  maxMessageLength: number;
  typingTimeout: number;
  historyLimit: number;
}

export class ChatService extends EventEmitter {
  private mlsService: MLSEncryptionService;
  private db: IDBDatabase | null = null;
  private messages = new Map<string, ChatMessage[]>();
  private typingUsers = new Map<string, Map<string, TypingIndicator>>();
  private config: ChatServiceConfig;
  private dataChannel: RTCDataChannel | null = null;
  private typingTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    mlsService: MLSEncryptionService,
    config: Partial<ChatServiceConfig> = {}
  ) {
    super();
    this.mlsService = mlsService;
    this.config = {
      maxMessageLength: config.maxMessageLength || 5000,
      typingTimeout: config.typingTimeout || 3000,
      historyLimit: config.historyLimit || 1000
    };
  }

  async initialize(): Promise<void> {
    // Initialize IndexedDB
    await this.initializeDatabase();
  }

  private async initializeDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('OpenCallChat', 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Messages store
        if (!db.objectStoreNames.contains('messages')) {
          const messageStore = db.createObjectStore('messages', {
            keyPath: 'id'
          });
          messageStore.createIndex('roomId', 'roomId', { unique: false });
          messageStore.createIndex('timestamp', 'timestamp', { unique: false });
          messageStore.createIndex('roomTimestamp', ['roomId', 'timestamp'], {
            unique: false
          });
        }
      };
    });
  }

  async sendMessage(
    roomId: string,
    content: string,
    type: 'text' | 'file' = 'text',
    fileReference?: ChatMessage['fileReference'],
    replyTo?: string
  ): Promise<ChatMessage> {
    if (content.length > this.config.maxMessageLength) {
      throw new Error(`Message exceeds maximum length of ${this.config.maxMessageLength}`);
    }

    const message: ChatMessage = {
      id: crypto.randomUUID(),
      roomId,
      senderId: this.mlsService.getClientId(),
      senderName: this.getUserName(),
      content,
      timestamp: Date.now(),
      type,
      fileReference,
      replyTo
    };

    // Store locally first
    await this.storeMessage(message);

    // Encrypt and send via data channel
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      const encryptedContent = await this.mlsService.encryptData(
        new TextEncoder().encode(JSON.stringify(message)),
        roomId
      );

      const packet = {
        type: 'chat_message',
        data: Array.from(encryptedContent)
      };

      this.dataChannel.send(JSON.stringify(packet));
    }

    // Emit local event
    this.emit('message', message);

    return message;
  }

  async receiveMessage(encryptedData: Uint8Array, roomId: string): Promise<void> {
    try {
      const decrypted = await this.mlsService.decryptData(encryptedData, roomId);
      const message = JSON.parse(new TextDecoder().decode(decrypted)) as ChatMessage;

      // Don't process our own messages
      if (message.senderId === this.mlsService.getClientId()) {
        return;
      }

      await this.storeMessage(message);
      this.emit('message', message);
    } catch (error) {
      console.error('Failed to receive message:', error);
    }
  }

  async loadMessageHistory(roomId: string, limit = 50, before?: number): Promise<ChatMessage[]> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['messages'], 'readonly');
      const store = transaction.objectStore('messages');
      const index = store.index('roomTimestamp');

      const messages: ChatMessage[] = [];
      const range = before
        ? IDBKeyRange.bound([roomId, 0], [roomId, before], false, true)
        : IDBKeyRange.bound([roomId, 0], [roomId, Date.now()]);

      const request = index.openCursor(range, 'prev');

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor && messages.length < limit) {
          messages.push(cursor.value);
          cursor.continue();
        } else {
          resolve(messages.reverse());
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  async searchMessages(roomId: string, query: string): Promise<ChatMessage[]> {
    const allMessages = await this.loadMessageHistory(roomId, this.config.historyLimit);
    const lowerQuery = query.toLowerCase();

    return allMessages.filter(
      msg =>
        msg.content.toLowerCase().includes(lowerQuery) ||
        msg.senderName.toLowerCase().includes(lowerQuery)
    );
  }

  async addReaction(messageId: string, emoji: string, userId: string): Promise<void> {
    const message = await this.getMessage(messageId);
    if (!message) return;

    if (!message.reactions) {
      message.reactions = new Map();
    }

    const users = message.reactions.get(emoji) || [];
    if (!users.includes(userId)) {
      users.push(userId);
      message.reactions.set(emoji, users);
    }

    await this.updateMessage(message);
    this.emit('reactionAdded', { messageId, emoji, userId });
  }

  async removeReaction(messageId: string, emoji: string, userId: string): Promise<void> {
    const message = await this.getMessage(messageId);
    if (!message || !message.reactions) return;

    const users = message.reactions.get(emoji) || [];
    const index = users.indexOf(userId);
    if (index > -1) {
      users.splice(index, 1);
      if (users.length === 0) {
        message.reactions.delete(emoji);
      } else {
        message.reactions.set(emoji, users);
      }
    }

    await this.updateMessage(message);
    this.emit('reactionRemoved', { messageId, emoji, userId });
  }

  sendTypingIndicator(roomId: string): void {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') return;

    const indicator = {
      type: 'typing_indicator',
      roomId,
      userId: this.mlsService.getClientId(),
      userName: this.getUserName(),
      timestamp: Date.now()
    };

    this.dataChannel.send(JSON.stringify(indicator));

    // Clear existing timer
    const timerId = this.typingTimers.get(roomId);
    if (timerId) {
      clearTimeout(timerId);
    }

    // Set new timer to stop typing
    const timer = setTimeout(() => {
      this.sendTypingStop(roomId);
    }, this.config.typingTimeout);

    this.typingTimers.set(roomId, timer);
  }

  private sendTypingStop(roomId: string): void {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') return;

    const stop = {
      type: 'typing_stop',
      roomId,
      userId: this.mlsService.getClientId()
    };

    this.dataChannel.send(JSON.stringify(stop));
    this.typingTimers.delete(roomId);
  }

  receiveTypingIndicator(data: any): void {
    const { roomId, userId, userName, timestamp } = data;

    if (!this.typingUsers.has(roomId)) {
      this.typingUsers.set(roomId, new Map());
    }

    const roomTyping = this.typingUsers.get(roomId)!;
    roomTyping.set(userId, { userId, userName, timestamp });

    this.emit('typingUpdate', roomId, Array.from(roomTyping.values()));

    // Auto-remove after timeout
    setTimeout(() => {
      const current = roomTyping.get(userId);
      if (current && current.timestamp === timestamp) {
        roomTyping.delete(userId);
        this.emit('typingUpdate', roomId, Array.from(roomTyping.values()));
      }
    }, this.config.typingTimeout + 1000);
  }

  receiveTypingStop(data: any): void {
    const { roomId, userId } = data;
    const roomTyping = this.typingUsers.get(roomId);
    
    if (roomTyping) {
      roomTyping.delete(userId);
      this.emit('typingUpdate', roomId, Array.from(roomTyping.values()));
    }
  }

  renderMarkdown(content: string): string {
    // Configure marked for safety
    marked.setOptions({
      breaks: true,
      gfm: true
    });

    const html = marked(content);
    return DOMPurify.sanitize(html);
  }

  setDataChannel(channel: RTCDataChannel): void {
    this.dataChannel = channel;

    channel.onmessage = async (event) => {
      try {
        const packet = JSON.parse(event.data);

        switch (packet.type) {
          case 'chat_message':
            const encryptedData = new Uint8Array(packet.data);
            // Extract roomId from the message or use current room
            await this.receiveMessage(encryptedData, packet.roomId);
            break;

          case 'typing_indicator':
            this.receiveTypingIndicator(packet);
            break;

          case 'typing_stop':
            this.receiveTypingStop(packet);
            break;
        }
      } catch (error) {
        console.error('Error processing data channel message:', error);
      }
    };
  }

  private async storeMessage(message: ChatMessage): Promise<void> {
    if (!this.db) return;

    const transaction = this.db.transaction(['messages'], 'readwrite');
    const store = transaction.objectStore('messages');

    // Convert Map to object for storage
    const storable = {
      ...message,
      reactions: message.reactions
        ? Object.fromEntries(message.reactions)
        : undefined
    };

    await new Promise((resolve, reject) => {
      const request = store.put(storable);
      request.onsuccess = () => resolve(undefined);
      request.onerror = () => reject(request.error);
    });

    // Update in-memory cache
    const roomMessages = this.messages.get(message.roomId) || [];
    roomMessages.push(message);
    this.messages.set(message.roomId, roomMessages);

    // Trim cache if needed
    if (roomMessages.length > this.config.historyLimit) {
      roomMessages.shift();
    }
  }

  private async getMessage(messageId: string): Promise<ChatMessage | null> {
    if (!this.db) return null;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['messages'], 'readonly');
      const store = transaction.objectStore('messages');
      const request = store.get(messageId);

      request.onsuccess = () => {
        const message = request.result;
        if (message && message.reactions) {
          // Convert object back to Map
          message.reactions = new Map(Object.entries(message.reactions));
        }
        resolve(message || null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  private async updateMessage(message: ChatMessage): Promise<void> {
    await this.storeMessage(message);
    this.emit('messageUpdated', message);
  }

  private getUserName(): string {
    // This should be replaced with actual user name from auth service
    return 'User-' + this.mlsService.getClientId().substring(0, 8);
  }

  async clearHistory(roomId: string): Promise<void> {
    if (!this.db) return;

    const transaction = this.db.transaction(['messages'], 'readwrite');
    const store = transaction.objectStore('messages');
    const index = store.index('roomId');
    const range = IDBKeyRange.only(roomId);

    await new Promise((resolve, reject) => {
      const request = index.openCursor(range);
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve(undefined);
        }
      };
      request.onerror = () => reject(request.error);
    });

    this.messages.delete(roomId);
    this.emit('historyCleared', roomId);
  }

  destroy(): void {
    // Clear all timers
    this.typingTimers.forEach(timer => clearTimeout(timer));
    this.typingTimers.clear();

    // Close database
    if (this.db) {
      this.db.close();
      this.db = null;
    }

    // Clear memory
    this.messages.clear();
    this.typingUsers.clear();

    // Remove all listeners
    this.removeAllListeners();
  }
}