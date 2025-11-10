import type { StorageProvider, StorageProviderConfig } from './storage-provider';

/**
 * LocalStorage implementation of StorageProvider
 *
 * Provides synchronous-like access to localStorage with the async interface
 * required by the StorageProvider contract.
 */
export class LocalStorageProvider implements StorageProvider {
  private readonly storageKey: string;
  private readonly config: StorageProviderConfig;
  private readonly subscribers: Set<(data: any) => void> = new Set();
  private storageListener: ((e: StorageEvent) => void) | null = null;

  constructor(config: StorageProviderConfig = {}) {
    this.storageKey = config.storageKey || '__APP_STORE__';
    this.config = config;
  }

  async initialize(): Promise<void> {
    // Set up cross-tab synchronization using storage events
    this.storageListener = (e: StorageEvent) => {
      if (e.key === this.storageKey && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          this.notifySubscribers(data);
        } catch (error) {
          this.handleError(new Error('Failed to parse storage event data: ' + error));
        }
      }
    };

    globalThis.addEventListener('storage', this.storageListener);
  }

  async read<T>(): Promise<T | null> {
    try {
      const stored = localStorage.getItem(this.storageKey);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      this.handleError(new Error('Failed to read from localStorage: ' + error));
      return null;
    }
  }

  async write<T>(data: T): Promise<void> {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(data));
      // Notify local subscribers (storage event only fires for other tabs)
      this.notifySubscribers(data);
    } catch (error) {
      this.handleError(new Error('Failed to write to localStorage: ' + error));
    }
  }

  async clear(): Promise<void> {
    try {
      localStorage.removeItem(this.storageKey);
      this.notifySubscribers(null);
    } catch (error) {
      this.handleError(new Error('Failed to clear localStorage: ' + error));
    }
  }

  subscribe<T>(callback: (data: T) => void): () => void {
    this.subscribers.add(callback);

    // Return unsubscribe function
    return () => {
      this.subscribers.delete(callback);
    };
  }

  isConnected(): boolean {
    // LocalStorage is always "connected" if available
    try {
      const test = '__storage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  }

  async dispose(): Promise<void> {
    if (this.storageListener) {
      globalThis.removeEventListener('storage', this.storageListener);
      this.storageListener = null;
    }
    this.subscribers.clear();
  }

  private notifySubscribers(data: any): void {
    this.subscribers.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error('Error in storage subscriber:', error);
      }
    });
  }

  private handleError(error: Error): void {
    console.error('LocalStorageProvider error:', error);
    if (this.config.onError) {
      this.config.onError(error);
    }
  }
}