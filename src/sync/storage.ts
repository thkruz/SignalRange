/**
 * Refactored storage.ts - Uses the new SyncManager architecture
 *
 * This file provides a simple interface for the rest of your app
 * while hiding the complexity of the storage provider.
 */

import { SimulationManager } from '@app/simulation/simulation-manager';
import { EventBus } from '../events/event-bus';
import { Events } from '../events/events';
import type { Equipment } from '../pages/sandbox/equipment';
import { StorageProviderFactory, StorageProviderType } from './storage-provider-factory';
import { SyncManager, type AppState } from './sync-manager';
import './webpack-hot-module';

// Create the storage provider (can be easily swapped!)
const storageProvider = StorageProviderFactory.create({
  type: StorageProviderType.LOCAL_STORAGE,
  storageKey: '__APP_STORE__',
  autoSync: true,
  onError: (error) => {
    console.error('Storage error:', error);
    EventBus.getInstance().emit(Events.STORAGE_ERROR, error);
  },
});

// Create the sync manager
export const syncManager = new SyncManager(storageProvider);

// Initialize on first use
let initPromise: Promise<void> | null = null;
async function ensureInitialized(): Promise<void> {
  initPromise ??= syncManager.initialize();
  return initPromise;
}

/**
 * Get the current state from storage
 */
export async function getStore(): Promise<AppState> {
  await ensureInitialized();
  // For LocalStorage, read is synchronous, but the interface is async for compatibility
  const state = await storageProvider.read<AppState>();
  return state || { equipment: undefined };
}

/**
 * Update the store with new data
 */
export async function updateStore(updates: Partial<AppState>): Promise<AppState> {
  await ensureInitialized();

  const currentState = await getStore();
  const newState: AppState = {
    ...currentState,
    ...updates,
    equipment: {
      ...currentState.equipment,
      ...updates.equipment,
    },
  };

  await syncManager.saveToStorage();
  return newState;
}

/**
 * Clear all stored data
 */
export async function clearPersistedStore(): Promise<void> {
  await ensureInitialized();
  await syncManager.clearStorage();
}

/**
 * Sync equipment with storage (two-way sync)
 */
export async function syncEquipmentWithStore(equipment: Equipment): Promise<void> {
  await ensureInitialized();

  // Set equipment in sync manager
  syncManager.setEquipment(equipment);

  // Load initial state from storage
  await syncManager.loadFromStorage();

  // Set up event listeners to save on changes
  setupEquipmentListeners();

  SimulationManager.getInstance().sync();
}

/**
 * Set up event listeners to automatically save equipment changes
 */
function setupEquipmentListeners(): void {
  const eventBus = EventBus.getInstance();

  // Debounce save operations to avoid excessive writes
  let saveTimeout: NodeJS.Timeout | null = null;
  const debouncedSave = () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      await syncManager.saveToStorage();
    }, 500); // Save 500ms after last change
  };

  // Listen to equipment change events
  eventBus.on(Events.SPEC_A_CONFIG_CHANGED, debouncedSave);
  eventBus.on(Events.ANTENNA_STATE_CHANGED, debouncedSave);
  eventBus.on(Events.TX_CONFIG_CHANGED, debouncedSave);
  eventBus.on(Events.TX_ACTIVE_MODEM_CHANGED, debouncedSave);
  eventBus.on(Events.RX_CONFIG_CHANGED, debouncedSave);
  eventBus.on(Events.RX_ACTIVE_MODEM_CHANGED, debouncedSave);
}

/**
 * Check if storage is connected
 */
export function isStorageConnected(): boolean {
  return syncManager.isConnected();
}

/**
 * Swap to a different storage provider (e.g., migrate from LocalStorage to Durable Objects)
 *
 * Example usage:
 * ```
 * // Switch to Durable Objects storage
 * await swapStorageProvider(StorageProviderType.DURABLE_OBJECTS, {
 *   workerUrl: 'https://your-worker.workers.dev',
 *   roomId: 'room-123',
 *   autoSync: true,
 * });
 * ```
 */
export async function swapStorageProvider(
  type: StorageProviderType,
  config: any
): Promise<void> {
  const newProvider = StorageProviderFactory.create({
    type,
    ...config,
  });

  await syncManager.swapProvider(newProvider);
}

/**
 * Join a multiplayer room (switch to Durable Objects for real-time collaboration)
 *
 * This is a convenience function to switch from LocalStorage to Durable Objects
 * and join a specific room for multi-user sync via WebSocket.
 *
 * Example usage:
 * ```
 * await joinRoom('https://your-worker.workers.dev', 'team-alpha');
 * ```
 */
export async function joinRoom(
  workerUrl: string,
  roomId: string = 'default'
): Promise<void> {
  await swapStorageProvider(StorageProviderType.DURABLE_OBJECTS, {
    workerUrl,
    roomId,
    autoSync: true,
    onError: (error) => {
      console.error('Multiplayer sync error:', error);
      EventBus.getInstance().emit(Events.STORAGE_ERROR, error);
    },
    onRoomChange: (newRoomId) => {
      console.log('Switched to room:', newRoomId);
    },
  });
}

/**
 * Switch back to LocalStorage from multiplayer mode
 *
 * This will save the current state to LocalStorage and disconnect from the multiplayer room.
 */
export async function useLocalStorage(): Promise<void> {
  await swapStorageProvider(StorageProviderType.LOCAL_STORAGE, {
    storageKey: '__APP_STORE__',
    autoSync: true,
    onError: (error) => {
      console.error('Storage error:', error);
      EventBus.getInstance().emit(Events.STORAGE_ERROR, error);
    },
  });
}

/**
 * Clean up on app shutdown
 */
export async function disposeStorage(): Promise<void> {
  await syncManager.dispose();
}

// Export types
export type { AppState } from './sync-manager';
