/**
 * Example: Integrating MLS with WebRTC for encrypted communications
 * 
 * This example shows how to use MLS to encrypt WebRTC data channels
 * and provide end-to-end encryption for group calls.
 */

import { MLSClient, MLSGroup, MLSCiphertext } from './';

interface EncryptedMessage {
  type: 'encrypted';
  ciphertext: MLSCiphertext;
  senderId: string;
}

interface MLSCommitMessage {
  type: 'mls-commit';
  commit: Uint8Array;
}

interface MLSWelcomeMessage {
  type: 'mls-welcome';
  welcome: Uint8Array;
}

type SignalingMessage = EncryptedMessage | MLSCommitMessage | MLSWelcomeMessage;

/**
 * WebRTC + MLS Integration Example
 */
export class SecureWebRTCRoom {
  private mlsClient: MLSClient;
  private mlsGroup?: MLSGroup;
  private peerConnections = new Map<string, RTCPeerConnection>();
  private dataChannels = new Map<string, RTCDataChannel>();

  constructor(
    private userId: string,
    private roomId: string,
    private signalingServer: WebSocket
  ) {
    this.mlsClient = new MLSClient({ identity: userId });
    this.setupSignalingHandlers();
  }

  async initialize() {
    await this.mlsClient.initialize();
  }

  /**
   * Create a new secure room (for room creator)
   */
  async createRoom() {
    this.mlsGroup = await this.mlsClient.createGroup(this.roomId);
    console.log('Created secure MLS group for room:', this.roomId);
  }

  /**
   * Join an existing room using MLS welcome message
   */
  async joinRoom(welcomeMessage: Uint8Array) {
    this.mlsGroup = await this.mlsClient.joinGroup(welcomeMessage);
    console.log('Joined secure MLS group');
  }

  /**
   * Add a new peer to the room
   */
  async addPeer(peerId: string, keyPackage: Uint8Array) {
    if (!this.mlsGroup) throw new Error('MLS group not initialized');

    // Add to MLS group
    const commit = await this.mlsGroup.addMember(keyPackage);

    // Send welcome message to new peer
    this.sendSignalingMessage(peerId, {
      type: 'mls-welcome',
      welcome: commit.welcome[0],
    });

    // Broadcast commit to existing members
    this.broadcastToAllPeers({
      type: 'mls-commit',
      commit: commit.commit,
    });

    // Create WebRTC connection
    await this.createPeerConnection(peerId);
  }

  /**
   * Remove a peer from the room
   */
  async removePeer(peerId: string) {
    if (!this.mlsGroup) throw new Error('MLS group not initialized');

    // Remove from MLS group
    const commit = await this.mlsGroup.removeMember(peerId);

    // Broadcast commit to remaining members
    this.broadcastToAllPeers({
      type: 'mls-commit',
      commit: commit.commit,
    });

    // Clean up WebRTC connection
    this.closePeerConnection(peerId);
  }

  /**
   * Send an encrypted message to all peers
   */
  async sendSecureMessage(message: string) {
    if (!this.mlsGroup) throw new Error('MLS group not initialized');

    // Encrypt message with MLS
    const plaintext = new TextEncoder().encode(message);
    const ciphertext = await this.mlsGroup.encrypt(plaintext);

    // Send via WebRTC data channels
    const encryptedMessage: EncryptedMessage = {
      type: 'encrypted',
      ciphertext,
      senderId: this.userId,
    };

    this.broadcastToAllPeers(encryptedMessage);
  }

  /**
   * Handle incoming messages from peers
   */
  private async handleDataChannelMessage(peerId: string, data: ArrayBuffer) {
    const message = JSON.parse(new TextDecoder().decode(data)) as SignalingMessage;

    switch (message.type) {
      case 'encrypted':
        await this.handleEncryptedMessage(message);
        break;
      case 'mls-commit':
        await this.handleMLSCommit(message);
        break;
      default:
        console.warn('Unknown message type:', message);
    }
  }

  private async handleEncryptedMessage(message: EncryptedMessage) {
    if (!this.mlsGroup) throw new Error('MLS group not initialized');

    try {
      // Decrypt message
      const plaintext = await this.mlsGroup.decrypt(message.ciphertext);
      const decryptedMessage = new TextDecoder().decode(plaintext);

      console.log(`Message from ${message.senderId}:`, decryptedMessage);
      
      // Emit event for application layer
      this.onSecureMessage?.(message.senderId, decryptedMessage);
    } catch (error) {
      console.error('Failed to decrypt message:', error);
    }
  }

  private async handleMLSCommit(message: MLSCommitMessage) {
    if (!this.mlsGroup) throw new Error('MLS group not initialized');

    try {
      // Process the commit to update group state
      await this.mlsGroup.processCommit(message.commit);
      console.log('Processed MLS commit, group state updated');
    } catch (error) {
      console.error('Failed to process MLS commit:', error);
    }
  }

  /**
   * Create WebRTC peer connection with encrypted data channel
   */
  private async createPeerConnection(peerId: string) {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    // Create data channel for encrypted messages
    const dataChannel = pc.createDataChannel('mls-encrypted', {
      ordered: true,
    });

    dataChannel.onopen = () => {
      console.log(`Data channel opened with ${peerId}`);
      this.dataChannels.set(peerId, dataChannel);
    };

    dataChannel.onmessage = (event) => {
      this.handleDataChannelMessage(peerId, event.data);
    };

    this.peerConnections.set(peerId, pc);

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignalingMessage(peerId, {
          type: 'ice-candidate',
          candidate: event.candidate,
        });
      }
    };

    // Create and send offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    
    this.sendSignalingMessage(peerId, {
      type: 'offer',
      sdp: offer,
    });
  }

  private closePeerConnection(peerId: string) {
    const pc = this.peerConnections.get(peerId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(peerId);
    }

    const dc = this.dataChannels.get(peerId);
    if (dc) {
      dc.close();
      this.dataChannels.delete(peerId);
    }
  }

  private broadcastToAllPeers(message: SignalingMessage) {
    const data = JSON.stringify(message);
    this.dataChannels.forEach((channel) => {
      if (channel.readyState === 'open') {
        channel.send(data);
      }
    });
  }

  private sendSignalingMessage(peerId: string, message: any) {
    this.signalingServer.send(JSON.stringify({
      to: peerId,
      from: this.userId,
      ...message,
    }));
  }

  private setupSignalingHandlers() {
    this.signalingServer.onmessage = async (event) => {
      const message = JSON.parse(event.data);
      
      switch (message.type) {
        case 'mls-welcome':
          // New member receiving welcome
          await this.joinRoom(message.welcome);
          break;
        case 'offer':
          await this.handleOffer(message.from, message.sdp);
          break;
        case 'answer':
          await this.handleAnswer(message.from, message.sdp);
          break;
        case 'ice-candidate':
          await this.handleIceCandidate(message.from, message.candidate);
          break;
      }
    };
  }

  private async handleOffer(peerId: string, offer: RTCSessionDescriptionInit) {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    this.peerConnections.set(peerId, pc);

    pc.ondatachannel = (event) => {
      const channel = event.channel;
      channel.onopen = () => {
        this.dataChannels.set(peerId, channel);
      };
      channel.onmessage = (event) => {
        this.handleDataChannelMessage(peerId, event.data);
      };
    };

    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    this.sendSignalingMessage(peerId, {
      type: 'answer',
      sdp: answer,
    });
  }

  private async handleAnswer(peerId: string, answer: RTCSessionDescriptionInit) {
    const pc = this.peerConnections.get(peerId);
    if (pc) {
      await pc.setRemoteDescription(answer);
    }
  }

  private async handleIceCandidate(peerId: string, candidate: RTCIceCandidateInit) {
    const pc = this.peerConnections.get(peerId);
    if (pc) {
      await pc.addIceCandidate(candidate);
    }
  }

  // Event handlers (to be set by application)
  onSecureMessage?: (senderId: string, message: string) => void;
}

// Example usage:
async function example() {
  // Create signaling connection
  const ws = new WebSocket('wss://signaling.example.com');
  
  // Create secure room
  const room = new SecureWebRTCRoom('alice@example.com', 'meeting-123', ws);
  await room.initialize();
  
  // Room creator
  await room.createRoom();
  
  // Handle secure messages
  room.onSecureMessage = (senderId, message) => {
    console.log(`Secure message from ${senderId}: ${message}`);
  };
  
  // Send encrypted message
  await room.sendSecureMessage('Hello, this is end-to-end encrypted!');
}