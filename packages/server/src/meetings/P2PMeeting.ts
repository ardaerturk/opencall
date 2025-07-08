import { Meeting, Participant } from './Meeting';
import { MeetingId, MeetingOptions } from '@opencall/core';
import { createLibp2p, Libp2p } from 'libp2p';
import { webSockets } from '@libp2p/websockets';
import { webRTC } from '@libp2p/webrtc';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { identify } from '@libp2p/identify';
import { logger } from '../utils/logger';

interface P2PConnectionInfo {
  mode: 'p2p';
  libp2pPeerId: string;
  relayAddresses: string[];
  directAddresses: string[];
}

export class P2PMeeting extends Meeting {
  private libp2pNode?: Libp2p;
  private peerConnections = new Map<string, any>();

  constructor(id: MeetingId, options: MeetingOptions, hostId: string) {
    super(id, options, hostId);
    this.initializeP2P();
  }

  private async initializeP2P(): Promise<void> {
    try {
      this.libp2pNode = await createLibp2p({
        addresses: {
          listen: [
            '/ip4/0.0.0.0/tcp/0/ws',
            '/webrtc',
          ],
        },
        transports: [
          webSockets(),
          webRTC({
            rtcConfiguration: {
              iceServers: [
                {
                  urls: [
                    'stun:stun.l.google.com:19302',
                    'stun:stun1.l.google.com:19302',
                  ],
                },
              ],
            },
          }),
          circuitRelayTransport(),
        ],
        connectionEncrypters: [noise()],
        streamMuxers: [yamux()],
        services: {
          identify: identify(),
        },
      });

      await this.libp2pNode.start();
      logger.info(`P2P node started for meeting ${this.id}`, {
        peerId: this.libp2pNode.peerId.toString(),
      });

      this.setupP2PEventHandlers();
    } catch (error) {
      logger.error(`Failed to initialize P2P for meeting ${this.id}`, error);
      throw error;
    }
  }

  private setupP2PEventHandlers(): void {
    if (!this.libp2pNode) return;

    this.libp2pNode.addEventListener('peer:connect', (evt) => {
      logger.info(`Peer connected in meeting ${this.id}`, {
        peerId: evt.detail.toString(),
      });
      this.emit('peer:connected', evt.detail);
    });

    this.libp2pNode.addEventListener('peer:disconnect', (evt) => {
      logger.info(`Peer disconnected in meeting ${this.id}`, {
        peerId: evt.detail.toString(),
      });
      this.emit('peer:disconnected', evt.detail);
    });
  }

  async addParticipant(participant: Participant): Promise<void> {
    this.participants.set(participant.id, participant);
    
    // Notify other participants
    this.emit('participant:joined', participant);
    
    logger.info(`Participant joined P2P meeting ${this.id}`, {
      participantId: participant.id,
      totalParticipants: this.participants.size,
    });

    // Check if we need to upgrade to SFU
    if (this.participants.size > 3) {
      this.emit('upgrade:required', { currentSize: this.participants.size });
    }
  }

  async removeParticipant(participantId: string): Promise<void> {
    const participant = this.participants.get(participantId);
    if (!participant) return;

    this.participants.delete(participantId);
    
    // Clean up peer connection
    const connection = this.peerConnections.get(participantId);
    if (connection) {
      connection.close();
      this.peerConnections.delete(participantId);
    }

    this.emit('participant:left', participant);
    
    logger.info(`Participant left P2P meeting ${this.id}`, {
      participantId,
      remainingParticipants: this.participants.size,
    });
  }

  async close(): Promise<void> {
    // Close all peer connections
    for (const [_, connection] of this.peerConnections) {
      connection.close();
    }
    this.peerConnections.clear();

    // Stop libp2p node
    if (this.libp2pNode) {
      await this.libp2pNode.stop();
    }

    this.participants.clear();
    this.emit('meeting:closed');
    
    logger.info(`P2P meeting ${this.id} closed`);
  }

  getConnectionInfo(): P2PConnectionInfo {
    if (!this.libp2pNode) {
      throw new Error('P2P node not initialized');
    }

    const addresses = this.libp2pNode.getMultiaddrs();
    const relayAddresses = addresses
      .filter(addr => addr.toString().includes('p2p-circuit'))
      .map(addr => addr.toString());
    const directAddresses = addresses
      .filter(addr => !addr.toString().includes('p2p-circuit'))
      .map(addr => addr.toString());

    return {
      mode: 'p2p',
      libp2pPeerId: this.libp2pNode.peerId.toString(),
      relayAddresses,
      directAddresses,
    };
  }

  async upgradeToSFU(): Promise<any> {
    // Export current state for migration
    const state = {
      participants: Array.from(this.participants.values()),
      meetingInfo: this.getMeetingInfo(),
    };

    // Close P2P connections gracefully
    await this.close();

    return state;
  }
}