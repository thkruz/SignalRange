import { HelpButton } from '@app/components/help-btn/help-btn';
import { RotaryKnob } from '@app/components/rotary-knob/rotary-knob';
import { ToggleSwitch } from '@app/components/toggle-switch/toggle-switch';
import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { SignalOrigin } from "@app/SignalOrigin";
import { dB, dBm, Hertz, IfFrequency, IfSignal, MHz, RfFrequency, RfSignal } from '@app/types';
import { RFFrontEnd } from '../rf-front-end';
import { RFFrontEndModule, RFFrontEndModuleState } from '../rf-front-end-module';
import './buc-module.css';

/**
 * Spurious output from mixer products
 */
export interface SpuriousOutput {
  /** Frequency of the spurious signal in Hz */
  frequency: Hertz;
  /** Level relative to carrier in dBc */
  level: number;
  /** Harmonic orders: N×LO ± M×IF */
  loHarmonic: number;
  ifHarmonic: number;
}

/**
 * Block Up Converter module state
 */
export interface BUCState extends RFFrontEndModuleState {
  // ═══ Operational State ═══
  /** Module power state */
  isPowered: boolean;
  /** Output muted for safety */
  isMuted: boolean;
  /** Indicates if the BUC is in RF loopback mode */
  isLoopback: boolean;
  /** Operating temperature in °C */
  temperature: number;
  /** Current draw in Amperes */
  currentDraw: number;

  // ═══ Frequency Translation ═══
  /** Local Oscillator frequency in MHz (typical 3700-4200 for C-band) */
  loFrequency: MHz;
  /** Phase lock to external 10MHz reference */
  isExtRefLocked: boolean;
  /** LO frequency drift when unlocked (Hz) */
  frequencyError: number;
  /** Phase lock tracking range (Hz) */
  phaseLockRange: number;

  // ═══ Gain & Power ═══
  /** BUC gain in dB (typical 0-70 dB range) */
  gain: dB;
  /** Output power after amplification in dBm */
  outputPower: dBm;
  /** P1dB compression point (saturation power) in dBm */
  saturationPower: dBm;
  /** Gain flatness across bandwidth in dB */
  gainFlatness: dB;

  // ═══ Signal Quality ═══
  /** Group delay variation (phase distortion) in nanoseconds */
  groupDelay: number;
  /** Phase noise contribution in dBc/Hz */
  phaseNoise: number;
  /** Unwanted mixer spurious products */
  spuriousOutputs: SpuriousOutput[];
  /** Noise floor in dBm */
  noiseFloor: number;
}

export class BUCModule extends RFFrontEndModule<BUCState> {
  // UI Components
  private readonly muteSwitch_: ToggleSwitch;
  private readonly loKnob_: RotaryKnob;
  private readonly loopbackSwitch_: ToggleSwitch;

  // Signals
  outputSignals: RfSignal[] = [];

  /**
   * Get default state for BUC module
   */
  static getDefaultState(): BUCState {
    return {
      // Operational State
      isPowered: true,
      isMuted: false,
      isLoopback: false,
      temperature: 25, // °C (ambient)
      currentDraw: 0, // A

      // Frequency Translation
      loFrequency: 4200 as MHz, // MHz (C-band)
      isExtRefLocked: true,
      frequencyError: 0, // Hz (locked)
      phaseLockRange: 10000, // ±10 kHz tracking range

      // Gain & Power
      gain: 58 as dB,
      outputPower: -10 as dBm,
      saturationPower: 15 as dBm, // P1dB point
      gainFlatness: 0.5 as dB, // ±0.5 dB across bandwidth

      // Signal Quality
      groupDelay: 3, // ns
      phaseNoise: -100, // dBc/Hz @ 10kHz offset (locked)
      spuriousOutputs: [],
      noiseFloor: -140, // dBm/Hz
    };
  }

  constructor(state: BUCState, rfFrontEnd: RFFrontEnd, unit: number = 1) {
    super(state, rfFrontEnd, 'rf-fe-buc', unit);

    this.helpBtn_ = HelpButton.create(
      `buc-help-${this.rfFrontEnd_.state.uuid}`,
      "Block Upconverter",
      null,
      'https://docs.signalrange.space/equipment/block-upconverter?content-only=true&dark=true'
    );

    // Create UI components using base class methods
    this.createPowerSwitch();
    this.createGainKnob(0, 70, 1);

    this.loKnob_ = RotaryKnob.create(
      `${this.uniqueId}-lo-knob`,
      this.state_.loFrequency,
      3700,
      4200,
      10,
      (value: number) => {
        this.state_.loFrequency = value as MHz;
      }
    );

    this.muteSwitch_ = ToggleSwitch.create(
      `${this.uniqueId}-mute`,
      this.state_.isMuted,
      false
    );

    this.loopbackSwitch_ = ToggleSwitch.create(
      `${this.uniqueId}-loopback`,
      this.state_.isLoopback,
      false
    );

    this.html_ = html`
      <div class="rf-fe-module buc-module">
        <div class="module-label">
          <span>Block Upconverter</span>
          ${this.helpBtn_.html}
        </div>
        <div class="module-controls">
          <div class="led-indicators">
            <div class="led-indicator">
              <span class="indicator-label">LOCK</span>
              <div class="led-lock led ${this.getLockLedStatus()}"></div>
            </div>
            <div class="led-indicator">
              <span class="indicator-label">LOOPBACK</span>
              <div class="led-loopback led ${this.getLoopbackLedStatus()}"></div>
            </div>
          </div>
          <div class="input-knobs">
            <div class="control-group">
              <label>MUTE</label>
              ${this.muteSwitch_.html}
            </div>
            <div class="control-group">
              <label>LO (MHz)</label>
              ${this.loKnob_.html}
            </div>
            <div class="control-group">
              <label>GAIN (dB)</label>
              ${this.gainKnob_?.html || ''}
            </div>
            <div class="control-group">
              <label>LOOPBACK TO LNB</label>
              ${this.loopbackSwitch_.html}
            </div>
            <div class="control-group">
              ${this.powerSwitch_?.html || ''}
            </div>
          </div>
          <div class="status-displays">
            <div class="control-group">
              <label>LO (MHz)</label>
              <div class="digital-display buc-lo-display">${this.state_.loFrequency}</div>
            </div>
            <div class="control-group">
              <label>TEMP (°C)</label>
              <div class="digital-display buc-temp-display">${this.state_.temperature.toFixed(1)}</div>
            </div>
            <div class="control-group">
              <label>CURRENT (A)</label>
              <div class="digital-display buc-current-display">${this.state_.currentDraw.toFixed(2)}</div>
            </div>
            <div class="control-group">
              <label>FREQ ERR (kHz)</label>
              <div class="digital-display buc-freq-err-display">${(this.state_.frequencyError / 1000).toFixed(1)}</div>
            </div>
            <div class="control-group">
              <label>OUT PWR (dBm)</label>
              <div class="digital-display buc-out-pwr-display">${this.state_.outputPower.toFixed(1)}</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Add event listeners for user interactions
   */
  addEventListeners(cb: (state: BUCState) => void): void {
    // Power switch handler using base class method
    this.addPowerSwitchListener(cb, () => {
      this.simulateLockAcquisition(2000, 2000, () => cb(this.state_));
    });

    // Mute switch handler
    this.muteSwitch_.addEventListeners((isMuted: boolean) => {
      this.state_.isMuted = isMuted;
      this.syncDomWithState_();
      cb(this.state_);
    });

    // Loopback switch handler
    this.loopbackSwitch_.addEventListeners((isLoopback: boolean) => {
      this.state_.isLoopback = isLoopback;
      this.syncDomWithState_();
      cb(this.state_);
    });
  }

  /**
   * Update component state and check for faults
   */
  update(): void {
    // Update lock status based on power and reference availability
    this.updateLockStatus_();

    // Calculate output power
    this.updateOutputPower_();

    // Update signal quality parameters
    this.updateSignalQuality_();

    // Update thermal parameters
    this.updateThermalState_();

    // Check for alarms is currently handled by RFFrontEnd

    // Calculate post-BUC signals (apply upconversion and gain if powered)
    this.outputSignals = this.inputSignals.map(sig => {
      const rfFreq = this.calculateRfFrequency(sig.frequency);
      const gain = this.state_.isPowered && !this.state_.isMuted ? this.state_.gain : -170;
      return {
        ...sig,
        frequency: rfFreq,
        power: sig.power + gain,
        bandwidth: sig.bandwidth,
        origin: SignalOrigin.BUC,
      } as RfSignal;
    });
  }

  /**
   * Calculate BUC output power with saturation/compression modeling
   * Models P1dB compression point where gain drops by 1dB
   */
  private updateOutputPower_(): void {
    if (!this.state_.isPowered || this.state_.isMuted) {
      this.state_.outputPower = -170 as dBm; // Effectively off
      return;
    }

    const inputPower = -10 as dBm; // dBm typical IF input
    const linearOutputPower = inputPower + this.state_.gain;

    // Model amplifier compression (P1dB)
    // When output approaches saturation power, gain compresses
    if (linearOutputPower >= this.state_.saturationPower) {
      // Above P1dB, output is compressed
      const compressionDb = Math.min(
        (linearOutputPower - this.state_.saturationPower) * 0.5,
        3 // Max 3dB compression beyond P1dB
      );
      this.state_.outputPower = linearOutputPower - compressionDb as dBm;
    } else {
      // Linear region - no compression
      this.state_.outputPower = linearOutputPower as dBm;
    }
  }

  /**
   * Update lock status based on power and external reference
   * Simulates frequency drift when unlocked
   */
  private updateLockStatus_(): void {
    const extRefPresent = this.isExtRefPresent();
    const canLock = this.state_.isPowered && extRefPresent;

    if (canLock) {
      // In real system, lock acquisition takes 2-5 seconds
      // Simulate lock acquisition if not already locked
      if (!this.state_.isExtRefLocked) {
        this.simulateLockAcquisition();
      }
      // When locked, frequency error is minimal
      if (this.isExtRefWarmedUp()) {
        this.state_.frequencyError = 0;
      } else {
        this.updateFrequencyDrift_();
      }
    } else {
      this.state_.isExtRefLocked = false;
      this.updateFrequencyDrift_();
    }
  }

  /**
   * Update frequency drift when LO is not locked to external reference
   * Drift is ±1-100 ppm of LO frequency
   */
  private updateFrequencyDrift_(): void {
    if (this.state_.isExtRefLocked && this.isExtRefWarmedUp()) {
      this.state_.frequencyError = 0;
      return;
    }

    const loFrequencyHz = this.state_.loFrequency * 1e6;
    // Simulate drift: ±1-100 ppm (parts per million)
    // Use random walk model for realistic drift behavior
    const driftPpm = 10 + Math.random() * 90; // 10-100 ppm
    const driftDirection = Math.random() > 0.5 ? 1 : -1;
    this.state_.frequencyError = driftDirection * (loFrequencyHz * driftPpm / 1e6);
  }

  /**
   * Update signal quality parameters (phase noise, group delay, spurious outputs)
   */
  private updateSignalQuality_(): void {
    if (!this.state_.isPowered) {
      this.state_.phaseNoise = 0;
      this.state_.groupDelay = 0;
      this.state_.spuriousOutputs = [];
      return;
    }

    // Phase noise contribution increases when unlocked
    // Typical locked: -100 dBc/Hz @ 10kHz offset
    // Unlocked: -70 to -80 dBc/Hz (degraded)
    this.state_.phaseNoise = this.state_.isExtRefLocked
      ? -100 - Math.random() * 5 // -100 to -105 dBc/Hz
      : -70 - Math.random() * 10; // -70 to -80 dBc/Hz

    // Group delay variation (phase distortion across bandwidth)
    // Typical: 2-10 ns, increases with temperature and at band edges
    const baseDelay = 3; // ns
    const tempVariation = (this.state_.temperature - 25) * 0.1; // 0.1 ns/°C
    this.state_.groupDelay = baseDelay + tempVariation + Math.random() * 2;

    // Calculate spurious mixer products (N×LO ± M×IF)
    this.state_.spuriousOutputs = this.calculateSpuriousProducts_();
  }

  /**
   * Calculate spurious outputs from mixer products
   * Generates harmonics at N×LO ± M×IF
   */
  private calculateSpuriousProducts_(): SpuriousOutput[] {
    if (!this.state_.isPowered || this.inputSignals.length === 0) {
      return [];
    }

    const spurious: SpuriousOutput[] = [];
    const loFreqHz = this.state_.loFrequency * 1e6;

    // For each input signal, calculate primary spurious products
    this.inputSignals.forEach(signal => {
      const ifFreqHz = signal.frequency;

      spurious.push(
        // 2×LO - IF (2nd harmonic mixing)
        {
          frequency: (2 * loFreqHz - ifFreqHz) as Hertz,
          level: -30 - Math.random() * 10, // -30 to -40 dBc
          loHarmonic: 2,
          ifHarmonic: -1,
        },
        // 2×LO + IF (2nd harmonic mixing)
        {
          frequency: (2 * loFreqHz + ifFreqHz) as Hertz,
          level: -35 - Math.random() * 10, // -35 to -45 dBc
          loHarmonic: 2,
          ifHarmonic: 1,
        },
        // 3×LO - IF (3rd harmonic)
        {
          frequency: (3 * loFreqHz - ifFreqHz) as Hertz,
          level: -40 - Math.random() * 15, // -40 to -55 dBc
          loHarmonic: 3,
          ifHarmonic: -1,
        }
      );
    });

    return spurious;
  }

  /**
   * Update thermal and operational state
   */
  private updateThermalState_(): void {
    if (!this.state_.isPowered) {
      // Cooling down gradually toward ambient (25°C)
      const ambientTemp = 25;
      const coolRate = 0.00001; // Slow cooling per update
      this.state_.temperature = this.state_.temperature +
        (ambientTemp - this.state_.temperature) * coolRate;
      this.state_.currentDraw = 0;
      return;
    }

    // Calculate target temperature based on output power
    const ambientTemp = 25; // °C
    const powerDissipation = Math.max(0, this.state_.outputPower - (-10));
    const thermalRise = powerDissipation * 0.8; // °C per dBm above reference
    const targetTemp = ambientTemp + thermalRise;

    // Simulate gradual heating (thermal inertia)
    const heatRate = 0.00005; // Slow heating per update
    this.state_.temperature = this.state_.temperature +
      (targetTemp - this.state_.temperature) * heatRate;

    // Current draw trends gradually toward target value
    const idleCurrent = 0.5;
    const powerCurrent = (this.state_.gain / 70) * 2.5; // 0-2.5A based on gain
    const outputCurrent = Math.max(0, (this.state_.outputPower + 10) / 20) * 1.5;
    const targetCurrent = idleCurrent + powerCurrent + outputCurrent;
    const currentRate = 0.1; // Slow current change per update
    this.state_.currentDraw = this.state_.currentDraw +
      (targetCurrent - this.state_.currentDraw) * currentRate;
  }

  /**
   * Sync state from external source
   */
  sync(state: Partial<BUCState>): void {
    super.sync(state);

    // Sync common UI components using base class method
    this.syncCommonComponents(state);

    // Sync BUC-specific UI components
    if (this.loKnob_ && state.loFrequency !== undefined) {
      this.loKnob_.sync(state.loFrequency);
    }
    if (this.muteSwitch_ && state.isMuted !== undefined) {
      this.muteSwitch_.sync(state.isMuted);
    }
  }

  /**
   * Check if module has alarms
   */
  getAlarms(): string[] {
    const alarms: string[] = [];

    if (!this.state_.isPowered) {
      return alarms;
    }

    const extRefPresent = this.isExtRefPresent();

    // Lock alarm
    if (!this.state_.isExtRefLocked && extRefPresent) {
      alarms.push('BUC not locked to reference');
    }

    // Frequency error alarm (when unlocked)
    if (!this.state_.isExtRefLocked && Math.abs(this.state_.frequencyError) > 50000) {
      alarms.push(`BUC frequency error: ${(this.state_.frequencyError / 1000).toFixed(1)} kHz`);
    }

    // High output power warning (approaching saturation)
    if (this.state_.outputPower > this.state_.saturationPower - 2) {
      alarms.push(`BUC approaching saturation (${this.state_.outputPower.toFixed(1)} dBm)`);
    }

    // High temperature alarm
    if (this.state_.temperature > 70) {
      alarms.push(`BUC over-temperature (${this.state_.temperature.toFixed(1)} °C)`);
    }

    // High current draw alarm
    if (this.state_.currentDraw > 4.5) {
      alarms.push(`BUC high current draw (${this.state_.currentDraw.toFixed(2)} A)`);
    }

    // Phase noise degradation (when unlocked)
    if (this.state_.phaseNoise > -85 && !this.state_.isExtRefLocked) {
      alarms.push('BUC phase noise degraded (unlocked)');
    }

    return alarms;
  }

  /**
   * Update the DOM to reflect current state
   */
  protected syncDomWithState_(): void {
    if (!this.hasStateChanged()) {
      return; // No changes, skip update
    }

    const container = qs('.buc-module');
    if (!container) return;

    // Update LO frequency display
    const loDisplay = qs('.buc-lo-display', container);
    if (loDisplay) {
      loDisplay.textContent = this.state_.loFrequency.toString();
    }

    // Update lock LED using base class method
    const lockLed = qs('.led-lock', container);
    if (lockLed) {
      lockLed.className = `led-lock led ${this.getLockLedStatus()}`;
    }

    // Update temperature display
    const tempDisplay = qs('.buc-temp-display', container);
    if (tempDisplay) {
      tempDisplay.textContent = this.state_.temperature.toFixed(1);
    }

    // Update current draw display
    const currentDisplay = qs('.buc-current-display', container);
    if (currentDisplay) {
      currentDisplay.textContent = this.state_.currentDraw.toFixed(2);
    }

    // Update frequency error display
    const freqErrDisplay = qs('.buc-freq-err-display', container);
    if (freqErrDisplay) {
      const freqErrKhz = this.state_.frequencyError / 1000;
      freqErrDisplay.textContent = freqErrKhz.toFixed(1);
      // Color code: green when locked, red when unlocked with error
      freqErrDisplay.style.color = this.state_.isExtRefLocked ? '#0f0' : '#f00';
    }

    // Update output power display
    const outPwrDisplay = qs('.buc-out-pwr-display', container);
    if (outPwrDisplay) {
      outPwrDisplay.textContent = this.state_.outputPower.toFixed(1);
      // Color code: yellow when approaching saturation
      const approachingSat = this.state_.outputPower > this.state_.saturationPower - 2;
      outPwrDisplay.style.color = approachingSat ? '#ff0' : '#0f0';
    }

    // Sync UI components using base class method for common components
    this.syncCommonComponents(this.state_);

    // Sync BUC-specific components
    this.loKnob_.sync(this.state_.loFrequency);
    this.muteSwitch_.sync(this.state_.isMuted);
    this.loopbackSwitch_.sync(this.state_.isLoopback);

    // Sync loopback LED
    const loopbackLed = qs('.led-loopback', container);
    if (loopbackLed) {
      loopbackLed.className = `led-loopback led ${this.getLoopbackLedStatus()}`;
    }
  }

  get inputSignals(): IfSignal[] {
    return this.rfFrontEnd_.transmitters
      .flatMap((tx) => tx.state.modems
        .filter((modem) => modem.isTransmitting && !modem.isFaulted && !modem.isLoopback)
        .map((modem) => modem.ifSignal));
  }

  protected getLoopbackLedStatus(): string {
    return this.state_.isLoopback ? 'led-blue' : 'led-off';
  }

  /**
   * Calculate upconverted RF frequency with physics-based accuracy
   * RF_out = IF_in + LO (for upconversion)
   * When unlocked, frequency drifts by ±1-100 ppm
   *
   * @param ifFrequency IF input frequency in Hz
   * @returns RF output frequency in Hz
   */
  calculateRfFrequency(ifFrequency: IfFrequency): RfFrequency {
    const loFrequencyHz = this.state_.loFrequency * 1e6;

    // Apply frequency error when not locked to external reference
    const effectiveLO = (this.state_.isExtRefLocked && this.isExtRefWarmedUp())
      ? loFrequencyHz
      : loFrequencyHz + this.state_.frequencyError;

    return (ifFrequency + effectiveLO) as RfFrequency;
  }

  /**
   * Get total gain through BUC
   * @returns Gain in dB
   */
  getTotalGain(): number {
    if (!this.state_.isPowered || this.state_.isMuted) {
      return -120; // Effectively off
    }
    return this.state_.gain;
  }

  /**
   * Get output power for given input power with compression modeling
   * @param inputPowerDbm Input IF power in dBm
   * @returns Output RF power in dBm (with P1dB compression applied)
   */
  getOutputPower(inputPowerDbm: number): number {
    if (!this.state_.isPowered || this.state_.isMuted) {
      return -120; // Effectively off
    }

    const linearOutputPower = inputPowerDbm + this.state_.gain;

    // Apply compression if approaching saturation
    if (linearOutputPower >= this.state_.saturationPower) {
      const compressionDb = Math.min(
        (linearOutputPower - this.state_.saturationPower) * 0.5,
        3 // Max 3dB compression
      );
      return linearOutputPower - compressionDb;
    }

    return linearOutputPower;
  }

  /**
   * Get current compression amount in dB
   * @returns Compression in dB (0 if in linear region)
   */
  getCompressionDb(): number {
    if (!this.state_.isPowered || this.state_.isMuted) {
      return 0;
    }

    const inputPower = -10; // Typical IF input
    const linearOutputPower = inputPower + this.state_.gain;

    if (linearOutputPower >= this.state_.saturationPower) {
      return Math.min(
        (linearOutputPower - this.state_.saturationPower) * 0.5,
        3
      );
    }

    return 0;
  }

  /**
   * Get frequency stability status
   * @returns Frequency stability in ppm
   */
  getFrequencyStabilityPpm(): number {
    const loFrequencyHz = this.state_.loFrequency * 1e6;
    if (loFrequencyHz === 0) return 0;
    return (this.state_.frequencyError / loFrequencyHz) * 1e6;
  }

  /**
   * Check if BUC is operating in saturation region
   * @returns True if in saturation
   */
  isInSaturation(): boolean {
    return this.state_.outputPower >= this.state_.saturationPower;
  }

  /**
   * Get signal quality metrics
   * @returns Object with quality metrics
   */
  getSignalQualityMetrics(): {
    phaseNoise: number;
    groupDelay: number;
    frequencyError: number;
    isLocked: boolean;
    spuriousCount: number;
  } {
    return {
      phaseNoise: this.state_.phaseNoise,
      groupDelay: this.state_.groupDelay,
      frequencyError: this.state_.frequencyError,
      isLocked: this.state_.isExtRefLocked,
      spuriousCount: this.state_.spuriousOutputs.length,
    };
  }

  /**
   * Get thermal state
   * @returns Object with thermal parameters
   */
  getThermalState(): {
    temperature: number;
    currentDraw: number;
    powerDissipation: number;
  } {
    const powerOut = Math.pow(10, this.state_.outputPower / 10);
    const powerDissipation = this.state_.currentDraw * 28 - powerOut; // Assuming 28V supply

    return {
      temperature: this.state_.temperature,
      currentDraw: this.state_.currentDraw,
      powerDissipation: powerDissipation, // mW
    };
  }
}
