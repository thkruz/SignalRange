import { Satellite } from '@app/equipment/satellite/satellite';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { Milliseconds } from 'ootk';
import { dBm, FECType, Hertz, ModulationType, RfFrequency, RfSignal, SignalOrigin } from './../types';

export class SimulationManager {
  private static instance_: SimulationManager;
  /** Delta time between frames in milliseconds */
  dt = 0 as Milliseconds;

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

    this.gameLoop_();
  }

  static getInstance(): SimulationManager {
    if (!this.instance_) {
      this.instance_ = new SimulationManager();
      window.signalRange.simulationManager = this.instance_;
    }
    return this.instance_;
  }

  private lastFrameTime = performance.now();

  private gameLoop_(): void {
    const now = performance.now();
    this.dt = (now - this.lastFrameTime) as Milliseconds;
    this.lastFrameTime = now;

    this.update(this.dt);
    this.draw(this.dt);
    requestAnimationFrame(this.gameLoop_.bind(this));
  }

  private update(_dt: Milliseconds): void {
    EventBus.getInstance().emit(Events.UPDATE, _dt);
  }

  private draw(_dt: Milliseconds): void {
    EventBus.getInstance().emit(Events.DRAW, _dt);
  }

  sync(): void {
    EventBus.getInstance().emit(Events.SYNC);
  }

  getSatelliteByNoradId(noradId: number): Satellite | undefined {
    return this.satellites.find(sat => sat.noradId === noradId);
  }

  static destroy(): void {
    SimulationManager.instance_ = null;
  }
}