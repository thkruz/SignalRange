import { RfSignal } from './../types';
import { defaultSignalData } from "./default-signal-data";

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
        s.targetId === signal.targetId &&
        s.id === signal.id);
    });
  }

  getVisibleSignals(serverId: number, targetId: number): RfSignal[] {
    // Return signals within the specified frequency range
    const satelliteSignals = this.satelliteSignals.filter(() => {
      // Make signals intermittent
      if (Math.random() < 0.2) {
        return false;
      }

      return true;
    });

    const allSignals = [...satelliteSignals, ...this.userSignals];
    const visibleSignals = allSignals.filter((signal) => {
      const isCurrentServer = signal.serverId === serverId;
      const isCurrentSatellite = signal.targetId === targetId;

      return isCurrentServer && isCurrentSatellite;
    });

    return visibleSignals;
  }
}