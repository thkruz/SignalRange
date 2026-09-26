/**
 * Sync Module - Public API
 *
 * This file exports the public interface of the sync module.
 * Import from here instead of individual files.
 */

// Provider implementations (if you need to instantiate directly)
export { D1StorageProvider } from './d1-storage-provider';
export { LocalStorageProvider } from './local-storage-provider';
// Main storage API (what your app uses)
export { type AppState, clearPersistedStore, disposeStorage, getStore, isStorageConnected, swapStorageProvider, syncEquipmentWithStore, updateStore } from './storage';
// Core types (if you need to extend or create custom providers)
export type {
  StorageProvider,
  StorageProviderConfig,
} from './storage-provider';
// Provider types and factory (for configuration)
export { type StorageFactoryConfig, StorageProviderFactory, StorageProviderType } from './storage-provider-factory';
// Sync manager (if you need direct access)
export { SyncManager } from './sync-manager';
export { WebSocketStorageProvider } from './websocket-storage-provider';
