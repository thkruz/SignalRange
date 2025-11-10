import { Satellite } from '@app/equipment/satellite/satellite';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { dBm, FECType, Hertz, ModulationType, RfFrequency, RfSignal, SignalOrigin } from './../types';

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
          power: 40 as dBm,
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
    // Update each satellite's state
    this.satellites.forEach(sat => {
      this.userSignals.filter(signal => signal.noradId === sat.noradId).forEach(signal => {
        sat.addReceivedSignal(signal);
      });
      sat.update();
    });

    // Get all transmitted signals from satellites
    this.satelliteSignals = this.satellites.flatMap(sat => sat.getTransmittedSignals());
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
    // Get all satellite signals with effects already applied by Satellite class
    // Signal variation, dropout, and degradation are now handled in Satellite.getTransmittedSignals()
    const satelliteSignals = this.satellites.flatMap(sat => sat.getTransmittedSignals());

    // Combine satellite signals with user signals
    const allSignals = [...satelliteSignals, ...this.userSignals];

    // Filter signals for the current server and satellite
    const visibleSignals = allSignals.filter((signal) => {
      const isCurrentServer = signal.serverId === serverId;
      const isCurrentSatellite = signal.noradId === targetId;

      return isCurrentServer && isCurrentSatellite;
    });

    return visibleSignals;
  }
}