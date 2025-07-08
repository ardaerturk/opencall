import { describe, it, expect, beforeEach } from 'vitest';
import { IndexedDBMLSStorage } from '../storage';

// Mock IndexedDB for testing
const mockIndexedDB = {
  databases: new Map(),
  open: function(name: string, version?: number) {
    const db = {
      name,
      version: version || 1,
      objectStoreNames: [],
      createObjectStore: function(storeName: string) {
        this.objectStoreNames.push(storeName);
        return {
          createIndex: () => {},
        };
      },
      transaction: function(storeNames: string[], mode: string) {
        const stores = new Map();
        storeNames.forEach(name => {
          if (!stores.has(name)) {
            stores.set(name, new Map());
          }
        });
        
        return {
          objectStore: function(name: string) {
            const store = stores.get(name) || new Map();
            return {
              put: async (value: any, key: string) => {
                store.set(key, value);
                mockIndexedDB.databases.set(`${db.name}.${name}`, store);
                return key;
              },
              get: async (key: string) => {
                const dbStore = mockIndexedDB.databases.get(`${db.name}.${name}`);
                return dbStore ? dbStore.get(key) : undefined;
              },
              delete: async (key: string) => {
                const dbStore = mockIndexedDB.databases.get(`${db.name}.${name}`);
                if (dbStore) {
                  dbStore.delete(key);
                }
              },
            };
          },
        };
      },
    };
    
    return {
      result: db,
      onsuccess: null as any,
      onerror: null as any,
      onupgradeneeded: null as any,
      addEventListener: function(event: string, handler: any) {
        if (event === 'upgradeneeded') {
          this.onupgradeneeded = handler;
          // Simulate upgrade
          handler({ target: { result: db } });
        } else if (event === 'success') {
          this.onsuccess = handler;
          // Simulate success
          setTimeout(() => handler({ target: { result: db } }), 0);
        }
      },
    };
  },
};

// Replace global indexedDB with mock for testing
(global as any).indexedDB = mockIndexedDB;

describe('IndexedDBMLSStorage', () => {
  let storage: IndexedDBMLSStorage;

  beforeEach(() => {
    mockIndexedDB.databases.clear();
    storage = new IndexedDBMLSStorage('test-db');
  });

  describe('key package storage', () => {
    it('should save and load key packages', async () => {
      const keyPackageId = 'test-key-package-1';
      const keyPackageData = new Uint8Array([1, 2, 3, 4, 5]);
      
      await storage.saveKeyPackage(keyPackageId, keyPackageData);
      const loaded = await storage.loadKeyPackage(keyPackageId);
      
      expect(loaded).toEqual(keyPackageData);
    });

    it('should return null for non-existent key package', async () => {
      const loaded = await storage.loadKeyPackage('non-existent');
      expect(loaded).toBeNull();
    });

    it('should delete key packages', async () => {
      const keyPackageId = 'test-key-package-2';
      const keyPackageData = new Uint8Array([6, 7, 8, 9, 10]);
      
      await storage.saveKeyPackage(keyPackageId, keyPackageData);
      await storage.deleteKeyPackage(keyPackageId);
      
      const loaded = await storage.loadKeyPackage(keyPackageId);
      expect(loaded).toBeNull();
    });
  });

  describe('group state storage', () => {
    it('should save and load group state', async () => {
      const groupId = 'test-group-1';
      const groupState = new Uint8Array([10, 20, 30, 40, 50]);
      
      await storage.saveGroupState(groupId, groupState);
      const loaded = await storage.loadGroupState(groupId);
      
      expect(loaded).toEqual(groupState);
    });

    it('should return null for non-existent group state', async () => {
      const loaded = await storage.loadGroupState('non-existent-group');
      expect(loaded).toBeNull();
    });

    it('should overwrite existing group state', async () => {
      const groupId = 'test-group-2';
      const initialState = new Uint8Array([1, 2, 3]);
      const updatedState = new Uint8Array([4, 5, 6, 7, 8]);
      
      await storage.saveGroupState(groupId, initialState);
      await storage.saveGroupState(groupId, updatedState);
      
      const loaded = await storage.loadGroupState(groupId);
      expect(loaded).toEqual(updatedState);
    });
  });

  describe('concurrent operations', () => {
    it('should handle multiple concurrent saves', async () => {
      const operations = [];
      
      for (let i = 0; i < 10; i++) {
        operations.push(
          storage.saveKeyPackage(`key-${i}`, new Uint8Array([i]))
        );
      }
      
      await Promise.all(operations);
      
      // Verify all saved correctly
      for (let i = 0; i < 10; i++) {
        const loaded = await storage.loadKeyPackage(`key-${i}`);
        expect(loaded).toEqual(new Uint8Array([i]));
      }
    });

    it('should handle mixed operations', async () => {
      const keyPackageData = new Uint8Array([100]);
      const groupStateData = new Uint8Array([200]);
      
      await Promise.all([
        storage.saveKeyPackage('key-1', keyPackageData),
        storage.saveGroupState('group-1', groupStateData),
      ]);
      
      const [loadedKey, loadedGroup] = await Promise.all([
        storage.loadKeyPackage('key-1'),
        storage.loadGroupState('group-1'),
      ]);
      
      expect(loadedKey).toEqual(keyPackageData);
      expect(loadedGroup).toEqual(groupStateData);
    });
  });
});