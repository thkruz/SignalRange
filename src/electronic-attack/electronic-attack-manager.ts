/**
 * @file ElectronicAttackManager - Player-driven SATCOM denial (Campaign 4)
 * @description The offensive counterpart of InterferenceManager. Where that
 * class injects a *scripted* uplink interferer on a duty cycle, this one reads
 * the operator's *live* jam chain each tick and, when they are radiating a jam
 * waveform in the target transponder's uplink band while trained on the target,
 * injects a matching interferer into the target satellite's externalSignal. The
 * real transponder then relays it to the co-frequency victim downlink, so the
 * victim's C/I degrades through the existing signal model (observable on a
 * monitor receiver) - denial emerges from the physics rather than a script.
 *
 * It also computes a deterministic J/S assessment used by the EA Assessment tab
 * and the jamming-uplink-active / jamming-effective objective conditions, and
 * enforces own-force deconfliction: radiating over a protected friendly band is
 * an instant mission fail (fratricide), mirroring the HPA / dual-transmission
 * RF-safety invariants.
 *
 * Started only when settings.electronicAttack is present, so Campaigns 1-3/5
 * never instantiate it.
 */

import { EventBus } from '@app/events/event-bus';
import { Events, ProtectedFreqViolationData } from '@app/events/events';
import { ScenarioManager } from '@app/scenario-manager';
import { SignalOrigin } from '@app/signal-origin';
import { SimulationManager } from '@app/simulation/simulation-manager';
import type { dBi, dBm, FECType, Hertz, ModulationType, RfFrequency, RfSignal } from '@app/types';

/** Electronic-attack configuration (settings.electronicAttack) */
export interface ElectronicAttackConfig {
  groundStationId: string;
  targetNoradId: number;
  jamAntennaIndex?: number;
  victimCarrierPowerDbm: number;
  targetUplinkLowHz: number;
  targetUplinkHighHz: number;
  targetPolarization: 'H' | 'V';
  jamPathGainDb: number;
  pointingToleranceDeg?: number;
  effectiveJtoSDb?: number;
}

/** A single radiating RF output of the jam chain (subset of RfSignal we read) */
export interface JamOutput {
  frequency: number;
  bandwidth: number;
  power: number;
}

/** Antenna pointing state the assessment reads */
export interface JamAntennaState {
  isPowered: boolean;
  azimuthDeg: number;
  elevationDeg: number;
}

/** Result of assessing the current jam picture against the target */
export interface EaAssessment {
  /** A jam waveform above the radiating floor is present in the target uplink band */
  isRadiatingInBand: boolean;
  /** The jam antenna is powered and trained on the target within tolerance */
  isOnTarget: boolean;
  /** Strongest in-band jam power referred to the transponder input, dBm (null when not radiating) */
  jamPowerDbm: number | null;
  /** Victim service carrier power at the transponder input, dBm */
  victimPowerDbm: number;
  /** Jam-to-signal ratio, dB (null when not radiating) */
  jToSDb: number | null;
  /** Pointing error of the jam antenna vs the target, deg (null when target/antenna unknown) */
  pointingErrorDeg: number | null;
  /** Denial achieved: radiating in band + on target + J/S >= threshold */
  isEffective: boolean;
  /** The in-band jam waveform being relayed (for injection), if any */
  activeJam: JamOutput | null;
}

/** Shortest angular separation between two azimuths, degrees (handles wrap) */
function azimuthDiffDeg(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;

  return d > 180 ? 360 - d : d;
}

/** Whether a signal's spectrum overlaps a [low, high] band, Hz */
function overlapsBand(freq: number, bandwidth: number, low: number, high: number): boolean {
  const sigLow = freq - bandwidth / 2;
  const sigHigh = freq + bandwidth / 2;

  return sigHigh >= low && sigLow <= high;
}

export class ElectronicAttackManager {
  private static instance_: ElectronicAttackManager | null = null;

  /**
   * Output floor (dBm) above which a jam-chain signal counts as "radiating".
   * A keyed-up chain outputs tens of dBm; an idle/disabled HPA sits far below
   * this, so enabling the HPA and transmitting are what cross the threshold.
   */
  private static readonly RADIATING_FLOOR_DBM = -50;

  private static readonly INTERFERER_SIGNAL_PREFIX = 'EA-JAM-';

  private readonly config_: ElectronicAttackConfig | null;
  private readonly boundUpdateHandler_: () => void;
  private assessment_: EaAssessment | null = null;
  private injectedSignalId_: string | null = null;
  private deconflictionViolationEmitted_ = false;

  private constructor() {
    this.config_ = (ScenarioManager.getInstance().settings.electronicAttack as ElectronicAttackConfig | undefined) ?? null;
    this.boundUpdateHandler_ = this.update_.bind(this);
    EventBus.getInstance().on(Events.UPDATE, this.boundUpdateHandler_);
  }

  static getInstance(): ElectronicAttackManager {
    this.instance_ ??= new ElectronicAttackManager();

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

  /** Latest assessment (null before the first tick or without config) */
  getAssessment(): EaAssessment | null {
    return this.assessment_;
  }

  getConfig(): ElectronicAttackConfig | null {
    return this.config_;
  }

  /**
   * Pure assessment of the jam picture. Extracted from the tick so it can be
   * unit-tested without singletons or the simulation. `target` is null when the
   * target satellite is not in the scenario (assessment is then "not on target").
   */
  static assess(
    jamOutputs: JamOutput[],
    antenna: JamAntennaState | null,
    target: { azimuthDeg: number; elevationDeg: number } | null,
    config: ElectronicAttackConfig,
  ): EaAssessment {
    const floor = ElectronicAttackManager.RADIATING_FLOOR_DBM;
    const inBand = jamOutputs.filter(
      (s) => s.power > floor && overlapsBand(s.frequency, s.bandwidth, config.targetUplinkLowHz, config.targetUplinkHighHz),
    );

    // Strongest in-band jam waveform drives the effect
    const strongest = inBand.reduce<JamOutput | null>(
      (best, s) => (best === null || s.power > best.power ? s : best),
      null,
    );
    const isRadiatingInBand = strongest !== null;
    const jamPowerDbm = strongest !== null ? strongest.power + config.jamPathGainDb : null;

    let pointingErrorDeg: number | null = null;
    let isOnTarget = false;
    if (antenna && target) {
      const azErr = azimuthDiffDeg(antenna.azimuthDeg, target.azimuthDeg);
      const elErr = Math.abs(antenna.elevationDeg - target.elevationDeg);
      pointingErrorDeg = Math.hypot(azErr, elErr);
      isOnTarget = antenna.isPowered && pointingErrorDeg <= (config.pointingToleranceDeg ?? 5);
    }

    const jToSDb = jamPowerDbm !== null ? jamPowerDbm - config.victimCarrierPowerDbm : null;
    const isEffective =
      isRadiatingInBand && isOnTarget && jToSDb !== null && jToSDb >= (config.effectiveJtoSDb ?? 6);

    return {
      isRadiatingInBand,
      isOnTarget,
      jamPowerDbm,
      victimPowerDbm: config.victimCarrierPowerDbm,
      jToSDb,
      pointingErrorDeg,
      isEffective,
      activeJam: strongest,
    };
  }

  private update_(): void {
    const config = this.config_;
    if (!config) {
      return;
    }

    const sim = SimulationManager.getInstance();
    const gs = sim.groundStations.find((g) => g.state.id === config.groundStationId);
    const target = sim.satellites.find((s) => s.noradId === config.targetNoradId);

    const jamIdx = config.jamAntennaIndex ?? 0;
    const rf = gs?.rfFrontEnds[jamIdx] ?? null;
    const antenna = gs?.antennas[jamIdx] ?? null;

    const jamOutputs: JamOutput[] = (rf?.hpaModule.outputSignals ?? []).map((s) => ({
      frequency: s.frequency,
      bandwidth: s.bandwidth,
      power: s.power,
    }));

    // Own-force deconfliction: any radiating waveform overlapping a protected
    // friendly band is fratricide - instant mission fail (once).
    this.checkDeconfliction_(config.groundStationId, jamOutputs);

    const antennaState: JamAntennaState | null = antenna
      ? {
          isPowered: antenna.state.isPowered,
          azimuthDeg: antenna.state.azimuth as unknown as number,
          elevationDeg: antenna.state.elevation as unknown as number,
        }
      : null;
    const targetPointing = target
      ? { azimuthDeg: target.az as unknown as number, elevationDeg: target.el as unknown as number }
      : null;

    const assessment = ElectronicAttackManager.assess(jamOutputs, antennaState, targetPointing, config);
    this.assessment_ = assessment;

    // Relay the jam through the target transponder so the victim downlink C/I
    // degrades via the existing signal model. Only when it would actually reach
    // the transponder: radiating in band AND the antenna is on the target.
    if (target && assessment.isRadiatingInBand && assessment.isOnTarget && assessment.activeJam && assessment.jamPowerDbm !== null) {
      const signalId = `${ElectronicAttackManager.INTERFERER_SIGNAL_PREFIX}${config.targetNoradId}`;
      const jamSignal: RfSignal = {
        signalId,
        serverId: 1,
        noradId: config.targetNoradId,
        frequency: assessment.activeJam.frequency as RfFrequency,
        polarization: config.targetPolarization,
        power: assessment.jamPowerDbm as dBm,
        bandwidth: assessment.activeJam.bandwidth as Hertz,
        modulation: 'null' as ModulationType,
        fec: 'null' as FECType,
        feed: '',
        isDegraded: false,
        origin: SignalOrigin.SATELLITE_RX,
        noiseFloor: null,
        gainInPath: 0 as dBi,
      };
      // Replace any prior injection so freq/power track the live jam
      target.externalSignal = target.externalSignal.filter((s) => s.signalId !== signalId);
      target.externalSignal.push(jamSignal);
      this.injectedSignalId_ = signalId;
    } else if (this.injectedSignalId_ && target) {
      target.externalSignal = target.externalSignal.filter((s) => s.signalId !== this.injectedSignalId_);
      this.injectedSignalId_ = null;
    }
  }

  private checkDeconfliction_(groundStationId: string, jamOutputs: JamOutput[]): void {
    if (this.deconflictionViolationEmitted_) {
      return;
    }
    const protectedBands = ScenarioManager.getInstance().settings.protectedFrequencies ?? [];
    if (protectedBands.length === 0) {
      return;
    }

    for (const jam of jamOutputs) {
      if (jam.power <= ElectronicAttackManager.RADIATING_FLOOR_DBM) {
        continue;
      }
      const hit = protectedBands.find((band) => overlapsBand(jam.frequency, jam.bandwidth, band.minHz, band.maxHz));
      if (hit) {
        this.deconflictionViolationEmitted_ = true;
        const data: ProtectedFreqViolationData = {
          groundStationId,
          protectedBandLabel: hit.label,
          jamFrequencyHz: jam.frequency,
          detectedAt: Date.now(),
        };
        EventBus.getInstance().emit(Events.PROTECTED_FREQ_VIOLATION, data);

        return;
      }
    }
  }
}
