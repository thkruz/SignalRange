import { GroundStation } from '@app/assets/ground-station/ground-station';
import { GroundStationState } from '@app/assets/ground-station/ground-station-state';
import { AntennaState } from '@app/equipment/antenna';
import { RFFrontEndState } from '@app/equipment/rf-front-end/rf-front-end-core';
import { ObjectiveState } from '@app/objectives';
import { SimulationManager } from '@app/simulation/simulation-manager';
import { RealTimeSpectrumAnalyzerState } from '../equipment/real-time-spectrum-analyzer/real-time-spectrum-analyzer';
import { ReceiverState } from '../equipment/receiver/receiver';
import { TransmitterState } from '../equipment/transmitter/transmitter';
import { Logger } from '../logging/logger';
import type { Equipment } from '../pages/sandbox/equipment';
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
  private equipment: Equipment | null = null;
  private unsubscribe: (() => void) | null = null;
  private isInitialized = false;
  groundStations: GroundStation[] = [];

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
  setEquipment(equipment: Equipment): void {
    this.equipment = equipment;
  }

  setGroundStations(groundStations: GroundStation[]): void {
    this.groundStations = groundStations;
  }

  /**
   * Load state from storage and update equipment
   */
  async loadFromStorage(): Promise<void> {
    this.equipment ??= {} as Equipment; // Ensure equipment is set to avoid null checks
    this.groundStations ??= [] as GroundStation[];

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

    const state = this.buildAppStateObject();
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
   * Get current equipment state
   * Useful for creating checkpoints or saving progress
   */
  getCurrentState(): AppState {
    return this.buildAppStateObject();
  }

  /**
   * Swap the storage provider (e.g., from LocalStorage to WebSocket)
   */
  async swapProvider(newProvider: StorageProvider): Promise<void> {
    // Save current state
    const currentState = this.equipment ? this.buildAppStateObject() : null;

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
    this.groundStations = [];
    this.isInitialized = false;
  }

  /**
   * Build state object from equipment and objectives
   */
  private buildAppStateObject(): AppState {
    if (!this.equipment) {
      return { equipment: undefined };
    }

    // Get objective states from SimulationManager if available
    let objectiveStates: ObjectiveState[] | undefined;
    try {
      const sim = SimulationManager.getInstance();
      if (sim?.objectivesManager) {
        objectiveStates = sim.objectivesManager.getObjectiveStates() as ObjectiveState[];
      }
    } catch (error) {
      // SimulationManager or ObjectivesManager not available yet - this is expected during initialization
      console.debug('ObjectivesManager not available when building state:', error);
      objectiveStates = undefined;
    }

    return {
      objectiveStates,
      groundStationStates: this.groundStations.map(gs => gs.state),
      equipment: {
        spectrumAnalyzersState: this.equipment.spectrumAnalyzers?.map(sa => sa.state),
        antennasState: this.equipment.antennas?.map(a => a.state),
        rfFrontEndsState: this.equipment.rfFrontEnds?.map(rf => rf.state),
        transmittersState: this.equipment.transmitters?.map(tx => tx.state),
        receiversState: this.equipment.receivers?.map(rx => rx.state),
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

    if (state.groundStationStates) {
      state.groundStationStates.forEach((gsState: GroundStationState, index: number) => {
        if (this.groundStations[index]) {
          this.groundStations[index].sync(gsState);
        }
      });
    }

    // Sync Spectrum Analyzers
    if (state.equipment.spectrumAnalyzersState) {
      state.equipment.spectrumAnalyzersState.forEach((storedSa: RealTimeSpectrumAnalyzerState, index: number) => {
        if (this.equipment.spectrumAnalyzers[index]) {
          this.equipment.spectrumAnalyzers[index].sync(storedSa);
        }
      });
    }

    // Sync Antennas
    if (state.equipment.antennasState) {
      state.equipment.antennasState.forEach((antennaData: AntennaState, index: number) => {
        if (this.equipment.antennas[index]) {
          this.equipment.antennas[index].sync(antennaData);
        }
      });
    }

    // Sync Transmitters
    if (state.equipment.transmittersState) {
      state.equipment.transmittersState.forEach((txData: TransmitterState, index: number) => {
        if (this.equipment.transmitters[index]) {
          this.equipment.transmitters[index].sync(txData);
        }
      });
    }

    // Sync Receivers
    if (state.equipment.receiversState) {
      state.equipment.receiversState.forEach((rxData: ReceiverState, index: number) => {
        if (this.equipment.receivers[index]) {
          this.equipment.receivers[index].sync(rxData);
        }
      });
    }

    // Sync RF Front Ends
    if (state.equipment.rfFrontEndsState) {
      state.equipment.rfFrontEndsState.forEach((rfData: RFFrontEndState, index: number) => {
        if (this.equipment.rfFrontEnds[index]) {
          this.equipment.rfFrontEnds[index].sync(rfData);
        }
      });
    }

    // Sync Objective States if available
    if (state.objectiveStates && state.objectiveStates.length > 0) {
      try {
        const { SimulationManager } = require('../simulation/simulation-manager');
        const sim = SimulationManager.getInstance();
        if (sim?.objectivesManager) {
          sim.objectivesManager.restoreState(state.objectiveStates);
        }
      } catch (error) {
        console.debug('ObjectivesManager not available when syncing from storage:', error);
      }
    }
  }
}

/**
 * AppState interface (should match your existing type)
 */
export interface AppState {
  objectiveStates?: ObjectiveState[];
  groundStationStates?: GroundStationState[];
  equipment?: {
    spectrumAnalyzersState?: RealTimeSpectrumAnalyzerState[];
    rfFrontEndsState?: RFFrontEndState[];
    antennasState?: AntennaState[];
    transmittersState?: TransmitterState[];
    receiversState?: ReceiverState[];
  };
}