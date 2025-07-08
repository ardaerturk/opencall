import { describe, it, expect, beforeEach } from 'vitest';
import { MLSClient, MLSError, MLSErrorCode } from '../';

describe('MLSClient', () => {
  let client1: MLSClient;
  let client2: MLSClient;
  let client3: MLSClient;

  beforeEach(() => {
    client1 = new MLSClient({ identity: 'user1' });
    client2 = new MLSClient({ identity: 'user2' });
    client3 = new MLSClient({ identity: 'user3' });
  });

  describe('initialization', () => {
    it('should initialize a client successfully', async () => {
      await expect(client1.initialize()).resolves.toBeUndefined();
    });

    it('should throw error if initialized multiple times', async () => {
      await client1.initialize();
      // Second initialization should succeed (idempotent)
      await expect(client1.initialize()).resolves.toBeUndefined();
    });
  });

  describe('key package management', () => {
    it('should export a key package', async () => {
      await client1.initialize();
      const keyPackage = await client1.exportKeyPackage();
      
      expect(keyPackage).toBeInstanceOf(Uint8Array);
      expect(keyPackage.length).toBeGreaterThan(0);
    });

    it('should throw error if client not initialized', async () => {
      await expect(client1.exportKeyPackage()).rejects.toThrow(MLSError);
    });
  });

  describe('group management', () => {
    it('should create a new group', async () => {
      await client1.initialize();
      const groupId = 'test-group-1';
      const group = await client1.createGroup(groupId);
      
      expect(group).toBeDefined();
      expect(group.getCurrentEpoch()).toBe(0);
    });

    it('should add members to a group', async () => {
      // Initialize all clients
      await client1.initialize();
      await client2.initialize();
      
      // Create group
      const groupId = 'test-group-2';
      const group = await client1.createGroup(groupId);
      
      // Get key package from client2
      const keyPackage2 = await client2.exportKeyPackage();
      
      // Add client2 to the group
      const commit = await group.addMember(keyPackage2);
      
      expect(commit).toBeDefined();
      expect(commit.commit).toBeInstanceOf(Uint8Array);
      expect(commit.welcome).toBeInstanceOf(Array);
      expect(commit.welcome.length).toBe(1);
    });

    it('should allow new member to join via welcome message', async () => {
      // Initialize clients
      await client1.initialize();
      await client2.initialize();
      
      // Create group and add member
      const groupId = 'test-group-3';
      const group1 = await client1.createGroup(groupId);
      const keyPackage2 = await client2.exportKeyPackage();
      const commit = await group1.addMember(keyPackage2);
      
      // Client2 joins using welcome message
      const group2 = await client2.joinGroup(commit.welcome[0]);
      
      expect(group2).toBeDefined();
      expect(group2.getCurrentEpoch()).toBeGreaterThan(0);
    });

    it('should remove members from a group', async () => {
      // Initialize clients
      await client1.initialize();
      await client2.initialize();
      await client3.initialize();
      
      // Create group and add members
      const groupId = 'test-group-4';
      const group1 = await client1.createGroup(groupId);
      const keyPackage2 = await client2.exportKeyPackage();
      const keyPackage3 = await client3.exportKeyPackage();
      
      await group1.addMember(keyPackage2);
      await group1.addMember(keyPackage3);
      
      // Remove user2
      const removeCommit = await group1.removeMember('user2');
      
      expect(removeCommit).toBeDefined();
      expect(removeCommit.commit).toBeInstanceOf(Uint8Array);
    });
  });

  describe('message encryption/decryption', () => {
    it('should encrypt and decrypt messages', async () => {
      // Initialize clients
      await client1.initialize();
      await client2.initialize();
      
      // Create group and add member
      const groupId = 'test-group-5';
      const group1 = await client1.createGroup(groupId);
      const keyPackage2 = await client2.exportKeyPackage();
      const commit = await group1.addMember(keyPackage2);
      
      // Client2 joins
      const group2 = await client2.joinGroup(commit.welcome[0]);
      
      // Encrypt message from client1
      const plaintext = new TextEncoder().encode('Hello, MLS!');
      const ciphertext = await group1.encrypt(plaintext);
      
      expect(ciphertext).toBeDefined();
      expect(ciphertext.data).toBeInstanceOf(Uint8Array);
      expect(ciphertext.epoch).toBeGreaterThan(0);
      
      // Decrypt message at client2
      const decrypted = await group2.decrypt(ciphertext);
      const decryptedText = new TextDecoder().decode(decrypted);
      
      expect(decryptedText).toBe('Hello, MLS!');
    });

    it('should handle key rotation on member changes', async () => {
      // Initialize clients
      await client1.initialize();
      await client2.initialize();
      await client3.initialize();
      
      // Create group and add members
      const groupId = 'test-group-6';
      const group1 = await client1.createGroup(groupId);
      const keyPackage2 = await client2.exportKeyPackage();
      const keyPackage3 = await client3.exportKeyPackage();
      
      const commit1 = await group1.addMember(keyPackage2);
      const group2 = await client2.joinGroup(commit1.welcome[0]);
      
      // Get initial epoch
      const initialEpoch = group1.getCurrentEpoch();
      
      // Add another member
      const commit2 = await group1.addMember(keyPackage3);
      const group3 = await client3.joinGroup(commit2.welcome[0]);
      
      // Process commit at client2
      await group2.processCommit(commit2.commit);
      
      // Check epoch advanced
      const newEpoch = group1.getCurrentEpoch();
      expect(newEpoch).toBeGreaterThan(initialEpoch);
      
      // Verify all can still communicate
      const message = new TextEncoder().encode('Post-rotation message');
      const ciphertext = await group1.encrypt(message);
      
      const decrypted2 = await group2.decrypt(ciphertext);
      const decrypted3 = await group3.decrypt(ciphertext);
      
      expect(new TextDecoder().decode(decrypted2)).toBe('Post-rotation message');
      expect(new TextDecoder().decode(decrypted3)).toBe('Post-rotation message');
    });
  });

  describe('error handling', () => {
    it('should throw error when decrypting with wrong group', async () => {
      // Initialize clients
      await client1.initialize();
      await client2.initialize();
      
      // Create two separate groups
      const group1 = await client1.createGroup('group1');
      const group2 = await client2.createGroup('group2');
      
      // Encrypt in group1
      const plaintext = new TextEncoder().encode('Secret message');
      const ciphertext = await group1.encrypt(plaintext);
      
      // Try to decrypt in group2 (should fail)
      await expect(group2.decrypt(ciphertext)).rejects.toThrow(MLSError);
    });

    it('should throw error when member not found', async () => {
      await client1.initialize();
      const group = await client1.createGroup('test-group');
      
      await expect(group.removeMember('non-existent-user')).rejects.toThrow(MLSError);
    });
  });
});