/**
 * Sync Module - Public API
 *
 * This file exports the public interface of the sync module.
 * Import from here instead of individual files.
 */

// Main storage API (what your app uses)
export {
  clearPersistedStore,
  disposeStorage, getStore, isStorageConnected, swapStorageProvider, syncEquipmentWithStore, updateStore, type AppState
} from './storage';

// Provider types and factory (for configuration)
export {
  StorageProviderFactory, StorageProviderType, type StorageFactoryConfig
} from './storage-provider-factory';

// Core types (if you need to extend or create custom providers)
export type {
  StorageProvider,
  StorageProviderConfig
} from './storage-provider';

// Sync manager (if you need direct access)
export { SyncManager } from './sync-manager';

// Provider implementations (if you need to instantiate directly)
export { D1StorageProvider } from './d1-storage-provider';
export { LocalStorageProvider } from './local-storage-provider';
export { WebSocketStorageProvider } from './websocket-storage-provider';

