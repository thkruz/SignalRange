import { TapPoint } from '@app/equipment/rf-front-end/coupler-module/tap-points';
import { RFFrontEndCore } from '@app/equipment/rf-front-end/rf-front-end-core';
import { dB, dBm, Hertz, RfSignal } from '@app/types';
import { thermalNoiseDbm } from './noise-model';

/**
 * Manages signal path calculations including cumulative noise floor and gain.
 *
 * @example Usage in RealTimeSpectrumAnalyzer.getInputSignals()
 * ```typescript
 * // BEFORE: Manual noise floor calculation
 * for (const tapPoint of [tapPointA, tapPointB]) {
 *   let tapPointnoiseFloor: number;
 *   let isSkipLnaGainDuringDraw = true;
 *
 *   switch (tapPoint) {
 *     case TapPoint.POST_OMT_PRE_LNA_RX_RF:
 *       tapPointnoiseFloor = this.rfFrontEnd_.lnbModule.getNoiseFloor(bandwidth);
 *       isSkipLnaGainDuringDraw = false;
 *       break;
 *     // ... many more cases
 *   }
 *
 *   if (tapPointnoiseFloor > this.state.noiseFloorNoGain) {
 *     this.state.noiseFloorNoGain = tapPointnoiseFloor;
 *     this.state.isSkipLnaGainDuringDraw = isSkipLnaGainDuringDraw;
 *   }
 * }
 *
 * // AFTER: Using SignalPathManager
 * const signalPathMgr = new SignalPathManager(this.rfFrontEnd_);
 * const bandwidth = Math.max(this.state.rbw, this.state.span) as Hertz;
 *
 * for (const tapPoint of [tapPointA, tapPointB]) {
 *   const { noiseFloorNoGain, shouldApplyGain } = signalPathMgr.getNoiseFloorAt(tapPoint, bandwidth);
 *
 *   if (noiseFloorNoGain > this.state.noiseFloorNoGain) {
 *     this.state.noiseFloorNoGain = noiseFloorNoGain;
 *     this.state.isSkipLnaGainDuringDraw = !shouldApplyGain;
 *   }
 * }
 * ```
 *
 * @example Usage in SpectralDensityPlot.createNoise()
 * ```typescript
 * // BEFORE: Using state properties
 * let base = this.specA.state.noiseFloorNoGain;
 * // ... generate noise
 * if (!this.specA.state.isSkipLnaGainDuringDraw) {
 *   noise += this.specA.rfFrontEnd_.getTotalRxGain();
 * }
 *
 * // AFTER: Using SignalPathManager (alternative approach)
 * const signalPathMgr = new SignalPathManager(this.specA.rfFrontEnd_);
 * const tapPoint = this.specA.rfFrontEnd_.couplerModule.state.tapPointA;
 * const { noiseFloorNoGain, shouldApplyGain } = signalPathMgr.getNoiseFloorAt(tapPoint, bandwidth);
 * const totalGain = signalPathMgr.getTotalGainTo(tapPoint);
 *
 * let noise = noiseFloorNoGain + (Math.random() - 0.5) * 2;
 * if (shouldApplyGain) {
 *   noise += totalGain;
 * }
 * ```
 */
export class SignalPathManager {
  constructor(private readonly rfFrontEnd_: RFFrontEndCore) {
    // No-op
  }

  /** Signals at the point they leave the antenna for the OMT */
  get antennaRxSignals(): RfSignal[] {
    return this.rfFrontEnd_.antenna?.state.rxSignalsIn ?? [];
  }

  getAntennaNoise(frequency: Hertz, bandwidth: Hertz): number {
    return this.rfFrontEnd_.antenna?.antennaNoiseFloor(frequency, bandwidth) ?? Number.NEGATIVE_INFINITY;
  }

  /**
   * System noise temperature at the LNA input, K (Phase 19.2): sky, rain,
   * spillover and sun through the feed, plus the LNB. Every receive-side noise
   * figure in the engine (modem and beacon C/N, analyzer floor, AGC detector)
   * is k·T·B of this one number. Without an antenna (bench tests) it is the
   * LNB's own temperature.
   */
  systemNoiseK(): number {
    const antenna = this.rfFrontEnd_.antenna;
    if (antenna) {
      return antenna.systemNoise().systemK;
    }

    return this.rfFrontEnd_.lnbModule.state.noiseTemperature;
  }

  /** Antenna noise alone (no LNB) referred to the LNA input, K */
  antennaNoiseAtLnaK(): number {
    return this.rfFrontEnd_.antenna?.systemNoise().antennaAtLnaK ?? 0;
  }

  /** Signals at the point they exit the OMT */
  get omtRxSignals(): RfSignal[] {
    const rxSignals = this.rfFrontEnd_.omtModule.rxSignalsOut;
    return rxSignals ?? [];
  }

  /** Signal loss (dB) caused by the OMT */
  get omtInsertionLoss_dB(): dB {
    return this.rfFrontEnd_.omtModule.state.insertionLoss;
  }

  /** Signals at the point they exit they exit the LNA */
  get lnaRxSignals(): RfSignal[] {
    const rxSignals = this.rfFrontEnd_.lnbModule.postLNASignals;
    return rxSignals ?? [];
  }

  get lnaGain(): dB {
    return this.rfFrontEnd_.lnbModule.state.gain;
  }

  /** Signals at the point they exit the LNB */
  get lnbRxSignals(): RfSignal[] {
    const rxSignals = this.rfFrontEnd_.lnbModule.ifSignals;
    return rxSignals ?? [];
  }

  get lnbInsertionLoss(): dB {
    return 1.0 as dB; // Assume 1 dB insertion loss for LNB
  }

  /** AGC gain (can be positive or negative, 0 if bypassed) */
  get agcGain(): dB {
    if (this.rfFrontEnd_.agcModule.state.isBypassed) {
      return 0 as dB;
    }
    return this.rfFrontEnd_.agcModule.state.currentGain;
  }

  /** Signals at the point they exit the IF Filter */
  get ifFilterRxSignals(): RfSignal[] {
    const rxSignals = this.rfFrontEnd_.filterModule.outputSignals;
    return rxSignals ?? [];
  }

  /**
   * Get total RX gain from LNA + AGC minus IF filter insertion loss.
   * This is the aggregated gain through the RX chain (LNA + AGC + Filter).
   */
  getTotalRxGain(): dB {
    return (this.rfFrontEnd_.state.lnb.gain + this.agcGain - this.rfFrontEnd_.state.filter.insertionLoss) as dB;
  }

  /**
   * Receive noise in the IF filter's bandwidth at the IF (dBm, gain applied):
   * the carrier-presence gate (a carrier below the noise in the passband is
   * not there to demodulate) and the AGC detector's noise term.
   */
  getExternalNoise(): dBm {
    const filterBwHz = this.rfFrontEnd_.filterModule.state.bandwidth * 1e6;

    return (thermalNoiseDbm(this.systemNoiseK(), filterBwHz) + this.getTotalRxGain()) as dBm;
  }

  /**
   * Noise floor for the RX IF over the IF filter bandwidth, referred to the
   * LNA input (no gain). Kept for callers of the old external/internal split;
   * the analyzer's own noise is handled by the analyzer (instrument NF).
   */
  getNoiseFloorIfRx(): { isInternalNoiseGreater: boolean; noiseFloor: dBm } {
    const filterBwHz = this.rfFrontEnd_.filterModule.state.bandwidth * 1e6;

    return { isInternalNoiseGreater: false, noiseFloor: thermalNoiseDbm(this.systemNoiseK(), filterBwHz) as dBm };
  }

  /**
   * The line noise at a tap point over `bandwidth`, WITHOUT the gain up to
   * that tap (add `getTotalGainTo(tapPoint)` to place it at the tap). This is
   * the noise physically on the line; the spectrum analyzer adds its own
   * instrument noise (noise figure, coupling factor) on top.
   *
   * RX taps are k·T·B with T from the noise model, referred to the LNA input
   * (the plane carrier powers are referred to): before the LNA only the
   * antenna's share, from the LNA on the full system temperature.
   *
   * @returns noiseFloorNoGain in dBm and whether gain must be added to place it at the tap
   */
  getNoiseFloorAt(
    tapPoint: TapPoint,
    bandwidth: Hertz
  ): {
    noiseFloorNoGain: dBm;
    shouldApplyGain: boolean;
  } {
    switch (tapPoint) {
      case TapPoint.RX_RF_PRE_OMT:
      case TapPoint.RX_RF_POST_OMT:
        return { noiseFloorNoGain: thermalNoiseDbm(this.antennaNoiseAtLnaK(), bandwidth) as dBm, shouldApplyGain: true };

      case TapPoint.RX_RF_POST_LNA:
        return { noiseFloorNoGain: thermalNoiseDbm(this.systemNoiseK(), bandwidth) as dBm, shouldApplyGain: true };

      case TapPoint.RX_IF: {
        if (this.rfFrontEnd_.filterModule.state.isPowered === false) {
          return { noiseFloorNoGain: Number.NEGATIVE_INFINITY as dBm, shouldApplyGain: true };
        }

        return { noiseFloorNoGain: thermalNoiseDbm(this.systemNoiseK(), bandwidth) as dBm, shouldApplyGain: true };
      }

      // TX path: the transmit chain's noise is not modelled yet (19.6); a
      // 290 K floor amplified by the chain stands in for it
      case TapPoint.TX_IF:
      case TapPoint.TX_RF_POST_BUC:
      case TapPoint.TX_RF_POST_HPA:
      case TapPoint.TX_RF_POST_OMT:
      default:
        return { noiseFloorNoGain: thermalNoiseDbm(290, bandwidth) as dBm, shouldApplyGain: true };
    }
  }

  /**
   * Get the total cumulative gain from the start of the RX chain to a specific tap point.
   * This includes both gains (LNA) and losses (OMT, IF filter insertion loss).
   *
   * @param tapPoint - The tap point location in the signal chain
   * @returns Total gain in dB (negative values indicate net loss)
   */
  getTotalGainTo(tapPoint: TapPoint): dB {
    switch (tapPoint) {
      case TapPoint.RX_RF_PRE_OMT: {
        if (!this.rfFrontEnd_.antenna.state.isPowered) {
          return Number.NEGATIVE_INFINITY as dB; // No signal if antenna is unpowered
        }
        // At antenna output - no components yet
        return 0 as dB;
      }

      case TapPoint.RX_RF_POST_OMT: {
        if (!this.rfFrontEnd_.antenna.state.isPowered || !this.rfFrontEnd_.omtModule.state.isPowered) {
          return Number.NEGATIVE_INFINITY as dB; // No signal if antenna or OMT is unpowered
        }
        // The OMT's insertion loss is not applied to carriers (DEV-RF-05), so
        // the noise does not pay it either: one reference plane
        return 0 as dB;
      }

      case TapPoint.RX_RF_POST_LNA: {
        if (!this.rfFrontEnd_.antenna.state.isPowered || !this.rfFrontEnd_.omtModule.state.isPowered || !this.rfFrontEnd_.lnbModule.state.isPowered) {
          return Number.NEGATIVE_INFINITY as dB; // No signal if any component is unpowered
        }
        // LNA gain (OMT insertion loss not applied, see RX_RF_POST_OMT)
        return this.lnaGain;
      }

      case TapPoint.RX_IF: {
        if (
          !this.rfFrontEnd_.antenna.state.isPowered ||
          !this.rfFrontEnd_.omtModule.state.isPowered ||
          !this.rfFrontEnd_.lnbModule.state.isPowered ||
          !this.rfFrontEnd_.filterModule.state.isPowered
        ) {
          return Number.NEGATIVE_INFINITY as dB; // No signal if any component is unpowered
        }
        // Full RX chain: LNA gain + AGC - IF filter insertion loss, the same
        // gain the carriers at the AGC output carry
        return this.getTotalRxGain();
      }

      // TX path tap points
      case TapPoint.TX_RF_POST_BUC:
        return this.rfFrontEnd_.bucModule.state.gain;
      case TapPoint.TX_RF_POST_HPA:
        return (this.rfFrontEnd_.bucModule.state.gain + this.rfFrontEnd_.hpaModule.state.gain) as dB;
      case TapPoint.TX_RF_POST_OMT:
        return (this.rfFrontEnd_.bucModule.state.gain + this.rfFrontEnd_.hpaModule.state.gain - this.rfFrontEnd_.omtModule.state.insertionLoss) as dB;
      case TapPoint.TX_IF:
      default: {
        // For TX path or unknown, return 0 dB
        return 0 as dB;
      }
    }
  }
}
