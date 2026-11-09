import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { SignalOrigin } from '@app/signal-origin';
import { type GeoSite, geoLongitudeFromAzimuth, geoLookAngles, geoPolarizationSkewDeg, geoSlantRangeKm } from '@app/simulation/geo-geometry';
import { PerlinNoise } from '@app/simulation/perlin-noise';
import { Rng, type RngStream } from '@app/simulation/rng';
import { SimClock } from '@app/simulation/sim-clock';
import { getSimulatedNowMs } from '@app/simulation/sim-time';
import { dBi, dBm, Hertz, RfFrequency, RfSignal } from '@app/types';
import { Degrees } from 'ootk';
import { DEFAULT_TRANSPONDER_PHYSICS, operateTransponder, type TransponderOperatingPoint, type TransponderPhysics } from './transponder-model';

/** Free-space path loss, dB (ITU-R P.525) */
function freeSpaceLossDb(frequencyHz: number, distanceKm: number): number {
  return 32.45 + 20 * Math.log10(Math.max(1e-3, distanceKm)) + 20 * Math.log10(frequencyHz / 1e6);
}

/**
 * Configuration for explicitly defining a satellite transponder.
 * Used when creating satellites with multiple transponders that have
 * distinct passbands and frequency offsets.
 */
export interface TransponderConfig {
  /** Unique transponder identifier (e.g., "TP-1", "TP-2") */
  id: string;
  /** Center frequency of the uplink passband in Hz */
  uplinkCenterFrequency: RfFrequency;
  /** Transponder bandwidth in Hz (passband width) */
  bandwidth: Hertz;
  /** Frequency offset: downlink = uplink - offset */
  frequencyOffset: Hertz;
  /** Transponder polarization - only signals matching this polarization are processed */
  polarization: 'H' | 'V' | 'LHCP' | 'RHCP';
  /** Optional beacon signal for this transponder */
  beacon?: RfSignal;
  /**
   * Transponder physics (Phase 19.3): SFD, G/T, saturated EIRP, amplifier
   * class and gain mode. Omitted fields take DEFAULT_TRANSPONDER_PHYSICS.
   */
  physics?: Partial<TransponderPhysics>;
  /** Whether transponder is initially active, default true */
  isActive?: boolean;
}

/**
 * Represents a transponder configuration on a satellite.
 */
export interface Transponder {
  /** Transponder ID */
  id: string;
  /** Center frequency of the transponder uplink band (Hz) */
  uplinkFrequency: RfFrequency;
  /** Center frequency of the transponder downlink band (Hz) */
  downlinkFrequency: RfFrequency;
  /** Beacon signal */
  beacon?: RfSignal;
  /** Transponder bandwidth (Hz) */
  bandwidth: Hertz;
  /** SFD, G/T, saturated EIRP, amplifier and gain mode (Phase 19.3) */
  physics: TransponderPhysics;
  /** Whether the transponder is active */
  isActive: boolean;
  /** Lower edge of uplink passband (uplinkFrequency - bandwidth/2) */
  uplinkLowEdge: RfFrequency;
  /** Upper edge of uplink passband (uplinkFrequency + bandwidth/2) */
  uplinkHighEdge: RfFrequency;
  /** Transponder polarization for signal filtering */
  polarization: 'H' | 'V' | 'LHCP' | 'RHCP';
  /** Per-transponder frequency offset */
  frequencyOffset: Hertz;
}

/**
 * Configuration for signal degradation effects.
 */
export interface SignalDegradationConfig {
  /**
   * Atmospheric effects on relayed carriers. No effect since Phase 19.2: rain
   * is modelled once, at the receiving antenna (attenuation and noise rise),
   * and scintillation is a 19.7 item (a seeded P.618 §2.4 process).
   */
  atmosphericEffects: boolean;
  /** Enable random signal dropout simulation */
  randomDropout: boolean;
  /** Dropout probability (0-1) */
  dropoutProbability: number;
  /** Enable power variation simulation */
  powerVariation: boolean;
  /** Power variation range in dB */
  powerVariationRange: dBm;
  /** Enable interference simulation */
  interference: boolean;
  /** Interference power level */
  interferencePower: dBm;
}

/**
 * Satellite orbit type determining position behavior.
 * - 'geostationary': fixed az/el (default)
 * - 'geosynchronous': parametric figure-8 (analemma) pattern
 * - 'leo': real SGP4-propagated orbit; only valid on OrbitalSatellite subclass
 */
export type OrbitType = 'geostationary' | 'geosynchronous' | 'leo';

/**
 * Configuration for geosynchronous (inclined) orbit figure-8 pattern.
 * The satellite traces an analemma pattern due to orbital inclination.
 */
export interface GeosyncOrbitConfig {
  /** Minimum azimuth of the figure-8 pattern (degrees) */
  minAz: Degrees;
  /** Maximum azimuth of the figure-8 pattern (degrees) */
  maxAz: Degrees;
  /** Minimum elevation of the figure-8 pattern (degrees) */
  minEl: Degrees;
  /** Maximum elevation of the figure-8 pattern (degrees) */
  maxEl: Degrees;
  /** Initial phase offset (radians, 0-2*PI) - where satellite starts in pattern */
  initialPhase?: number;
  /**
   * Opt-in period of the figure-8, hours of scenario time (Phase 32 D19,
   * nats-r7-s18-F1). A real inclined GEO bird traces its figure-8 once a
   * sidereal day: 24 h on a +/-1.3 deg swing peaks at about 0.34 deg/h in
   * elevation. Set, the phase is `initialPhase` at scenario start and runs on
   * scenario time (paused with briefs, restored with checkpoints). Omitted:
   * the legacy training rate, a peak of 0.1 deg per 30 s whatever the size of
   * the swing (AURORA-7's step-track lessons are built on it).
   */
  periodHours?: number;
}

export interface SatelliteState {
  /**
   * Linear polarization skew, degrees. Ignored when the satellite has a slot
   * (`lookAnglesFrom`): the skew is then derived from geometry (Phase 29 D8).
   * Otherwise random per NORAD id if not specified.
   */
  rotation?: Degrees;
  az: Degrees;
  el: Degrees;
  /** Legacy: single frequency offset for all transponders (used when transponderConfigs not provided) */
  frequencyOffset: Hertz;
  degradationConfig?: Partial<SignalDegradationConfig>;
  /** Explicit transponder configurations (takes precedence over legacy signal-derived transponders) */
  transponderConfigs?: TransponderConfig[];
  /** Orbit type: 'geostationary' (fixed position) or 'geosynchronous' (figure-8 pattern). Default: 'geostationary' */
  orbitType?: OrbitType;
  /** Configuration for geosynchronous orbit pattern (required if orbitType is 'geosynchronous') */
  geosyncConfig?: GeosyncOrbitConfig;
  // === Ephemeris Error (simulates TLE inaccuracy) ===
  /** Azimuth error in TLE prediction (degrees). Program-track points to az + this error. */
  ephemerisErrorAz?: Degrees;
  /** Elevation error in TLE prediction (degrees). Program-track points to el + this error. */
  ephemerisErrorEl?: Degrees;
  /**
   * The station the authored az/el (and rotation) are written for (phase
   * 19.4). Gives the satellite a slot longitude, so every other station sees
   * it at the authored angles shifted by the real geometric difference
   * between the sites, and its linear polarization skew follows the site.
   * Omitted: one az/el for every station (legacy).
   */
  lookAnglesFrom?: GeoSite;
}

/** Offsets of a legacy GEO satellite's look angles and skew at one station, relative to its reference station */
export interface StationLookOffsets {
  dAz: number;
  dEl: number;
  dRotation: number;
}

/**
 * This represents a Satellite on orbit with comprehensive RF signal processing.
 * Handles signal reception, transponder operations, and transmission with realistic
 * effects for SATCOM and Electronic Warfare simulation.
 */
export class Satellite {
  /** NORAD catalog number */
  noradId: number;

  /** External signals being sent to the satellite */
  externalSignal: RfSignal[];
  /** Received signals at the satellite */
  rxSignal: RfSignal[];

  /** Transmitted signals from the satellite */
  txSignal: RfSignal[];

  /** Transponder configurations */
  transponders: Transponder[];

  /** Signal degradation configuration */
  degradationConfig: SignalDegradationConfig;

  /** Perlin noise instances for smooth signal variations (keyed by signal ID) */
  private readonly noiseGenerators: Map<string, PerlinNoise>;

  /** Current satellite health status (0-1, where 1 is healthy) */
  health: number;

  /** Uplink to downlink frequency offset (Hz) */
  private readonly frequencyOffset: number;

  /** This satellite's random stream for the current run seed */
  private get rng_(): RngStream {
    return Rng.stream(`satellite:${this.noradId}`);
  }
  private readonly boundUpdateHandler_: () => void;
  private isSubscribedToEventBus_ = false;

  el: Degrees;
  az: Degrees;
  rotation: Degrees;
  name: string;

  /** Ephemeris error in azimuth (degrees) - simulates TLE inaccuracy */
  ephemerisErrorAz: Degrees = 0 as Degrees;
  /** Ephemeris error in elevation (degrees) - simulates TLE inaccuracy */
  ephemerisErrorEl: Degrees = 0 as Degrees;

  /** Station the authored look angles belong to (see SatelliteState.lookAnglesFrom) */
  readonly lookAnglesFrom: GeoSite | null;
  /** Slot longitude (degrees east) derived from the authored azimuth at the reference station; null without one */
  readonly slotLongitudeDeg: number | null;
  /** Each transponder's operating point from the last update */
  private readonly operatingPoints_ = new Map<string, TransponderOperatingPoint>();
  /** Per-station look-angle offsets, keyed by site */
  private readonly stationOffsets_ = new Map<string, StationLookOffsets>();

  /** Orbit type - geostationary (fixed) or geosynchronous (figure-8 pattern) */
  readonly orbitType: OrbitType;

  /** Geosynchronous orbit configuration (null for geostationary) */
  private readonly geosyncConfig_: {
    centerAz: number;
    centerEl: number;
    azAmplitude: number;
    elAmplitude: number;
    /** Phase at scenario start, radians */
    initialPhase: number;
    /** Figure-8 period in ms of scenario time; null = the legacy training rate */
    periodMs: number | null;
  } | null = null;

  /** Current phase in the figure-8 pattern (radians, 0 to 2*PI) */
  private phase_: number = 0;

  /** Timestamp of last position update (ms) - for throttling */
  protected lastPositionUpdateTime_: number = 0;

  /** Position update interval (ms) */
  protected static readonly POSITION_UPDATE_INTERVAL_MS = 1000;

  /** Default downlink fade depth when a scenario does not author one: about +/-0.3 dB */
  static readonly DEFAULT_POWER_VARIATION_RANGE_DB = 0.3 as dBm;

  /** Run time per Perlin noise unit for the downlink fade: tens of seconds per swing */
  static readonly FADE_TIME_SCALE_MS = 30_000;

  /**
   * Slant range from the ground station to the satellite (km).
   * Null for legacy fixed-telemetry satellites, in which case the antenna
   * falls back to the nominal GEO slant range for path-loss calculations.
   * Populated each position update by OrbitalSatellite.
   */
  rangeKm: number | null = null;

  /** Rate of position change: 0.1 degrees per 30 seconds (peak velocity) */
  private static readonly POSITION_RATE_DEG_PER_MS = 0.1 / 30000;

  constructor(name: string, norad: number, rxSignal: RfSignal[] = [], beaconSignal: RfSignal[] = [], satelliteState: SatelliteState = Satellite.getDefaultState_()) {
    this.noradId = norad;
    this.externalSignal = rxSignal;
    this.rxSignal = [];
    this.frequencyOffset = satelliteState.frequencyOffset;
    this.noiseGenerators = new Map();
    this.health = 1.0;
    this.az = satelliteState.az;
    this.el = satelliteState.el;
    this.lookAnglesFrom = satelliteState.lookAnglesFrom ?? null;
    const centerAz = satelliteState.geosyncConfig ? (satelliteState.geosyncConfig.minAz + satelliteState.geosyncConfig.maxAz) / 2 : satelliteState.az;
    this.slotLongitudeDeg = this.lookAnglesFrom ? geoLongitudeFromAzimuth(this.lookAnglesFrom, centerAz) : null;
    // Phase 29 D8 (nats-r4-s04-F1): a satellite with a slot gets its skew
    // from geometry, never from an authored number. `rotation` is the skew at
    // the reference station (geoPolarizationSkewDeg; from a northern site a
    // slot EAST of the station is POSITIVE, one west negative) and
    // stationOffsets() adds the difference to any other site, so the ACU
    // polarization readout and the cross-pol physics both read the skew at
    // the station that is looking. An authored `rotation` was written per
    // satellite by hand and disagreed with the geometry (TIDEMARK-1 +14 and
    // TIDEMARK-2 -25 from Vermont, both of them east of it). Without a slot:
    // the authored skew, else fixed per NORAD id (DEV-ANT-04).
    this.rotation =
      this.lookAnglesFrom && this.slotLongitudeDeg !== null
        ? (geoPolarizationSkewDeg(this.lookAnglesFrom, this.slotLongitudeDeg) as Degrees)
        : (satelliteState.rotation ?? ((Rng.hashUniform(`satellite-rotation:${norad}`) * 90 - 45) as Degrees));
    this.ephemerisErrorAz = satelliteState.ephemerisErrorAz ?? (0 as Degrees);
    this.ephemerisErrorEl = satelliteState.ephemerisErrorEl ?? (0 as Degrees);

    this.name = name ?? `NORAD-${this.noradId}`;

    // Default degradation configuration
    this.degradationConfig = {
      atmosphericEffects: true,
      randomDropout: true,
      dropoutProbability: 0.0001,
      powerVariation: true,
      // Slow GEO C-band scintillation, a few tenths of a dB (Phase 30 D10: the
      // old +/-1 dB made a link near the lock line flap). A scenario that wants
      // a larger fade authors powerVariationRange.
      powerVariationRange: Satellite.DEFAULT_POWER_VARIATION_RANGE_DB,
      interference: false,
      interferencePower: -110 as dBm,
      ...satelliteState.degradationConfig,
    };

    // Initialize orbit type and configuration
    this.orbitType = satelliteState.orbitType ?? 'geostationary';

    if (this.orbitType === 'geosynchronous') {
      if (!satelliteState.geosyncConfig) {
        throw new Error(`Satellite ${name}: geosyncConfig required for geosynchronous orbit`);
      }
      const config = satelliteState.geosyncConfig;
      // Convert min/max to center/amplitude for parametric equations
      this.geosyncConfig_ = {
        centerAz: (config.minAz + config.maxAz) / 2,
        centerEl: (config.minEl + config.maxEl) / 2,
        azAmplitude: (config.maxAz - config.minAz) / 2,
        elAmplitude: (config.maxEl - config.minEl) / 2,
        initialPhase: config.initialPhase ?? 0,
        periodMs: config.periodHours !== undefined && config.periodHours > 0 ? config.periodHours * 3_600_000 : null,
      };
      this.phase_ = config.initialPhase ?? 0;
      // Set initial position based on phase
      this.az = (this.geosyncConfig_.centerAz + this.geosyncConfig_.azAmplitude * Math.sin(2 * this.phase_)) as Degrees;
      this.el = (this.geosyncConfig_.centerEl + this.geosyncConfig_.elAmplitude * Math.sin(this.phase_)) as Degrees;
    }

    // Initialize transponders: use explicit config if provided, otherwise derive from signals
    if (satelliteState.transponderConfigs?.length) {
      this.transponders = this.initializeTranspondersFromConfig_(satelliteState.transponderConfigs);
    } else {
      this.transponders = this.initializeTransponders_(rxSignal, beaconSignal);
    }

    // Process received signals through transponders to generate transmitted signals
    this.txSignal = this.processSignals();

    // Store bound handler for proper subscription/unsubscription
    this.boundUpdateHandler_ = this.update.bind(this);
  }

  /**
   * Subscribe to EventBus for update events.
   * Called by SimulationManager when scenario loads to ensure subscription to current EventBus.
   */
  subscribeToEventBus(): void {
    if (this.isSubscribedToEventBus_) {
      // Unsubscribe first to avoid duplicate handlers
      EventBus.getInstance().off(Events.UPDATE, this.boundUpdateHandler_);
    }
    EventBus.getInstance().on(Events.UPDATE, this.boundUpdateHandler_);
    this.isSubscribedToEventBus_ = true;
  }

  /** Stop receiving update events (a released constellation member). */
  unsubscribeFromEventBus(): void {
    if (this.isSubscribedToEventBus_) {
      EventBus.getInstance().off(Events.UPDATE, this.boundUpdateHandler_);
      this.isSubscribedToEventBus_ = false;
    }
  }

  private static getDefaultState_(): SatelliteState {
    return {
      az: 0 as Degrees,
      el: 0 as Degrees,
      frequencyOffset: 2.225e9 as Hertz,
      degradationConfig: {},
    };
  }

  /**
   * Initialize transponders from explicit configuration.
   * Each config defines a complete transponder with its own passband and frequency offset.
   */
  private initializeTranspondersFromConfig_(configs: TransponderConfig[]): Transponder[] {
    return configs.map((config) => {
      const halfBandwidth = config.bandwidth / 2;
      const downlinkCenter = (config.uplinkCenterFrequency - config.frequencyOffset) as RfFrequency;

      return {
        id: config.id,
        uplinkFrequency: config.uplinkCenterFrequency,
        downlinkFrequency: downlinkCenter,
        bandwidth: config.bandwidth,
        beacon: config.beacon,
        physics: { ...DEFAULT_TRANSPONDER_PHYSICS, ...config.physics },
        isActive: config.isActive ?? true,
        uplinkLowEdge: (config.uplinkCenterFrequency - halfBandwidth) as RfFrequency,
        uplinkHighEdge: (config.uplinkCenterFrequency + halfBandwidth) as RfFrequency,
        polarization: config.polarization,
        frequencyOffset: config.frequencyOffset,
      };
    });
  }

  /**
   * Initialize transponders based on received signals (legacy backward-compatible mode).
   */
  private initializeTransponders_(rxSignals: RfSignal[], beaconSignals: RfSignal[]): Transponder[] {
    const bandwidth = 36e6 as Hertz;
    const halfBandwidth = bandwidth / 2;

    return rxSignals.map((signal, index) => ({
      id: `tp-${this.noradId}-${index}`,
      uplinkFrequency: signal.frequency,
      beacon: beaconSignals[index],
      downlinkFrequency: this.getDownlinkFromUplink(signal.frequency),
      bandwidth: bandwidth,
      physics: { ...DEFAULT_TRANSPONDER_PHYSICS },
      isActive: true,
      uplinkLowEdge: (signal.frequency - halfBandwidth) as RfFrequency,
      uplinkHighEdge: (signal.frequency + halfBandwidth) as RfFrequency,
      polarization: (signal.polarization ?? 'H') as 'H' | 'V' | 'LHCP' | 'RHCP',
      frequencyOffset: this.frequencyOffset as Hertz,
    }));
  }

  /**
   * Update satellite position for geosynchronous orbit.
   * Traces a figure-8 (analemma) pattern using parametric equations.
   * Throttled to 1 second intervals to reduce computation.
   */
  protected updatePosition_(): void {
    if (this.orbitType !== 'geosynchronous' || !this.geosyncConfig_) {
      return;
    }

    // An authored period (Phase 32 D19): the phase is a function of scenario
    // time, so every start (and every checkpoint restore) puts the bird at
    // the same point of its figure-8, and it moves every frame (a slow bird
    // has no 1 Hz step to hide)
    if (this.geosyncConfig_.periodMs !== null) {
      this.phase_ = this.geosyncConfig_.initialPhase + (2 * Math.PI * SimClock.scenarioElapsedMs()) / this.geosyncConfig_.periodMs;
      this.applyFigure8Position_();

      return;
    }

    // Throttle position updates (scenario time: the wobble is sky, and pauses with it)
    const now = getSimulatedNowMs();
    const elapsed = now - this.lastPositionUpdateTime_;
    if (elapsed < 0) {
      // A new scenario started earlier on the calendar; satellites outlive scenarios
      this.lastPositionUpdateTime_ = now;
      return;
    }
    if (elapsed < Satellite.POSITION_UPDATE_INTERVAL_MS) {
      return;
    }
    this.lastPositionUpdateTime_ = now;

    // Advance phase based on elapsed time
    // Phase rate calculated so peak velocity = 0.1 deg/30s
    const phaseRate = Satellite.POSITION_RATE_DEG_PER_MS / this.geosyncConfig_.elAmplitude;
    this.phase_ += phaseRate * elapsed;

    // Wrap phase to [0, 2*PI]
    this.phase_ %= 2 * Math.PI;
    if (this.phase_ < 0) this.phase_ += 2 * Math.PI;

    this.applyFigure8Position_();
  }

  /**
   * Az/el from the figure-8 phase. Elevation: single-frequency sine (one
   * cycle per orbit). Azimuth: double-frequency sine (the crossover).
   */
  private applyFigure8Position_(): void {
    const config = this.geosyncConfig_;
    if (!config) {
      return;
    }
    this.el = (config.centerEl + config.elAmplitude * Math.sin(this.phase_)) as Degrees;
    this.az = (config.centerAz + config.azAmplitude * Math.sin(2 * this.phase_)) as Degrees;

    // Normalize azimuth to [0, 360)
    while (this.az < 0) this.az = (this.az + 360) as Degrees;
    while (this.az >= 360) this.az = (this.az - 360) as Degrees;
  }

  /**
   * Update satellite state and process signals.
   */
  update(): void {
    // Update position for geosynchronous satellites
    this.updatePosition_();

    // Process signals through transponders
    // Note: rxSignal is populated by antenna.updateTxSignals_() each frame
    this.txSignal = this.processSignals();

    // Update satellite health based on conditions
    this.updateHealth();
  }

  /**
   * Relay what arrives in each transponder's passband (Phase 19.3). Ground
   * uplinks (`rxSignal`) arrive as isotropic received power, already through
   * the uplink path; authored third-party carriers and injected interference
   * (`externalSignal`) are their uplinker's EIRP, put through the free-space
   * loss from this satellite's reference range (`uplinkReferenceRangeKm`).
   * Each transponder's carriers are operated together (`operateTransponder`):
   * shared output power, with uplink noise and IM riding along as
   * `upstreamCn0DbHz`.
   */
  private processSignals(): RfSignal[] {
    const processedSignals: RfSignal[] = [];
    const byTransponder = new Map<Transponder, { signal: RfSignal; isoPowerDbm: number }[]>();
    const externalRangeKm = this.uplinkReferenceRangeKm();

    const accept = (signal: RfSignal, isoPowerDbm: number): void => {
      const transponder = this.findTransponderByUplinkFrequency(signal.frequency, signal.polarization);
      if (!transponder?.isActive) {
        return;
      }
      const list = byTransponder.get(transponder) ?? [];
      list.push({ signal, isoPowerDbm });
      byTransponder.set(transponder, list);
    };
    // Every arrival is its own carrier (phase 27, DEV-XPDR-07 closed): two
    // stations radiating one carrier at once (a sloppy handover with both at
    // full power) put two copies on one frequency, and each is the other's
    // co-channel interference. A correct handover is break-before-make
    // (TrafficControlManager.executeHandover), so the pair never overlaps.
    // A repeated id gets a suffix so the receiver counts the copy as I. The
    // strongest arrival keeps the bare id and only the weaker copies are
    // suffixed, strongest first, counting only arrivals a transponder takes:
    // another station's sidelobe copy never renames the main carrier, so the
    // modem locked on it does not see a new carrier (Phase 32 D3, nats-r7-s04-F2)
    const copies = new Map<string, number[]>();
    this.rxSignal.forEach((signal, index) => {
      if (!this.findTransponderByUplinkFrequency(signal.frequency, signal.polarization)?.isActive) return;
      copies.set(signal.signalId, [...(copies.get(signal.signalId) ?? []), index]);
    });
    const copyIds = new Map<number, string>();
    for (const [signalId, indices] of copies) {
      // Stable sort: equal powers keep arrival order
      const ranked = [...indices].sort((a, b) => (this.rxSignal[b].power as number) - (this.rxSignal[a].power as number));
      ranked.forEach((index, rank) => {
        if (rank > 0) copyIds.set(index, `${signalId}#${rank + 1}`);
      });
    }
    this.rxSignal.forEach((signal, index) => {
      const copyId = copyIds.get(index);
      accept(copyId ? { ...signal, signalId: copyId } : signal, signal.power);
    });
    for (const signal of this.externalSignal) {
      accept(signal, (signal.power as number) - freeSpaceLossDb(signal.frequency as number, externalRangeKm));
    }

    this.operatingPoints_.clear();
    for (const [transponder, inputs] of byTransponder) {
      const point = operateTransponder(
        transponder.physics,
        inputs.map(({ signal, isoPowerDbm }) => ({ signalId: signal.signalId, isoPowerDbm, bandwidthHz: signal.bandwidth as number })),
        transponder.uplinkFrequency as number,
        transponder.bandwidth as number
      );
      this.operatingPoints_.set(transponder.id, point);

      inputs.forEach(({ signal }, i) => {
        const relayed = point.carriers[i];
        // Under the uplink noise by more than 10 dB in its own bandwidth: not
        // a carrier anyone downstream can see (it still loaded the transponder)
        if (relayed.cn0UpDbHz - 10 * Math.log10(Math.max(1, signal.bandwidth as number)) < Satellite.RELAY_FLOOR_CN_DB) {
          return;
        }

        const txSignal: RfSignal = {
          ...signal,
          frequency: (signal.frequency - transponder.frequencyOffset) as RfFrequency,
          power: relayed.eirpDbm as dBm,
          upstreamCn0DbHz: relayed.upstreamCn0DbHz,
          origin: SignalOrigin.SATELLITE_TX,
          // A downlink leaves the satellite's antenna at the satellite's own
          // polarization angle, like its beacon (phase 19.4: relayed carriers
          // used to arrive at 0 deg whatever the skew)
          rotation: this.rotation,
          // Reverse linear polarization for downlink; circular polarization is
          // set by the transponder's own antenna and passes through unchanged
          // (an RHCP uplink must not come back as 'H' - Campaign 3 S8)
          polarization: signal.polarization === 'H' ? 'V' : signal.polarization === 'V' ? 'H' : signal.polarization,
        };

        processedSignals.push(this.applyDegradationEffects(txSignal));
      });
    }

    // Add beacon signals if transponder has beacon frequency
    for (const tp of this.transponders) {
      if (tp.beacon) {
        const beaconSignal: RfSignal = {
          ...tp.beacon,
          // Use original signalId if provided, otherwise generate one
          signalId: tp.beacon.signalId || `beacon-${tp.id}`,
          noradId: this.noradId,
          rotation: this.rotation,
          origin: SignalOrigin.SATELLITE_TX,
          isDegraded: false,
          noiseFloor: null,
          gainInPath: 0 as dBi,
        };

        processedSignals.push(beaconSignal);
      }
    }

    return processedSignals;
  }

  /** A relayed carrier below this C/N in its own bandwidth at the transponder input is not relayed, dB */
  static readonly RELAY_FLOOR_CN_DB = -10;

  /**
   * Range (km) over which authored third-party uplinks and injected
   * interference reach this satellite: the slant range from its reference
   * station (a legacy GEO satellite's authored elevation is that station's;
   * an orbital satellite's propagated range from its configured observer).
   * The uplinker's own site is not modelled (DEV-XPDR-06).
   */
  uplinkReferenceRangeKm(): number {
    return this.rangeKm ?? geoSlantRangeKm(this.el as number);
  }

  /** The transponder's operating point from the last update (IBO, OBO, C/IM, per-carrier C/N0), or null when nothing is in its passband */
  operatingPoint(transponderId: string): TransponderOperatingPoint | null {
    return this.operatingPoints_.get(transponderId) ?? null;
  }

  /** The transponder whose uplink passband (and polarization) takes a carrier, if any */
  transponderFor(frequency: RfFrequency, polarization: RfSignal['polarization']): Transponder | undefined {
    return this.findTransponderByUplinkFrequency(frequency, polarization);
  }

  /**
   * Find a transponder that can process the given signal.
   * Matches based on:
   * 1. Signal frequency falling within transponder's passband (uplinkLowEdge to uplinkHighEdge)
   * 2. Signal polarization matching transponder's polarization
   */
  private findTransponderByUplinkFrequency(frequency: RfFrequency, polarization: 'H' | 'V' | 'LHCP' | 'RHCP' | null): Transponder | undefined {
    return this.transponders.find((tp) => {
      // Check if frequency falls within passband
      const inPassband = frequency >= tp.uplinkLowEdge && frequency <= tp.uplinkHighEdge;
      if (!inPassband) return false;

      // Check polarization match (null signal polarization matches anything)
      if (polarization === null) return true;
      return tp.polarization === polarization;
    });
  }

  /**
   * Apply various degradation effects to the transmitted signal.
   * Optimized to minimize object allocations by mutating power in-place.
   */
  private applyDegradationEffects(signal: RfSignal): RfSignal {
    // Early exit if all degradation effects are disabled
    if (!this.degradationConfig.powerVariation && !this.degradationConfig.atmosphericEffects && !this.degradationConfig.interference && this.health >= 1.0) {
      return signal;
    }

    // Single object copy at the start
    const degradedSignal = { ...signal };
    let power = degradedSignal.power;

    // Mutate power in place instead of creating new objects at each step
    if (this.degradationConfig.powerVariation) {
      power = this.applyPowerVariation_inPlace(degradedSignal.signalId, power);
    }

    if (this.degradationConfig.interference) {
      power = this.applyInterference_inPlace(power);
      degradedSignal.isDegraded = true;
    }

    // Health degradation
    const healthLossDeb = (1 - this.health) * 10;
    power = (power - healthLossDeb) as dBm;
    if (this.health < 0.9 || degradedSignal.isDegraded) {
      degradedSignal.isDegraded = true;
    }

    degradedSignal.power = power;
    return degradedSignal;
  }

  /**
   * Apply smooth power variations using Perlin noise (in-place optimization).
   * @param signalId - The signal identifier
   * @param currentPower - Current power level in dBm
   * @returns Updated power level in dBm
   */
  private applyPowerVariation_inPlace(signalId: string, currentPower: dBm): dBm {
    // One generator per (run seed, signal); rebuilt when a scenario load re-seeds
    const noiseSeed = `${Rng.getSeed()}:${this.noradId}:${signalId}`;
    let noiseGen = this.noiseGenerators.get(signalId);
    if (noiseGen?.seed !== noiseSeed) {
      noiseGen = new PerlinNoise(noiseSeed);
      this.noiseGenerators.set(signalId, noiseGen);
    }

    // Slow fading on run time (a physical process, not a scheduled one), with a
    // per-signal phase so carriers do not fade together. One noise unit per
    // FADE_TIME_SCALE_MS: tens of seconds, the way GEO scintillation moves, not
    // the per-second wobble that flapped a near-threshold lock (Phase 30 D10)
    const phase = Rng.hashUniform(noiseSeed) * 1000;
    const time = SimClock.runMs() / Satellite.FADE_TIME_SCALE_MS + phase;

    // Perlin output is zero-mean within about +/-0.5 on one axis: scale it to
    // +/-1 (Phase 19.2 removed the old `* 2 - 1`, a -1 dB bias on every
    // relayed downlink, DEV-NOISE-05)
    const noiseValue = noiseGen.get(time) * 2;

    // Apply variation
    const variation = noiseValue * this.degradationConfig.powerVariationRange;

    return (currentPower + variation) as dBm;
  }

  /**
   * Apply interference to the signal (in-place optimization).
   * @param currentPower - Current power level in dBm
   * @returns Updated power level in dBm
   */
  private applyInterference_inPlace(currentPower: dBm): dBm {
    // Calculate C/I (Carrier-to-Interference ratio)
    const carrierPowerLinear = 10 ** (currentPower / 10);
    const interferencePowerLinear = 10 ** (this.degradationConfig.interferencePower / 10);
    const totalPowerLinear = carrierPowerLinear + interferencePowerLinear;

    return (10 * Math.log10(totalPowerLinear)) as dBm;
  }

  /**
   * Update satellite health based on environmental conditions.
   */
  private updateHealth(): void {
    // Gradual health degradation simulation
    // In a real scenario, this could be based on radiation damage, component failures, etc.
    if (this.rng_.chance(0.0001)) {
      this.health = Math.max(0.5, this.health - 0.01);
    }

    // Gradual recovery
    if (this.health < 1.0 && this.rng_.chance(0.001)) {
      this.health = Math.min(1.0, this.health + 0.01);
    }
  }

  /**
   * Check if a signal should be dropped (simulates complete signal loss).
   */
  shouldDropSignal(): boolean {
    if (!this.degradationConfig.randomDropout) {
      return false;
    }

    return this.rng_.chance(this.degradationConfig.dropoutProbability);
  }

  /**
   * Get transmitted signals with dropout simulation applied.
   */
  getTransmittedSignals(): RfSignal[] {
    return this.txSignal.filter(() => !this.shouldDropSignal());
  }

  /**
   * Calculate frequency offset for uplink to downlink conversion.
   */
  getUplinkFromDownlink(frequency: RfFrequency): RfFrequency {
    return (frequency + this.frequencyOffset) as RfFrequency;
  }

  // === Ephemeris Error Methods ===

  /**
   * Get predicted azimuth (true position + ephemeris error).
   * This is what program-track calculates from TLE data.
   * The beacon signal comes from the true position (this.az), but the antenna
   * points to the predicted position.
   */
  get predictedAz(): Degrees {
    return ((this.az as number) + (this.ephemerisErrorAz as number)) as Degrees;
  }

  /**
   * Get predicted elevation (true position + ephemeris error).
   * This is what program-track calculates from TLE data.
   */
  get predictedEl(): Degrees {
    return ((this.el as number) + (this.ephemerisErrorEl as number)) as Degrees;
  }

  /**
   * Look-angle and skew offsets of this satellite at `site` relative to its
   * reference station: zero at the reference, the geometric difference
   * between the sites elsewhere. Null when the satellite has no reference
   * (one az/el for every station, legacy).
   */
  stationOffsets(site: GeoSite): StationLookOffsets | null {
    if (!this.lookAnglesFrom || this.slotLongitudeDeg === null) {
      return null;
    }
    const key = `${site.latitude},${site.longitude},${site.elevationM ?? 0}`;
    let offsets = this.stationOffsets_.get(key);
    if (!offsets) {
      const ref = geoLookAngles(this.lookAnglesFrom, this.slotLongitudeDeg);
      const here = geoLookAngles(site, this.slotLongitudeDeg);
      let dAz = here.az - ref.az;
      if (dAz > 180) dAz -= 360;
      if (dAz < -180) dAz += 360;
      offsets = {
        dAz,
        dEl: here.el - ref.el,
        dRotation: geoPolarizationSkewDeg(site, this.slotLongitudeDeg) - geoPolarizationSkewDeg(this.lookAnglesFrom, this.slotLongitudeDeg),
      };
      this.stationOffsets_.set(key, offsets);
    }
    return offsets;
  }

  /**
   * Update ephemeris error (simulates TLE aging or refresh).
   * @param azError - New azimuth error in degrees
   * @param elError - New elevation error in degrees
   */
  setEphemerisError(azError: Degrees, elError: Degrees): void {
    this.ephemerisErrorAz = azError;
    this.ephemerisErrorEl = elError;
  }

  private getDownlinkFromUplink(frequency: RfFrequency): RfFrequency {
    return (frequency - this.frequencyOffset) as RfFrequency;
  }

  /**
   * Set transponder active state.
   */
  setTransponderActive(transponderId: string, active: boolean): void {
    const transponder = this.transponders.find((tp) => tp.id === transponderId);
    if (transponder) {
      transponder.isActive = active;
    }
  }

  /**
   * Configure signal degradation parameters.
   */
  configureDegradation(config: Partial<SignalDegradationConfig>): void {
    this.degradationConfig = {
      ...this.degradationConfig,
      ...config,
    };
  }
}
