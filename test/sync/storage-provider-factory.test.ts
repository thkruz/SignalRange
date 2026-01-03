import { D1StorageProvider } from '../../src/sync/d1-storage-provider';
import { LocalStorageProvider } from '../../src/sync/local-storage-provider';
import {
  StorageProviderFactory,
  StorageProviderType,
  type StorageFactoryConfig,
} from '../../src/sync/storage-provider-factory';
import { WebSocketStorageProvider } from '../../src/sync/websocket-storage-provider';

describe('StorageProviderFactory', () => {
  describe('create()', () => {
    it('creates a LocalStorageProvider when type is LOCAL_STORAGE', () => {
      const config: StorageFactoryConfig = {
        type: StorageProviderType.LOCAL_STORAGE,
        storageKey: 'test-key',
      };

      const provider = StorageProviderFactory.create(config);

      expect(provider).toBeInstanceOf(LocalStorageProvider);
    });

    it('creates a WebSocketStorageProvider when type is WEBSOCKET with wsUrl', () => {
      const config: StorageFactoryConfig = {
        type: StorageProviderType.WEBSOCKET,
        wsUrl: 'ws://localhost:8080',
      };

      const provider = StorageProviderFactory.create(config);

      expect(provider).toBeInstanceOf(WebSocketStorageProvider);
    });

    it('throws when WEBSOCKET type is missing wsUrl', () => {
      const config: StorageFactoryConfig = {
        type: StorageProviderType.WEBSOCKET,
      };

      expect(() => StorageProviderFactory.create(config)).toThrow(
        'wsUrl is required for WebSocket storage provider'
      );
    });

    it('creates a D1StorageProvider when type is CLOUDFLARE_D1 with d1ApiEndpoint', () => {
      const config: StorageFactoryConfig = {
        type: StorageProviderType.CLOUDFLARE_D1,
        d1ApiEndpoint: 'https://api.example.com',
      };

      const provider = StorageProviderFactory.create(config);

      expect(provider).toBeInstanceOf(D1StorageProvider);
    });

    it('throws when CLOUDFLARE_D1 type is missing d1ApiEndpoint', () => {
      const config: StorageFactoryConfig = {
        type: StorageProviderType.CLOUDFLARE_D1,
      };

      expect(() => StorageProviderFactory.create(config)).toThrow(
        'd1ApiEndpoint is required for D1 storage provider'
      );
    });

    it('throws for unknown provider type', () => {
      const config = {
        type: 'unknown_type' as StorageProviderType,
      };

      expect(() => StorageProviderFactory.create(config)).toThrow(
        'Unknown storage provider type: unknown_type'
      );
    });

    it('passes config options to LocalStorageProvider', () => {
      const onError = jest.fn();
      const config: StorageFactoryConfig = {
        type: StorageProviderType.LOCAL_STORAGE,
        storageKey: 'custom-key',
        autoSync: true,
        syncInterval: 5000,
        onError,
      };

      const provider = StorageProviderFactory.create(config);

      expect(provider).toBeInstanceOf(LocalStorageProvider);
    });
  });

  describe('createLocalStorage()', () => {
    it('creates a LocalStorageProvider with default config', () => {
      const provider = StorageProviderFactory.createLocalStorage();

      expect(provider).toBeInstanceOf(LocalStorageProvider);
    });

    it('creates a LocalStorageProvider with custom config', () => {
      const provider = StorageProviderFactory.createLocalStorage({
        storageKey: 'custom-key',
      });

      expect(provider).toBeInstanceOf(LocalStorageProvider);
    });
  });

  describe('createWebSocket()', () => {
    it('creates a WebSocketStorageProvider with required wsUrl', () => {
      const provider = StorageProviderFactory.createWebSocket('ws://localhost:8080');

      expect(provider).toBeInstanceOf(WebSocketStorageProvider);
    });

    it('creates a WebSocketStorageProvider with custom config', () => {
      const onReconnect = jest.fn();
      const provider = StorageProviderFactory.createWebSocket('ws://localhost:8080', {
        onReconnect,
        autoSync: true,
      });

      expect(provider).toBeInstanceOf(WebSocketStorageProvider);
    });
  });

  describe('createD1()', () => {
    it('creates a D1StorageProvider with required apiEndpoint', () => {
      const provider = StorageProviderFactory.createD1('https://api.example.com');

      expect(provider).toBeInstanceOf(D1StorageProvider);
    });

    it('creates a D1StorageProvider with custom config', () => {
      const onError = jest.fn();
      const provider = StorageProviderFactory.createD1('https://api.example.com', {
        onError,
        syncInterval: 10000,
      });

      expect(provider).toBeInstanceOf(D1StorageProvider);
    });
  });
});
