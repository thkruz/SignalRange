/**
 * Storage Provider Interface
 *
 * All storage implementations (LocalStorage, WebSocket, D1, etc.) must implement this interface.
 * This allows for easy swapping of storage backends without changing business logic.
 */

export interface StorageProvider {
  /**
   * Initialize the storage provider (e.g., establish connections, load initial state)
   */
  initialize(): Promise<void>;

  /**
   * Read the current state from storage
   */
  read<T>(): Promise<T | null>;

  /**
   * Write state to storage
   */
  write<T>(data: T): Promise<void>;

  /**
   * Clear all stored data
   */
  clear(): Promise<void>;

  /**
   * Subscribe to changes from external sources (e.g., other clients via WebSocket)
   * Returns an unsubscribe function
   */
  subscribe<T>(callback: (data: T) => void): () => void;

  /**
   * Check if the provider is currently connected/available
   */
  isConnected(): boolean;

  /**
   * Clean up resources (close connections, remove listeners, etc.)
   */
  dispose(): Promise<void>;
}

/**
 * Configuration options for storage providers
 */
export interface StorageProviderConfig {
  storageKey?: string;
  autoSync?: boolean;
  syncInterval?: number;
  onError?: (error: Error) => void;
  onReconnect?: () => void;
}