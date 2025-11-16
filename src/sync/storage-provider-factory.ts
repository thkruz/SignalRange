import { LocalStorageProvider } from './local-storage-provider';
import type { StorageProvider, StorageProviderConfig } from './storage-provider';
import { WebSocketStorageProvider, type WebSocketProviderConfig } from './websocket-storage-provider';

/**
 * Storage Provider Types
 */
export enum StorageProviderType {
  LOCAL_STORAGE = 'local_storage',
  DURABLE_OBJECTS = 'durable_objects',
}

/**
 * Configuration for creating storage providers
 */
export interface StorageFactoryConfig extends StorageProviderConfig {
  type: StorageProviderType;

  // Durable Objects/WebSocket-specific config
  workerUrl?: string;
  roomId?: string;
  clientId?: string;
  onRoomChange?: (roomId: string) => void;
}

/**
 * Factory for creating storage providers
 *
 * Makes it easy to create and configure different storage providers
 * without coupling to specific implementations.
 */
export class StorageProviderFactory {
  /**
   * Create a storage provider based on configuration
   */
  static create(config: StorageFactoryConfig): StorageProvider {
    switch (config.type) {
      case StorageProviderType.LOCAL_STORAGE:
        return new LocalStorageProvider(config);

      case StorageProviderType.DURABLE_OBJECTS:
        if (!config.workerUrl) {
          throw new Error('workerUrl is required for Durable Objects storage provider');
        }
        return new WebSocketStorageProvider(config.workerUrl, {
          ...config,
          roomId: config.roomId,
          clientId: config.clientId,
          onRoomChange: config.onRoomChange,
        });

      default:
        throw new Error(`Unknown storage provider type: ${config.type}`);
    }
  }

  /**
   * Create a LocalStorage provider with defaults
   */
  static createLocalStorage(config?: Partial<StorageProviderConfig>): StorageProvider {
    return new LocalStorageProvider(config);
  }

  /**
   * Create a Durable Objects provider with defaults
   */
  static createDurableObjects(
    workerUrl: string,
    roomId?: string,
    config?: Partial<WebSocketProviderConfig>
  ): StorageProvider {
    return new WebSocketStorageProvider(workerUrl, {
      ...config,
      roomId,
    });
  }
}
