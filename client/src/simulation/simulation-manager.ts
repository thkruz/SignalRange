import { RfSignal } from './../types';
import { defaultSignalData } from "./default-signal-data";
import { PerlinNoise } from './perlin-noise';

export class SimulationManager {
  private static instance: SimulationManager;
  satelliteSignals: RfSignal[] = defaultSignalData;
  userSignals: RfSignal[] = [];

  private constructor() {
    // Private constructor for singleton
  }

  public static getInstance(): SimulationManager {
    if (!this.instance) {
      this.instance = new SimulationManager();
      window.signalRange.simulationManager = this.instance;
    }
    return this.instance;
  }

  update(): void {
    // Update simulation state
  }

  addSignal(signal: RfSignal): void {
    this.removeSignal(signal);

    // Add the new signal
    this.userSignals.push(signal);
  }

  removeSignal(signal: RfSignal): void {
    this.userSignals = this.userSignals.filter(s => {
      return !(s.serverId === signal.serverId &&
        s.noradId === signal.noradId &&
        s.id === signal.id);
    });
  }

  clearUserSignals(): void {
    this.userSignals = [];
  }

  getVisibleSignals(serverId: number, targetId: number): RfSignal[] {
    // Return signals within the specified frequency range
    const satelliteSignals = this.satelliteSignals.filter(() => {
      // Random drop to simulate interference
      if (Math.random() < 0.001) {
        return false;
      }

      return true;
    }).map(signal => {
      // Slightly vary signal amplitude
      const time = Date.now() / 1000 + Math.random() * 1000;
      const variation = (PerlinNoise.getInstance(signal.id.toString()).get(time) * 2 - 1) * 2; // +/-2 dB, smoother variation
      return {
        ...signal,
        power: signal.power + variation
      };
    });

    const allSignals = [...satelliteSignals, ...this.userSignals];
    const visibleSignals = allSignals.filter((signal) => {
      const isCurrentServer = signal.serverId === serverId;
      const isCurrentSatellite = signal.noradId === targetId;

      return isCurrentServer && isCurrentSatellite;
    });

    return visibleSignals;
  }
}