import type { StudentEquipment } from '../equipment/student-equipment';
import { Logger } from '../logging/logger';
import type { StorageProvider } from './storage-provider';

/**
 * SyncManager - Orchestrates synchronization between StudentEquipment and storage
 *
 * This class:
 * - Abstracts the storage provider from the business logic
 * - Handles bidirectional sync (equipment -> storage and storage -> equipment)
 * - Manages subscriptions and updates
 * - Provides easy provider swapping
 */
export class SyncManager {
  private provider: StorageProvider;
  private equipment: StudentEquipment | null = null;
  private unsubscribe: (() => void) | null = null;
  private isInitialized = false;

  constructor(provider: StorageProvider) {
    this.provider = provider;
  }

  /**
   * Initialize the sync manager and storage provider
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.warn('SyncManager already initialized');
      return;
    }

    await this.provider.initialize();

    // Subscribe to storage changes
    this.unsubscribe = this.provider.subscribe((data) => {
      if (this.equipment && data) {
        this.syncFromStorage(data);
      }
    });

    this.isInitialized = true;
  }

  /**
   * Set the equipment instance to sync
   */
  setEquipment(equipment: StudentEquipment): void {
    this.equipment = equipment;
  }

  /**
   * Load state from storage and update equipment
   */
  async loadFromStorage(): Promise<void> {
    if (!this.equipment) {
      throw new Error('Equipment not set. Call setEquipment() first.');
    }

    const state = await this.provider.read<AppState>();
    if (state) {
      this.syncFromStorage(state);
    }
  }

  /**
   * Save current equipment state to storage
   */
  async saveToStorage(): Promise<void> {
    if (!this.equipment) {
      throw new Error('Equipment not set. Call setEquipment() first.');
    }

    const state = this.buildStateFromEquipment();
    await this.provider.write(state);

    Logger.info('Store updated:', state);
  }

  /**
   * Clear all stored state
   */
  async clearStorage(): Promise<void> {
    await this.provider.clear();
  }

  /**
   * Check if storage is connected/available
   */
  isConnected(): boolean {
    return this.provider.isConnected();
  }

  /**
   * Swap the storage provider (e.g., from LocalStorage to WebSocket)
   */
  async swapProvider(newProvider: StorageProvider): Promise<void> {
    // Save current state
    const currentState = this.equipment ? this.buildStateFromEquipment() : null;

    // Dispose old provider
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    await this.provider.dispose();

    // Initialize new provider
    this.provider = newProvider;
    await this.provider.initialize();

    // Restore state to new provider if we had one
    if (currentState) {
      await this.provider.write(currentState);
    }

    // Re-subscribe
    this.unsubscribe = this.provider.subscribe((data) => {
      if (this.equipment && data) {
        this.syncFromStorage(data);
      }
    });
  }

  /**
   * Clean up resources
   */
  async dispose(): Promise<void> {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    await this.provider.dispose();
    this.equipment = null;
    this.isInitialized = false;
  }

  /**
   * Build state object from equipment
   */
  private buildStateFromEquipment(): AppState {
    if (!this.equipment) {
      return { equipment: undefined };
    }

    return {
      equipment: {
        spectrumAnalyzers: this.equipment.spectrumAnalyzers.map(sa => ({
          config: sa.config,
          // Add any other relevant state
        })),
        antennas: this.equipment.antennas.map(a => a.getConfig()),
        transmitters: this.equipment.transmitters.map(tx => tx.getConfig()),
        receivers: this.equipment.receivers.map(rx => rx.getConfig()),
      }
    };
  }

  /**
   * Sync equipment from storage state
   */
  private syncFromStorage(state: AppState): void {
    if (!this.equipment || !state.equipment) {
      return;
    }

    // Sync Spectrum Analyzers
    if (state.equipment.spectrumAnalyzers) {
      state.equipment.spectrumAnalyzers.forEach((storedSa: any) => {
        const localSa = this.equipment!.spectrumAnalyzers.find(
          sa => sa.config.unit === storedSa.config.unit
        );
        if (localSa) {
          localSa.config = { ...storedSa.config };
          localSa.sync();
        }
      });
    }

    // Sync Antennas
    if (state.equipment.antennas) {
      state.equipment.antennas.forEach((antennaData: any, index: number) => {
        if (this.equipment!.antennas[index]) {
          this.equipment!.antennas[index].sync(antennaData);
        }
      });
    }

    // Sync Transmitters
    if (state.equipment.transmitters) {
      state.equipment.transmitters.forEach((txData: any, index: number) => {
        if (this.equipment!.transmitters[index]) {
          this.equipment!.transmitters[index].sync(txData);
        }
      });
    }

    // Sync Receivers
    if (state.equipment.receivers) {
      state.equipment.receivers.forEach((rxData: any, index: number) => {
        if (this.equipment!.receivers[index]) {
          this.equipment!.receivers[index].sync(rxData);
        }
      });
    }
  }
}

/**
 * AppState interface (should match your existing type)
 */
export interface AppState {
  equipment?: {
    spectrumAnalyzers?: any[];
    antennas?: any[];
    transmitters?: any[];
    receivers?: any[];
  };
}