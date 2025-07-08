import { MLSEncryptionService } from '../MLSEncryptionService';
import { MLSKeyPackage } from '@opencall/core';

describe('MLSEncryptionService', () => {
  let service: MLSEncryptionService;

  beforeEach(() => {
    service = new MLSEncryptionService();
  });

  afterEach(() => {
    service.cleanup();
  });

  describe('initialize', () => {
    it('should initialize with a user ID', async () => {
      await service.initialize('test-user-123');
      
      // Service should be initialized
      expect(() => service.exportKeyPackage()).not.toThrow();
    });

    it('should throw error if not initialized', async () => {
      await expect(service.createGroup('test-group')).rejects.toThrow('Service not initialized');
    });
  });

  describe('createGroup', () => {
    beforeEach(async () => {
      await service.initialize('test-user-123');
    });

    it('should create a new group', async () => {
      const group = await service.createGroup('test-group');
      
      expect(group.id).toBe('test-group');
      expect(group.epoch).toBe(0);
      expect(group.members.size).toBe(1);
      expect(group.members.has('test-user-123')).toBe(true);
    });

    it('should emit groupCreated event', async () => {
      const eventHandler = jest.fn();
      service.on('groupCreated', eventHandler);
      
      await service.createGroup('test-group');
      
      expect(eventHandler).toHaveBeenCalledWith({
        groupId: 'test-group',
        epoch: 0
      });
    });
  });

  describe('generateKeyPackage', () => {
    beforeEach(async () => {
      await service.initialize('test-user-123');
    });

    it('should generate a valid key package', async () => {
      const keyPackage = await service.generateKeyPackage();
      
      expect(keyPackage.data).toBeInstanceOf(Uint8Array);
      expect(keyPackage.signature).toBeInstanceOf(Uint8Array);
      expect(keyPackage.credential).toBeDefined();
      expect(keyPackage.credential.identity).toBeInstanceOf(Uint8Array);
    });
  });

  describe('addMember', () => {
    let group: any;
    let keyPackage: MLSKeyPackage;

    beforeEach(async () => {
      await service.initialize('test-user-123');
      group = await service.createGroup('test-group');
      
      // Create a mock key package for another user
      const otherService = new MLSEncryptionService();
      await otherService.initialize('other-user-456');
      keyPackage = await otherService.generateKeyPackage();
      otherService.cleanup();
    });

    it('should add a member to the group', async () => {
      await service.addMember('test-group', 'other-user-456', keyPackage);
      
      const updatedGroup = service.getGroup('test-group');
      expect(updatedGroup?.members.size).toBe(2);
      expect(updatedGroup?.members.has('other-user-456')).toBe(true);
    });

    it('should rotate keys after adding member', async () => {
      const initialEpoch = group.epoch;
      
      await service.addMember('test-group', 'other-user-456', keyPackage);
      
      const updatedGroup = service.getGroup('test-group');
      expect(updatedGroup?.epoch).toBe(initialEpoch + 1);
    });

    it('should emit memberAdded event', async () => {
      const eventHandler = jest.fn();
      service.on('memberAdded', eventHandler);
      
      await service.addMember('test-group', 'other-user-456', keyPackage);
      
      expect(eventHandler).toHaveBeenCalledWith({
        groupId: 'test-group',
        memberId: 'other-user-456',
        epoch: 1
      });
    });

    it('should throw error for invalid key package', async () => {
      const invalidKeyPackage: MLSKeyPackage = {
        data: new Uint8Array([1, 2, 3]),
        signature: new Uint8Array([4, 5, 6]),
        credential: {
          identity: new Uint8Array([7, 8, 9]),
          signature_key: new Uint8Array([10, 11, 12])
        }
      };
      
      await expect(
        service.addMember('test-group', 'invalid-user', invalidKeyPackage)
      ).rejects.toThrow('Invalid key package signature');
    });
  });

  describe('removeMember', () => {
    beforeEach(async () => {
      await service.initialize('test-user-123');
      await service.createGroup('test-group');
      
      // Add a member
      const otherService = new MLSEncryptionService();
      await otherService.initialize('other-user-456');
      const keyPackage = await otherService.generateKeyPackage();
      await service.addMember('test-group', 'other-user-456', keyPackage);
      otherService.cleanup();
    });

    it('should remove a member from the group', async () => {
      await service.removeMember('test-group', 'other-user-456');
      
      const group = service.getGroup('test-group');
      expect(group?.members.size).toBe(1);
      expect(group?.members.has('other-user-456')).toBe(false);
    });

    it('should rotate keys after removing member', async () => {
      const group = service.getGroup('test-group');
      const epochBeforeRemoval = group?.epoch || 0;
      
      await service.removeMember('test-group', 'other-user-456');
      
      const updatedGroup = service.getGroup('test-group');
      expect(updatedGroup?.epoch).toBe(epochBeforeRemoval + 1);
    });

    it('should emit memberRemoved event', async () => {
      const eventHandler = jest.fn();
      service.on('memberRemoved', eventHandler);
      
      await service.removeMember('test-group', 'other-user-456');
      
      expect(eventHandler).toHaveBeenCalled();
    });
  });

  describe('getEncryptionKey', () => {
    beforeEach(async () => {
      await service.initialize('test-user-123');
      await service.createGroup('test-group');
    });

    it('should return encryption key for existing member', async () => {
      const key = await service.getEncryptionKey('test-group', 'test-user-123');
      
      expect(key).toBeDefined();
      expect(key).toHaveProperty('type', 'secret');
    });

    it('should return null for non-existent group', async () => {
      const key = await service.getEncryptionKey('non-existent', 'test-user-123');
      
      expect(key).toBeNull();
    });

    it('should return null for non-existent member', async () => {
      const key = await service.getEncryptionKey('test-group', 'non-existent');
      
      expect(key).toBeNull();
    });
  });

  describe('key rotation', () => {
    let eventHandler: jest.Mock;

    beforeEach(async () => {
      await service.initialize('test-user-123');
      await service.createGroup('test-group');
      
      eventHandler = jest.fn();
      service.on('keysRotated', eventHandler);
    });

    it('should emit keysRotated event on rotation', async () => {
      // Add and remove a member to trigger rotation
      const otherService = new MLSEncryptionService();
      await otherService.initialize('other-user-456');
      const keyPackage = await otherService.generateKeyPackage();
      
      await service.addMember('test-group', 'other-user-456', keyPackage);
      
      expect(eventHandler).toHaveBeenCalledWith({
        groupId: 'test-group',
        epoch: 1
      });
      
      otherService.cleanup();
    });

    it('should update all member keys on rotation', async () => {
      // Add another member
      const otherService = new MLSEncryptionService();
      await otherService.initialize('other-user-456');
      const keyPackage = await otherService.generateKeyPackage();
      await service.addMember('test-group', 'other-user-456', keyPackage);
      
      const group = service.getGroup('test-group');
      const memberKeyIds = Array.from(group?.members.values() || [])
        .map(member => member.currentKeyId);
      
      // All members should have the same key ID after rotation
      expect(memberKeyIds.every(id => id === memberKeyIds[0])).toBe(true);
      
      otherService.cleanup();
    });
  });
});