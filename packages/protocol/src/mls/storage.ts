import { MLSStorageProvider } from './types';

export class IndexedDBMLSStorage implements MLSStorageProvider {
  private dbName = 'dmp-mls-storage';
  private dbVersion = 1;
  private db?: IDBDatabase;

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains('keyPackages')) {
          db.createObjectStore('keyPackages', { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains('groupStates')) {
          db.createObjectStore('groupStates', { keyPath: 'groupId' });
        }
      };
    });
  }

  async saveKeyPackage(id: string, data: Uint8Array): Promise<void> {
    if (!this.db) await this.initialize();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['keyPackages'], 'readwrite');
      const store = transaction.objectStore('keyPackages');
      
      const request = store.put({ id, data: Array.from(data), timestamp: Date.now() });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async loadKeyPackage(id: string): Promise<Uint8Array | null> {
    if (!this.db) await this.initialize();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['keyPackages'], 'readonly');
      const store = transaction.objectStore('keyPackages');
      
      const request = store.get(id);
      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? new Uint8Array(result.data) : null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteKeyPackage(id: string): Promise<void> {
    if (!this.db) await this.initialize();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['keyPackages'], 'readwrite');
      const store = transaction.objectStore('keyPackages');
      
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async saveGroupState(groupId: string, state: Uint8Array): Promise<void> {
    if (!this.db) await this.initialize();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['groupStates'], 'readwrite');
      const store = transaction.objectStore('groupStates');
      
      const request = store.put({ 
        groupId, 
        state: Array.from(state), 
        updatedAt: Date.now() 
      });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async loadGroupState(groupId: string): Promise<Uint8Array | null> {
    if (!this.db) await this.initialize();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['groupStates'], 'readonly');
      const store = transaction.objectStore('groupStates');
      
      const request = store.get(groupId);
      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? new Uint8Array(result.state) : null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteGroupState(groupId: string): Promise<void> {
    if (!this.db) await this.initialize();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['groupStates'], 'readwrite');
      const store = transaction.objectStore('groupStates');
      
      const request = store.delete(groupId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clearAll(): Promise<void> {
    if (!this.db) await this.initialize();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['keyPackages', 'groupStates'], 'readwrite');
      
      transaction.objectStore('keyPackages').clear();
      transaction.objectStore('groupStates').clear();
      
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }
}