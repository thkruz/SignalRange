/**
 * @file InterferenceManager - Scheduled, time-windowed RF interference
 * @description Two delivery paths, selected per event by `path`:
 * - 'transponder' (default): injects at the satellite's uplink
 *   (externalSignal), so the transponder relays the interferer to EVERY
 *   receiving station - uplink interference/jamming.
 * - 'terrestrial' (Campaign 3+): a ground-based emitter received directly by
 *   station antennas (bearing + off-axis pattern, no Doppler) - local RFI,
 *   fake beacons, GPS spoofers. Appears only at stations that can hear it.
 *
 * Scenarios configure via `settings.interferenceEvents`. The windowed on/off
 * pattern is the training signal: deliberate interference has a duty cycle;
 * accidents are continuous or random.
 */

import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { ScenarioManager } from '@app/scenario-manager';
import { SignalOrigin } from '@app/signal-origin';
import { missionNowMs } from '@app/simulation/mission-clock';
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
  /**
   * NORAD ID of the satellite whose transponder relays the interferer.
   * Required for the (default) transponder path; ignored for terrestrial.
   */
  satelliteNoradId?: number;
  /** Interferer RF center frequency (uplink, Hz) */
  frequency: number;
  /** Interferer bandwidth (Hz) */
  bandwidth: number;
  /**
   * Interferer power (dBm). Transponder path: power at the transponder
   * input. Terrestrial path: the emitter's EIRP.
   */
  power: number;
  /** Polarization. Transponder path must match the victim transponder to route */
  polarization: 'H' | 'V' | 'RHCP' | 'LHCP';
  /** Seconds since mission start when the event envelope opens */
  startTime: number;
  /** Total envelope duration (s); on/off windows repeat inside it */
  duration: number;
  /** Window cycle period (s) */
  periodSeconds: number;
  /** Transmit-on time per period (s) */
  onSeconds: number;
  /**
   * Opt-in (Campaign 3+): how the interferer reaches the player.
   * - 'transponder' (default, and the behavior when absent): injected at the
   *   satellite's uplink and relayed to every receiving station.
   * - 'terrestrial': a ground-based emitter received DIRECTLY by station
   *   antennas via great-circle bearing and the antenna's off-axis pattern.
   *   No Doppler is applied - that absence is a diagnostic tell (a "satellite"
   *   signal that never drifts is transmitting from the ground). Requires
   *   `emitter`; `satelliteNoradId` is ignored.
   */
  path?: 'transponder' | 'terrestrial';
  /**
   * Opt-in (Campaign 5+): where on Earth the interferer transmits from.
   * For 'transponder' events it only drives geolocation observables; for
   * 'terrestrial' events it is REQUIRED - it is the physical signal source.
   */
  emitter?: EmitterGroundTruth;
}

/** A terrestrial event currently on the air (consumed by AntennaCore) */
export interface ActiveTerrestrialEmission {
  signalId: string;
  frequencyHz: number;
  bandwidthHz: number;
  polarization: 'H' | 'V' | 'RHCP' | 'LHCP';
  /** Emitter EIRP, dBm */
  eirpDbm: number;
  emitter: EmitterGroundTruth;
}

export class InterferenceManager {
  private static instance_: InterferenceManager | null = null;

  private events_: InterferenceEventConfig[] = [];
  private missionStartTime_ = 0;
  /** Currently-injected signalIds (subset of events) */
  private readonly activeSignalIds_ = new Set<string>();
  private readonly boundUpdateHandler_: (dt: Milliseconds) => void;

  private constructor() {
    this.missionStartTime_ = missionNowMs();
    this.boundUpdateHandler_ = this.update_.bind(this);
    this.events_ = ScenarioManager.getInstance().settings.interferenceEvents ?? [];
    EventBus.getInstance().on(Events.UPDATE, this.boundUpdateHandler_);
  }

  static getInstance(): InterferenceManager {
    this.instance_ ??= new InterferenceManager();
    return this.instance_;
  }

  static isInitialized(): boolean {
    return this.instance_ !== null;
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

  /**
   * Terrestrial events currently on the air (Campaign 3+). AntennaCore sums
   * these into each station's received spectrum using bearing, distance, and
   * its own off-axis pattern - so a directional antenna can DF the emitter.
   */
  getActiveTerrestrialEmissions(): ActiveTerrestrialEmission[] {
    return this.events_
      .filter((event) =>
        (event.path ?? 'transponder') === 'terrestrial' &&
        event.emitter !== undefined &&
        this.activeSignalIds_.has(InterferenceManager.signalIdFor(event.id)))
      .map((event) => ({
        signalId: InterferenceManager.signalIdFor(event.id),
        frequencyHz: event.frequency,
        bandwidthHz: event.bandwidth,
        polarization: event.polarization,
        eirpDbm: event.power,
        emitter: event.emitter!,
      }));
  }

  static signalIdFor(eventId: string): string {
    return `INTERFERER-${eventId}`;
  }

  private update_(): void {
    const elapsed = (missionNowMs() - this.missionStartTime_) / 1000;
    const sim = SimulationManager.getInstance();

    for (const event of this.events_) {
      const signalId = InterferenceManager.signalIdFor(event.id);
      const inEnvelope = elapsed >= event.startTime && elapsed < event.startTime + event.duration;
      const phase = (elapsed - event.startTime) % event.periodSeconds;
      const shouldTransmit = inEnvelope && phase < event.onSeconds;
      const isInjected = this.activeSignalIds_.has(signalId);

      if (shouldTransmit === isInjected) continue;

      // Terrestrial events never touch a satellite - the active set alone
      // drives reception (AntennaCore polls getActiveTerrestrialEmissions)
      if ((event.path ?? 'transponder') === 'terrestrial') {
        if (shouldTransmit) {
          this.activeSignalIds_.add(signalId);
        } else {
          this.activeSignalIds_.delete(signalId);
        }
        continue;
      }

      const satellite = sim.satellites.find(s => s.noradId === event.satelliteNoradId);
      if (!satellite) continue;

      if (shouldTransmit) {
        const signal: RfSignal = {
          signalId,
          serverId: 1,
          noradId: satellite.noradId,
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
