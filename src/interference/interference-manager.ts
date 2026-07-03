/**
 * @file InterferenceManager - Scheduled, time-windowed RF interference
 * @description Injects interference signals into a satellite's uplink path on
 * a configurable duty cycle. Because injection happens at the satellite
 * (externalSignal), the transponder relays the interferer to EVERY receiving
 * station - modeling uplink interference/jamming, which is the
 * discrimination-relevant case (local terrestrial interference would appear
 * at one station only).
 *
 * Scenarios configure via `settings.interferenceEvents`. The windowed on/off
 * pattern is the training signal: deliberate interference has a duty cycle;
 * accidents are continuous or random.
 */

import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { ScenarioManager } from '@app/scenario-manager';
import { SignalOrigin } from '@app/signal-origin';
import { SimulationManager } from '@app/simulation/simulation-manager';
import type { dBi, dBm, FECType, Hertz, ModulationType, RfFrequency, RfSignal } from '@app/types';
import type { Milliseconds } from 'ootk';

/**
 * Ground-truth location of a terrestrial interference source (Campaign 5+).
 * Never rendered to the player directly - it drives geolocation measurement
 * synthesis and objective grading only.
 */
export interface EmitterGroundTruth {
  /** WGS-84 latitude, degrees */
  latitude: number;
  /** WGS-84 longitude, degrees */
  longitude: number;
  /** Altitude above the WGS-84 ellipsoid, km. Default: 0 */
  altitudeKm?: number;
}

export interface InterferenceEventConfig {
  id: string;
  /** NORAD ID of the satellite whose transponder relays the interferer */
  satelliteNoradId: number;
  /** Interferer RF center frequency (uplink, Hz) */
  frequency: number;
  /** Interferer bandwidth (Hz) */
  bandwidth: number;
  /** Interferer power at the transponder input (dBm) */
  power: number;
  /** Uplink polarization - must match the victim transponder to route */
  polarization: 'H' | 'V';
  /** Seconds since mission start when the event envelope opens */
  startTime: number;
  /** Total envelope duration (s); on/off windows repeat inside it */
  duration: number;
  /** Window cycle period (s) */
  periodSeconds: number;
  /** Transmit-on time per period (s) */
  onSeconds: number;
  /**
   * Opt-in (Campaign 5+): where on Earth the interferer transmits from.
   * When omitted, behavior is identical to before - the event is a pure
   * transponder injection with no geolocation observables.
   */
  emitter?: EmitterGroundTruth;
}

export class InterferenceManager {
  private static instance_: InterferenceManager | null = null;

  private events_: InterferenceEventConfig[] = [];
  private missionStartTime_ = 0;
  /** Currently-injected signalIds (subset of events) */
  private readonly activeSignalIds_ = new Set<string>();
  private readonly boundUpdateHandler_: (dt: Milliseconds) => void;

  private constructor() {
    this.missionStartTime_ = Date.now();
    this.boundUpdateHandler_ = this.update_.bind(this);
    this.events_ = ScenarioManager.getInstance().settings.interferenceEvents ?? [];
    EventBus.getInstance().on(Events.UPDATE, this.boundUpdateHandler_);
  }

  static getInstance(): InterferenceManager {
    this.instance_ ??= new InterferenceManager();
    return this.instance_;
  }

  static destroy(): void {
    if (this.instance_) {
      EventBus.getInstance().off(Events.UPDATE, this.instance_.boundUpdateHandler_);
      this.instance_ = null;
    }
  }

  /** Whether the event's interferer is currently transmitting */
  isEventActive(eventId: string): boolean {
    return this.activeSignalIds_.has(InterferenceManager.signalIdFor(eventId));
  }

  /** Event config by id (undefined when the scenario doesn't declare it) */
  getEvent(eventId: string): InterferenceEventConfig | undefined {
    return this.events_.find((event) => event.id === eventId);
  }

  /** All events carrying geolocatable emitter ground truth (Campaign 5+) */
  getEventsWithEmitters(): InterferenceEventConfig[] {
    return this.events_.filter((event) => event.emitter !== undefined);
  }

  static signalIdFor(eventId: string): string {
    return `INTERFERER-${eventId}`;
  }

  private update_(): void {
    const elapsed = (Date.now() - this.missionStartTime_) / 1000;
    const sim = SimulationManager.getInstance();

    for (const event of this.events_) {
      const signalId = InterferenceManager.signalIdFor(event.id);
      const inEnvelope = elapsed >= event.startTime && elapsed < event.startTime + event.duration;
      const phase = (elapsed - event.startTime) % event.periodSeconds;
      const shouldTransmit = inEnvelope && phase < event.onSeconds;
      const isInjected = this.activeSignalIds_.has(signalId);

      if (shouldTransmit === isInjected) continue;

      const satellite = sim.satellites.find(s => s.noradId === event.satelliteNoradId);
      if (!satellite) continue;

      if (shouldTransmit) {
        const signal: RfSignal = {
          signalId,
          serverId: 1,
          noradId: event.satelliteNoradId,
          frequency: event.frequency as RfFrequency,
          polarization: event.polarization,
          power: event.power as dBm,
          bandwidth: event.bandwidth as Hertz,
          modulation: 'null' as ModulationType, // Noise-like, unmodulated blob
          fec: 'null' as FECType,
          feed: '',
          isDegraded: false,
          origin: SignalOrigin.SATELLITE_RX,
          noiseFloor: null,
          gainInPath: 0 as dBi,
        };
        satellite.externalSignal.push(signal);
        this.activeSignalIds_.add(signalId);
      } else {
        satellite.externalSignal = satellite.externalSignal.filter(s => s.signalId !== signalId);
        this.activeSignalIds_.delete(signalId);
      }
    }
  }
}
