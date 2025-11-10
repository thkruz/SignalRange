import { Satellite } from '@app/equipment/satellite/satellite';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { FECType, Hertz, ModulationType, RfFrequency, RfSignal, SignalOrigin } from './../types';
import { PerlinNoise } from './perlin-noise';

export class SimulationManager {
  private static instance: SimulationManager;
  satellites: Satellite[] = [];
  satelliteSignals: RfSignal[];
  userSignals: RfSignal[] = [];

  private constructor() {
    this.satellites = [
      new Satellite(1, [
        {
          id: '1',
          serverId: 1,
          noradId: 1,
          frequency: 2810e6 as RfFrequency,
          polarization: 'H',
          power: -98,
          bandwidth: 10e6 as Hertz,
          modulation: '8QAM' as ModulationType,
          fec: '3/4' as FECType,
          feed: 'red-1.mp4',
          isDegraded: false,
          origin: SignalOrigin.SATELLITE_RX
        }
      ])
    ];

    this.satelliteSignals = this.satellites.flatMap(sat => sat.txSignal);

    // Register event listeners
    EventBus.getInstance().on(Events.UPDATE, this.update.bind(this));
  }

  public static getInstance(): SimulationManager {
    if (!this.instance) {
      this.instance = new SimulationManager();
      window.signalRange.simulationManager = this.instance;
    }
    return this.instance;
  }

  update(): void {
    this.satelliteSignals = this.satellites.flatMap(sat => sat.txSignal);
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
      if (Math.random() < 0.0001) {
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