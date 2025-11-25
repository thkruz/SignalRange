import { TapPoint } from "@app/equipment/rf-front-end/coupler-module/coupler-module";
import { RFFrontEnd } from "@app/equipment/rf-front-end/rf-front-end";
import { dB, dBm, Hertz, RfSignal } from "@app/types";

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
  constructor(
    private readonly rfFrontEnd_: RFFrontEnd
  ) {
    // No-op
  }

  /** Signals at the point they leave the antenna for the OMT */
  get antennaRxSignals(): RfSignal[] {
    return this.rfFrontEnd_.antenna?.state.rxSignalsIn ?? [];
  }

  getAntennaNoise(frequency: Hertz, bandwidth: Hertz): number {
    return this.rfFrontEnd_.antenna.antennaNoiseFloor(frequency, bandwidth);
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


  /** Signals at the point they exit the IF Filter */
  get ifFilterRxSignals(): RfSignal[] {
    const rxSignals = this.rfFrontEnd_.filterModule.outputSignals;
    return rxSignals ?? [];
  }

  /**
   * Get total RX gain from LNA minus IF filter insertion loss.
   * This is the aggregated gain through the RX chain (LNA + Filter).
   */
  getTotalRxGain(): dB {
    return (this.rfFrontEnd_.state.lnb.gain - this.rfFrontEnd_.state.filter.insertionLoss) as dB;
  }

  /**
   * Get external noise floor at the spectrum analyzer input (RX_IF tap point).
   * This combines the filter noise floor with the total RX gain.
   */
  getExternalNoise(): dBm {
    return (this.rfFrontEnd_.filterModule.state.noiseFloor + this.getTotalRxGain()) as dBm;
  }

  /**
   * Get noise floor for RX IF tap point, comparing external vs internal noise.
   * This logic determines which noise source dominates at the spectrum analyzer.
   */
  getNoiseFloorIfRx(): { isInternalNoiseGreater: boolean; noiseFloor: dBm } {
    const NF = 0.5; // Spectrum analyzer noise figure
    const externalNoiseFloor = this.rfFrontEnd_.filterModule.state.noiseFloor + this.getTotalRxGain();
    const internalNoiseFloor = -174 + 10 * Math.log10(this.rfFrontEnd_.filterModule.state.bandwidth * 1e6) + NF;
    const isInternalNoiseGreater = internalNoiseFloor > externalNoiseFloor;

    return {
      isInternalNoiseGreater: isInternalNoiseGreater,
      noiseFloor: (isInternalNoiseGreater ? internalNoiseFloor : (externalNoiseFloor - this.getTotalRxGain())) as dBm
    };
  }

  /**
   * Get the noise floor at a specific tap point WITHOUT gain corrections applied.
   * This uses the Friis cascade formula to calculate cumulative noise through the RX chain.
   *
   * The caller is responsible for deciding whether to apply gain based on the returned flag.
   *
   * @param tapPoint - The tap point location in the signal chain
   * @param bandwidth - The noise bandwidth in Hz
   * @returns Object containing:
   *   - noiseFloorNoGain: Noise floor in dBm WITHOUT gain applied
   *   - shouldApplyGain: Whether gain should be added during visualization
   */
  getNoiseFloorAt(tapPoint: TapPoint, bandwidth: Hertz): {
    noiseFloorNoGain: dBm;
    shouldApplyGain: boolean;
  } {
    switch (tapPoint) {
      case TapPoint.RX_RF_PRE_OMT: {
        // Noise floor = Antenna thermal noise only
        // No components in chain yet, so this is just antenna noise temperature
        const antennaFreq = 4e9 as Hertz; // Use center of C-band as representative frequency
        const noiseFloor = this.getAntennaNoise(antennaFreq, bandwidth);
        return {
          noiseFloorNoGain: noiseFloor as dBm,
          shouldApplyGain: true // External noise - will need gain applied during visualization
        };
      }

      case TapPoint.RX_RF_POST_OMT:
      case TapPoint.RX_RF_POST_LNA: {
        // Noise floor = LNB system noise (includes LNA + mixer noise figures)
        // This is the "external" noise that will be (or has been) amplified by the LNA
        // We return the noise WITHOUT gain - caller applies gain during visualization
        const noiseFloor = this.rfFrontEnd_.lnbModule.getNoiseFloor(bandwidth);
        return {
          noiseFloorNoGain: noiseFloor as dBm,
          shouldApplyGain: true // External noise - gain applied during visualization
        };
      }

      case TapPoint.RX_IF: {
        // Compare external noise (with gain) vs internal spectrum analyzer noise
        const NF = 0.5; // Spectrum analyzer noise figure
        let externalNoiseFloor = this.rfFrontEnd_.lnbModule.getNoiseFloor(bandwidth) + this.getTotalGainTo(tapPoint);

        if (this.rfFrontEnd_.filterModule.state.isPowered === false) {
          externalNoiseFloor = Number.NEGATIVE_INFINITY as dBm; // No signal if filter is unpowered
        }

        const internalNoiseFloor = -174 + 10 * Math.log10(bandwidth) + NF;

        const isInternalNoiseGreater = internalNoiseFloor > externalNoiseFloor;

        if (isInternalNoiseGreater) {
          // Internal noise dominates - DON'T apply gain (already at spectrum analyzer)
          return {
            noiseFloorNoGain: internalNoiseFloor as dBm,
            shouldApplyGain: false
          };
        } else {
          // External noise dominates - return without gain, will be applied during visualization
          return {
            noiseFloorNoGain: (externalNoiseFloor - this.getTotalGainTo(tapPoint)) as dBm,
            shouldApplyGain: true
          };
        }
      }

      // TX path tap points - simplified for now
      case TapPoint.TX_IF:
      case TapPoint.TX_RF_POST_BUC:
      case TapPoint.TX_RF_POST_HPA:
      case TapPoint.TX_RF_POST_OMT:
      default: {
        const NF = 0.5; // Spectrum analyzer noise figure

        // For TX path or unknown, return a default noise floor
        const defaultNoiseFloor = -174 + 10 * Math.log10(bandwidth) + NF;
        return {
          noiseFloorNoGain: defaultNoiseFloor as dBm,
          shouldApplyGain: true
        };
      }
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
        // Only OMT loss applied
        return (-this.omtInsertionLoss_dB) as dB;
      }

      case TapPoint.RX_RF_POST_LNA: {
        if (!this.rfFrontEnd_.antenna.state.isPowered || !this.rfFrontEnd_.omtModule.state.isPowered || !this.rfFrontEnd_.lnbModule.state.isPowered) {
          return Number.NEGATIVE_INFINITY as dB; // No signal if any component is unpowered
        }
        // OMT loss + LNA gain
        return (this.lnaGain - this.omtInsertionLoss_dB) as dB;
      }

      case TapPoint.RX_IF: {
        if (!this.rfFrontEnd_.antenna.state.isPowered || !this.rfFrontEnd_.omtModule.state.isPowered || !this.rfFrontEnd_.lnbModule.state.isPowered || !this.rfFrontEnd_.filterModule.state.isPowered) {
          return Number.NEGATIVE_INFINITY as dB; // No signal if any component is unpowered
        }
        // Full RX chain: OMT loss + LNA gain + LNB loss - IF filter insertion loss
        // Note: getTotalRxGain() already calculates (LNA gain - IF filter insertion loss)
        return (this.getTotalRxGain() - this.omtInsertionLoss_dB) as dB;
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