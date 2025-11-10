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
          /** Must be the uplinkl to match the antenna in simulation */
          frequency: 5935e6 as RfFrequency,
          polarization: 'H',
          power: 40 as dBm, // 10 W
          bandwidth: 10e6 as Hertz,
          modulation: '8QAM' as ModulationType, // We need about 7 C/N to support 8QAM
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
    // Nothing right now
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

  getSatelliteByNoradId(noradId: number): Satellite | undefined {
    return this.satellites.find(sat => sat.noradId === noradId);
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