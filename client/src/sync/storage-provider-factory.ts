import { D1StorageProvider } from './d1-storage-provider';
import { LocalStorageProvider } from './local-storage-provider';
import type { StorageProvider, StorageProviderConfig } from './storage-provider';
import { WebSocketStorageProvider } from './websocket-storage-provider';

/**
 * Storage Provider Types
 */
export enum StorageProviderType {
  LOCAL_STORAGE = 'local_storage',
  WEBSOCKET = 'websocket',
  CLOUDFLARE_D1 = 'cloudflare_d1',
}

/**
 * Configuration for creating storage providers
 */
export interface StorageFactoryConfig extends StorageProviderConfig {
  type: StorageProviderType;

  // WebSocket-specific config
  wsUrl?: string;

  // D1-specific config
  d1ApiEndpoint?: string;
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

      case StorageProviderType.WEBSOCKET:
        if (!config.wsUrl) {
          throw new Error('wsUrl is required for WebSocket storage provider');
        }
        return new WebSocketStorageProvider(config.wsUrl, config);

      case StorageProviderType.CLOUDFLARE_D1:
        if (!config.d1ApiEndpoint) {
          throw new Error('d1ApiEndpoint is required for D1 storage provider');
        }
        return new D1StorageProvider(config.d1ApiEndpoint, config);

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
   * Create a WebSocket provider with defaults
   */
  static createWebSocket(
    wsUrl: string,
    config?: Partial<StorageProviderConfig>
  ): StorageProvider {
    return new WebSocketStorageProvider(wsUrl, config);
  }

  /**
   * Create a Cloudflare D1 provider with defaults
   */
  static createD1(
    apiEndpoint: string,
    config?: Partial<StorageProviderConfig>
  ): StorageProvider {
    return new D1StorageProvider(apiEndpoint, config);
  }
}