// store.ts
import type { AntennaConfig, AntennaErrorData, AntennaHpaChangedData, AntennaLockedData, AntennaLoopbackChangedData, AntennaPowerChangedData, AntennaTrackChangedData } from "./equipment/antenna/antenna";
import type { RxConfigChangedData, RxSignalFoundData, RxSignalLostData } from "./equipment/receiver/receiver";
import type { SpectrumAnalyzer, SpectrumAnalyzerConfig } from "./equipment/spectrum-analyzer/spectrum-analyzer";
import { StudentEquipment } from "./equipment/student-equipment";
import type { TxConfigChangedData, TxErrorData, TxTransmitChangedData } from "./equipment/transmitter/transmitter";
import { EventBus } from "./events/event-bus";
import { Events } from "./events/events";

export interface AppState {
  equipment?: {
    spectrumAnalyzers?: SpectrumAnalyzer[];
  };
}

// Ensure global state is available and typed
declare global {
  var __APP_STORE__: AppState;
}

// Storage key for persisting state
const STORAGE_KEY = '__APP_STORE__';

// Load state from localStorage
function loadPersistedState(): AppState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.warn('Failed to load persisted state:', error);
    return {};
  }
}

// Save state to localStorage
function persistState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Failed to persist state:', error);
  }
}

// Initialize store with persisted data or empty object
const store: AppState = globalThis.__APP_STORE__ ?? loadPersistedState();

const webpackHotModule = import.meta.webpackHot;

if (webpackHotModule) {
  webpackHotModule.dispose(() => {
    globalThis.__APP_STORE__ = store;
    persistState(store);
  });
  webpackHotModule.accept();
}

// Singleton accessor
export function getStore(): AppState {
  // Only set __APP_STORE__ if it hasn't been set yet
  if (!globalThis.__APP_STORE__) {
    globalThis.__APP_STORE__ = store;
  }
  return globalThis.__APP_STORE__;
}

// Update store and persist changes
export function updateStore(updates: Partial<AppState>): AppState {
  const currentStore = getStore();
  Object.assign(currentStore, updates);
  globalThis.__APP_STORE__ = currentStore;
  persistState(currentStore);
  return currentStore;
}

// Clear persisted store (useful for development/testing)
export function clearPersistedStore(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    globalThis.__APP_STORE__ = {};
  } catch (error) {
    console.warn('Failed to clear persisted store:', error);
  }
}

export const syncEquipmentWithStore = (studentEquipment: StudentEquipment) => {
  const appStore = getStore();

  // Sync Spectrum Analyzers
  appStore.equipment?.spectrumAnalyzers?.forEach((storedSa) => {
    const localSa = studentEquipment.spectrumAnalyzers.find(sa => sa.config.unit === storedSa.config.unit);
    if (localSa) {
      localSa.config = { ...storedSa.config };
      localSa.update();
    }
  });
};

export const syncStoreWithEquipment = (studentEquipment: StudentEquipment) => {
  // Sync Spectrum Analyzers and persist changes
  updateStore({
    equipment: {
      spectrumAnalyzers: studentEquipment.spectrumAnalyzers,
    }
  });
};

// Subscribe to each event in EventMap individually
const eventBus = EventBus.getInstance();

eventBus.on(Events.ANTENNA_CONFIG_CHANGED, (data: AntennaConfig) => {
  console.log(`Event: ${Events.ANTENNA_CONFIG_CHANGED}`, data);
});
eventBus.on(Events.ANTENNA_LOOPBACK_CHANGED, (data: AntennaLoopbackChangedData) => {
  console.log(`Event: ${Events.ANTENNA_LOOPBACK_CHANGED}`, data);
});
eventBus.on(Events.ANTENNA_HPA_CHANGED, (data: AntennaHpaChangedData) => {
  console.log(`Event: ${Events.ANTENNA_HPA_CHANGED}`, data);
});
eventBus.on(Events.ANTENNA_TRACK_CHANGED, (data: AntennaTrackChangedData) => {
  console.log(`Event: ${Events.ANTENNA_TRACK_CHANGED}`, data);
});
eventBus.on(Events.ANTENNA_LOCKED, (data: AntennaLockedData) => {
  console.log(`Event: ${Events.ANTENNA_LOCKED}`, data);
});
eventBus.on(Events.ANTENNA_POWER_CHANGED, (data: AntennaPowerChangedData) => {
  console.log(`Event: ${Events.ANTENNA_POWER_CHANGED}`, data);
});
eventBus.on(Events.ANTENNA_ERROR, (data: AntennaErrorData) => {
  console.log(`Event: ${Events.ANTENNA_ERROR}`, data);
});

eventBus.on(Events.TX_CONFIG_CHANGED, (data: TxConfigChangedData) => {
  console.log(`Event: ${Events.TX_CONFIG_CHANGED}`, data);
});
eventBus.on(Events.TX_TRANSMIT_CHANGED, (data: TxTransmitChangedData) => {
  console.log(`Event: ${Events.TX_TRANSMIT_CHANGED}`, data);
});
eventBus.on(Events.TX_ERROR, (data: TxErrorData) => {
  console.log(`Event: ${Events.TX_ERROR}`, data);
});

eventBus.on(Events.RX_CONFIG_CHANGED, (data: RxConfigChangedData) => {
  console.log(`Event: ${Events.RX_CONFIG_CHANGED}`, data);
});
eventBus.on(Events.RX_SIGNAL_FOUND, (data: RxSignalFoundData) => {
  console.log(`Event: ${Events.RX_SIGNAL_FOUND}`, data);
});
eventBus.on(Events.RX_SIGNAL_LOST, (data: RxSignalLostData) => {
  console.log(`Event: ${Events.RX_SIGNAL_LOST}`, data);
});

eventBus.on(Events.SPEC_A_CONFIG_CHANGED, (data: Partial<SpectrumAnalyzerConfig>) => {
  console.log(`Event: ${Events.SPEC_A_CONFIG_CHANGED}`, data);
});
eventBus.on(Events.SPEC_A_MODE_CHANGED, (data: Partial<SpectrumAnalyzerConfig>) => {
  console.log(`Event: ${Events.SPEC_A_MODE_CHANGED}`, data);

  const selectedSpectrumAnalyzer = store.equipment?.spectrumAnalyzers?.[data.unit ?? -1];
  if (!selectedSpectrumAnalyzer || data.rf === undefined) {
    return;
  }
});

eventBus.on(Events.ROUTE_CHANGED, (data: { path: string }) => {
  console.log(`Event: ${Events.ROUTE_CHANGED}`, data);
});

