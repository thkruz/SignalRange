import type { GroundStation } from "@app/assets/ground-station/ground-station";
import { BaseElement } from "@app/components/base-element";
import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import type { AntennaCore } from "@app/equipment/antenna";
import type { RealTimeSpectrumAnalyzer } from "@app/equipment/real-time-spectrum-analyzer/real-time-spectrum-analyzer";
import { WaterfallDisplay } from "@app/equipment/real-time-spectrum-analyzer/rtsa-screen/waterfall-display";
import type { Receiver, ReceiverModemState } from "@app/equipment/receiver/receiver";
import type { LNBModuleCore } from "@app/equipment/rf-front-end/lnb-module/lnb-module-core";
import { EventBus } from "@app/events/event-bus";
import { Events } from "@app/events/events";
import { SimulationManager } from "@app/simulation/simulation-manager";
import type { FECType, ModulationType } from "@app/types";
import './sdr-console-tab.css';

/** Known allocations painted on the band plan ribbon (RF Hz) */
const BAND_PLAN: { lowHz: number; highHz: number; label: string }[] = [
  { lowHz: 137e6, highHz: 138e6, label: 'WX SAT' },
  { lowHz: 144e6, highHz: 146e6, label: '2M AMATEUR' },
  { lowHz: 420e6, highHz: 450e6, label: '70CM AMATEUR' },
  { lowHz: 1559e6, highHz: 1610e6, label: 'GNSS L1' },
];

/** RF GAIN slider range (maps directly to the LNB/SDR front-end gain, dB) */
const RF_GAIN_MIN = 40;
const RF_GAIN_MAX = 100;

/**
 * SdrConsoleTab - Hobbyist SDR receiver console (Campaign 3+ backyard stations)
 *
 * Styled like 2000s amateur freeware (SDR++/SDR# meets Gpredict): collapsible
 * left menu, digit-wise VFO readout, spectrum trace + waterfall with a VFO
 * passband overlay, band plan ribbon, bookmarks, rotator control, RF gain with
 * real ADC consequences (AGC is bypassed on backyard rigs). Drives the SAME
 * headless cores as the professional tabs, so all existing objective
 * conditions work unchanged. Registered only via stationClass: 'backyard'.
 *
 * NOTE: consider adding audio demodulation later — a real SDR's defining
 * feature is hearing the passband (FM audio, APT tones, CW beacons). The sim
 * currently has no audio path from the signal model; the Recorder section
 * below is a stub until one exists.
 */
export class SdrConsoleTab extends BaseElement {
  private static readonly SYNC_INTERVAL_MS = 250;
  private static readonly DISPLAY_INTERVAL_MS = 120;

  private readonly groundStation_: GroundStation;
  private readonly receiver_: Receiver | undefined;
  private readonly antenna_: AntennaCore | undefined;
  private readonly specA_: RealTimeSpectrumAnalyzer | undefined;
  private readonly lnb_: LNBModuleCore | undefined;
  private readonly boundUpdateHandler_: () => void;

  private lastSyncTime_: number = 0;
  private lastRowTime_: number = 0;
  private currentFeedUrl_: string = '';

  private readonly waterfallCanvas_: HTMLCanvasElement | null = null;
  private readonly waterfallCtx_: CanvasRenderingContext2D | null = null;
  private readonly spectrumCanvas_: HTMLCanvasElement | null = null;
  private readonly spectrumCtx_: CanvasRenderingContext2D | null = null;

  constructor(groundStation: GroundStation, containerId: string) {
    super();
    this.groundStation_ = groundStation;
    this.receiver_ = groundStation.receivers[0];
    this.antenna_ = groundStation.antennas[0];
    this.specA_ = groundStation.spectrumAnalyzers[0];
    this.lnb_ = groundStation.rfFrontEnds[0]?.lnbModule;

    this.init_(containerId, 'replace');
    this.dom_ = qs('.sdr-console-tab');

    this.waterfallCanvas_ = qs<HTMLCanvasElement>('#sdr-waterfall', this.dom_);
    this.waterfallCtx_ = this.waterfallCanvas_?.getContext('2d') ?? null;
    this.spectrumCanvas_ = qs<HTMLCanvasElement>('#sdr-spectrum', this.dom_);
    this.spectrumCtx_ = this.spectrumCanvas_?.getContext('2d') ?? null;

    this.renderBandPlan_();
    this.renderFreqTicks_();

    this.boundUpdateHandler_ = this.handleUpdate_.bind(this);
    EventBus.getInstance().on(Events.UPDATE, this.boundUpdateHandler_);

    this.syncDomWithState_();
  }

  /** Antennas slower than 1 deg/s are fixed mounts (QFH on a fence post, patch on a mast) */
  private get isSteerable_(): boolean {
    return (this.antenna_?.config.maxRate_deg_s ?? 0) >= 1;
  }

  private get modem1_(): ReceiverModemState | undefined {
    return this.receiver_?.state.modems.find(m => m.modemNumber === 1);
  }

  // ==========================================================================
  // TEMPLATE
  // ==========================================================================

  protected get html_(): string {
    const stationName = this.groundStation_.state.name;
    const isCircular = this.antenna_?.config.polType === 'circular';
    const handedness = this.antenna_?.state.circularHandedness ?? 'RHCP';

    const satelliteOptions = SimulationManager.getInstance().satellites
      .map((sat) => html`<option value="${sat.noradId}">${sat.name}</option>`)
      .join('');

    // Bookmarks: every downlink beacon in the scenario
    const bookmarkRows = SimulationManager.getInstance().satellites
      .flatMap((sat) => sat.transponders
        .filter((tp) => tp.beacon?.frequency)
        .map((tp) => ({ name: tp.beacon!.signalId, freqHz: tp.beacon!.frequency as number })))
      .map(({ name, freqHz }) => html`
        <button class="sdr-bookmark" data-freq-hz="${freqHz}">
          <span class="sdr-bookmark-name">${name}</span>
          <span class="sdr-bookmark-freq">${(freqHz / 1e6).toFixed(3)}</span>
        </button>
      `).join('');

    const rotatorBody = this.isSteerable_
      ? html`
        <div class="sdr-rot-row">
          <span>AZ <span id="sdr-rot-az" class="sdr-readout">---.-&deg;</span></span>
          <span>EL <span id="sdr-rot-el" class="sdr-readout">--.-&deg;</span></span>
          <span id="sdr-rot-status" class="sdr-lock">IDLE</span>
        </div>
        <div class="sdr-rot-row">
          <select id="sdr-rot-target" class="sdr-select">
            <option value="">-- select satellite --</option>
            ${satelliteOptions}
          </select>
          <label class="sdr-check">
            <input type="checkbox" id="sdr-rot-track" />
            TRACK
          </label>
        </div>
      `
      : html`<div class="sdr-rot-fixed">FIXED MOUNT &mdash; NO ROTATOR</div>`;

    return html`
      <div class="sdr-console-tab">
        <div class="sdr-window">
          <div class="sdr-titlebar">
            <span class="sdr-titlebar-text">SkyWatcher SDR v0.9.4 beta &mdash; ${stationName}</span>
            <span class="sdr-titlebar-buttons">_ &#9633; &#10005;</span>
          </div>

          <div class="sdr-topbar">
            <div class="sdr-fakebtns">
              <span class="sdr-fakebtn">&#9776;</span>
              <span class="sdr-fakebtn">&#9632;</span>
              <span class="sdr-fakebtn">&#128264;</span>
            </div>
            <div class="sdr-vfo-group">
              <button id="sdr-tune-dn-coarse" class="sdr-btn" title="-10 kHz">&laquo;</button>
              <button id="sdr-tune-dn-fine" class="sdr-btn" title="-1 kHz">&lsaquo;</button>
              <div id="sdr-freq-digits" class="sdr-freq-digits" title="Scroll or click a digit to tune"></div>
              <button id="sdr-tune-up-fine" class="sdr-btn" title="+1 kHz">&rsaquo;</button>
              <button id="sdr-tune-up-coarse" class="sdr-btn" title="+10 kHz">&raquo;</button>
            </div>
            <div class="sdr-meter-group">
              <span class="sdr-label">SIGNAL</span>
              <div class="sdr-meter"><div id="sdr-meter-fill" class="sdr-meter-fill"></div></div>
              <span id="sdr-cn-readout" class="sdr-readout">--.- dB</span>
              <span id="sdr-lock-indicator" class="sdr-lock">NO LOCK</span>
            </div>
          </div>

          <div class="sdr-body">
            <div class="sdr-menu">
              <div class="sdr-section" data-section="source">
                <div class="sdr-section-header">&#9662; SOURCE</div>
                <div class="sdr-section-body">
                  <select class="sdr-select" disabled>
                    <option>RTL-SDR v3 [direct sampling]</option>
                  </select>
                  <div class="sdr-field-row">
                    <span class="sdr-label">RF GAIN</span>
                    <input type="range" id="sdr-gain-slider" min="${RF_GAIN_MIN}" max="${RF_GAIN_MAX}" step="0.5" />
                    <span id="sdr-gain-readout" class="sdr-readout">-- dB</span>
                  </div>
                  <div class="sdr-field-row">
                    <span class="sdr-label">ADC</span>
                    <span id="sdr-adc-readout" class="sdr-readout">---</span>
                  </div>
                </div>
              </div>

              <div class="sdr-section" data-section="radio">
                <div class="sdr-section-header">&#9662; RADIO</div>
                <div class="sdr-section-body">
                  <div class="sdr-field-row">
                    <span class="sdr-label">MODE</span>
                    <select id="sdr-mode-select" class="sdr-select">
                      <option value="BPSK">BPSK</option>
                      <option value="QPSK">QPSK</option>
                      <option value="8QAM">8QAM</option>
                      <option value="16QAM">16QAM</option>
                    </select>
                  </div>
                  <div class="sdr-field-row">
                    <span class="sdr-label">FEC</span>
                    <select id="sdr-fec-select" class="sdr-select">
                      <option value="1/2">1/2</option>
                      <option value="2/3">2/3</option>
                      <option value="3/4">3/4</option>
                      <option value="5/6">5/6</option>
                      <option value="7/8">7/8</option>
                    </select>
                  </div>
                  <div class="sdr-field-row">
                    <span class="sdr-label">BW kHz</span>
                    <input type="number" id="sdr-bw-input" class="sdr-input" min="1" step="5" />
                  </div>
                  <div class="sdr-field-row">
                    <label class="sdr-check">
                      <input type="checkbox" id="sdr-afc-toggle" />
                      AFC
                    </label>
                    ${isCircular ? html`
                      <div class="sdr-pol-group">
                        <span class="sdr-label">POL</span>
                        <button id="sdr-pol-rhcp" class="sdr-btn sdr-pol-btn ${handedness === 'RHCP' ? 'active' : ''}">RHCP</button>
                        <button id="sdr-pol-lhcp" class="sdr-btn sdr-pol-btn ${handedness === 'LHCP' ? 'active' : ''}">LHCP</button>
                      </div>
                    ` : ''}
                  </div>
                </div>
              </div>

              <div class="sdr-section" data-section="bookmarks">
                <div class="sdr-section-header">&#9662; FREQUENCY MANAGER</div>
                <div class="sdr-section-body sdr-bookmark-list">
                  ${bookmarkRows}
                </div>
              </div>

              <div class="sdr-section" data-section="rotator">
                <div class="sdr-section-header">&#9662; ROTATOR</div>
                <div class="sdr-section-body">
                  ${rotatorBody}
                </div>
              </div>

              <div class="sdr-section" data-section="decoder">
                <div class="sdr-section-header">&#9662; DECODER</div>
                <div class="sdr-section-body">
                  <div id="sdr-decode-panel" class="sdr-decode-panel">
                    <span class="sdr-decode-nosignal">NO SIGNAL</span>
                  </div>
                  <div class="sdr-field-row">
                    <span class="sdr-label">ID</span>
                    <span id="sdr-id-readout" class="sdr-readout">---</span>
                  </div>
                  <div class="sdr-field-row">
                    <span class="sdr-label">OFFSET</span>
                    <span id="sdr-offset-readout" class="sdr-readout">--- Hz</span>
                  </div>
                </div>
              </div>

              <!-- Decorative chrome: collapsed freeware stubs -->
              <div class="sdr-section collapsed" data-section="recorder">
                <div class="sdr-section-header">&#9656; RECORDER</div>
                <div class="sdr-section-body">
                  <div class="sdr-stub-text">no audio sink &mdash; IQ only (todo)</div>
                </div>
              </div>
              <div class="sdr-section collapsed" data-section="theme">
                <div class="sdr-section-header">&#9656; THEME</div>
                <div class="sdr-section-body">
                  <select class="sdr-select" disabled><option>Dark (only)</option></select>
                </div>
              </div>
              <div class="sdr-section collapsed" data-section="modules">
                <div class="sdr-section-header">&#9656; MODULE MANAGER</div>
                <div class="sdr-section-body">
                  <div class="sdr-stub-text">9 modules loaded, 6 working</div>
                </div>
              </div>
              <div class="sdr-section collapsed" data-section="rigctl">
                <div class="sdr-section-header">&#9656; RIGCTL SERVER</div>
                <div class="sdr-section-body">
                  <div class="sdr-stub-text">rotctld listening on 127.0.0.1:4533</div>
                </div>
              </div>
            </div>

            <div class="sdr-display">
              <div id="sdr-display-stack" class="sdr-display-stack">
                <canvas id="sdr-spectrum" width="824" height="140"></canvas>
                <div id="sdr-bandplan" class="sdr-bandplan"></div>
                <canvas id="sdr-waterfall" width="824" height="320"></canvas>
                <div id="sdr-vfo-overlay" class="sdr-vfo-overlay"><div class="sdr-vfo-center"></div></div>
              </div>
              <div id="sdr-freq-scale" class="sdr-freq-scale"></div>
            </div>
          </div>

          <div class="sdr-statusbar">
            <span>unregistered copy &mdash; please donate</span>
            <span id="sdr-status-tuning"></span>
          </div>
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // LISTENERS
  // ==========================================================================

  protected addEventListeners_(): void {
    const dom = document; // elements exist after initDom_

    // Collapsible menu sections
    dom.querySelectorAll<HTMLElement>('.sdr-section-header').forEach((header) => {
      header.addEventListener('click', () => {
        const section = header.parentElement;
        if (!section) return;
        section.classList.toggle('collapsed');
        const isCollapsed = section.classList.contains('collapsed');
        header.innerHTML = header.innerHTML.replace(
          isCollapsed ? '▾' : '▸',
          isCollapsed ? '▸' : '▾',
        );
      });
    });

    // Tune step buttons (direct user actions bypass throttling)
    qs('#sdr-tune-dn-coarse', dom).addEventListener('click', () => this.tuneByHz_(-10_000));
    qs('#sdr-tune-dn-fine', dom).addEventListener('click', () => this.tuneByHz_(-1_000));
    qs('#sdr-tune-up-fine', dom).addEventListener('click', () => this.tuneByHz_(1_000));
    qs('#sdr-tune-up-coarse', dom).addEventListener('click', () => this.tuneByHz_(10_000));

    // Digit-wise VFO tuning: scroll a digit to spin it, click upper/lower half to +/-
    const digits = qs<HTMLElement>('#sdr-freq-digits', dom);
    digits.addEventListener('wheel', (e: WheelEvent) => {
      const place = (e.target as HTMLElement).dataset?.place;
      if (!place) return;
      e.preventDefault();
      this.tuneByHz_((e.deltaY < 0 ? 1 : -1) * Number(place));
    }, { passive: false });
    digits.addEventListener('click', (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const place = target.dataset?.place;
      if (!place) return;
      const rect = target.getBoundingClientRect();
      const isUpperHalf = e.clientY < rect.top + rect.height / 2;
      this.tuneByHz_((isUpperHalf ? 1 : -1) * Number(place));
    });

    // RF gain slider -> LNB/SDR front-end gain (AGC is bypassed on these rigs)
    const gainSlider = qs<HTMLInputElement>('#sdr-gain-slider', dom);
    gainSlider.addEventListener('input', () => {
      this.lnb_?.handleGainChange(Number.parseFloat(gainSlider.value));
      this.syncDomWithState_();
    });

    // Radio config
    const modeSelect = qs<HTMLSelectElement>('#sdr-mode-select', dom);
    modeSelect.addEventListener('change', () => {
      this.receiver_?.handleModemConfigChange(1, { modulation: modeSelect.value as ModulationType });
    });
    const fecSelect = qs<HTMLSelectElement>('#sdr-fec-select', dom);
    fecSelect.addEventListener('change', () => {
      this.receiver_?.handleModemConfigChange(1, { fec: fecSelect.value as FECType });
    });
    const bwInput = qs<HTMLInputElement>('#sdr-bw-input', dom);
    bwInput.addEventListener('change', () => {
      const kHz = Number.parseFloat(bwInput.value);
      if (Number.isFinite(kHz) && kHz > 0) {
        this.receiver_?.handleModemConfigChange(1, { bandwidthMHz: kHz / 1e3 });
        this.syncDomWithState_();
      }
    });

    // AFC toggle
    const afcToggle = qs<HTMLInputElement>('#sdr-afc-toggle', dom);
    afcToggle.addEventListener('change', () => {
      this.receiver_?.handleAfcToggle(1, afcToggle.checked);
    });

    // Polarization handedness switch (only rendered for circular feeds)
    dom.querySelector('#sdr-pol-rhcp')?.addEventListener('click', () => this.setHandedness_('RHCP'));
    dom.querySelector('#sdr-pol-lhcp')?.addEventListener('click', () => this.setHandedness_('LHCP'));

    // Bookmarks: click to tune
    dom.querySelectorAll<HTMLButtonElement>('.sdr-bookmark').forEach((row) => {
      row.addEventListener('click', () => {
        const freqHz = Number(row.dataset.freqHz);
        if (Number.isFinite(freqHz) && freqHz > 0) {
          this.receiver_?.handleModemFrequencyChange(1, freqHz / 1e6);
          this.syncDomWithState_();
        }
      });
    });

    // Rotator panel (only rendered for steerable antennas)
    const trackToggle = dom.querySelector<HTMLInputElement>('#sdr-rot-track');
    const targetSelect = dom.querySelector<HTMLSelectElement>('#sdr-rot-target');
    trackToggle?.addEventListener('change', () => {
      if (!trackToggle.checked) {
        this.antenna_?.handleTrackingModeChange('manual');
        return;
      }
      const noradId = Number.parseInt(targetSelect?.value ?? '', 10);
      if (!Number.isFinite(noradId)) {
        // No satellite selected: refuse to engage, like any self-respecting rotctl
        trackToggle.checked = false;
        return;
      }
      // Order matters: mode change clears the target satellite
      this.antenna_?.handleTrackingModeChange('program-track');
      this.antenna_?.handleTargetSatelliteChange(noradId);
    });
    targetSelect?.addEventListener('change', () => {
      const noradId = Number.parseInt(targetSelect.value, 10);
      if (trackToggle?.checked && Number.isFinite(noradId)) {
        this.antenna_?.handleTargetSatelliteChange(noradId);
      }
    });

    // Click-to-tune and scroll-to-tune over the displays
    const stack = qs<HTMLElement>('#sdr-display-stack', dom);
    stack.addEventListener('click', (e: MouseEvent) => {
      if (!this.specA_) return;
      const rect = stack.getBoundingClientRect();
      const frac = (e.clientX - rect.left) / rect.width;
      const startHz = this.specA_.state.centerFrequency - this.specA_.state.span / 2;
      this.receiver_?.handleModemFrequencyChange(1, (startHz + frac * this.specA_.state.span) / 1e6);
      this.syncDomWithState_();
    });
    stack.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault();
      const stepHz = e.shiftKey ? 10_000 : 1_000;
      this.tuneByHz_((e.deltaY < 0 ? 1 : -1) * stepHz);
    }, { passive: false });
  }

  /**
   * How far the spectrum bins inside the VFO passband sit above the median
   * (noise) bin, in dB. Max drives the S-meter (responsive); mean drives the
   * "BW TOO NARROW" hint (robust against noise grass — a wideband PSD hump
   * only rises a few dB, but it lifts the whole passband). UI-level only;
   * the modem physics are untouched.
   */
  private passbandEnergyExcessDb_(modem: ReceiverModemState): { max: number; mean: number } {
    const none = { max: 0, mean: 0 };
    const specA = this.specA_;
    if (!specA) return none;

    const data = specA.spectrumDataProcessor.combinedData;
    if (!data || data.length === 0) return none;

    const startHz = specA.state.centerFrequency - specA.state.span / 2;
    const spanHz = specA.state.span;
    const vfoHz = modem.frequency * 1e6;
    const bwHz = modem.bandwidth * 1e6;

    const loBin = Math.max(0, Math.floor(((vfoHz - bwHz / 2 - startHz) / spanHz) * data.length));
    const hiBin = Math.min(data.length - 1, Math.ceil(((vfoHz + bwHz / 2 - startHz) / spanHz) * data.length));
    if (hiBin < 0 || loBin > data.length - 1 || hiBin < loBin) return none;

    let maxInBand = -Infinity;
    let sumInBand = 0;
    for (let i = loBin; i <= hiBin; i++) {
      if (data[i] > maxInBand) maxInBand = data[i];
      sumInBand += data[i];
    }
    const meanInBand = sumInBand / (hiBin - loBin + 1);

    // Median bin across the span as the noise reference (signals are sparse)
    const sorted = Array.from(data).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];

    return { max: maxInBand - median, mean: meanInBand - median };
  }

  private tuneByHz_(deltaHz: number): void {
    const modem = this.modem1_;
    if (!modem) return;
    const newHz = Math.max(1_000, Math.round(modem.frequency * 1e6) + deltaHz);
    this.receiver_?.handleModemFrequencyChange(1, newHz / 1e6);
    this.syncDomWithState_();
  }

  private setHandedness_(handedness: 'LHCP' | 'RHCP'): void {
    this.antenna_?.handleCircularHandednessChange(handedness);
    document.querySelector('#sdr-pol-rhcp')?.classList.toggle('active', handedness === 'RHCP');
    document.querySelector('#sdr-pol-lhcp')?.classList.toggle('active', handedness === 'LHCP');
  }

  // ==========================================================================
  // DISPLAYS
  // ==========================================================================

  private handleUpdate_(): void {
    const now = Date.now();

    if (now - this.lastRowTime_ >= SdrConsoleTab.DISPLAY_INTERVAL_MS) {
      this.lastRowTime_ = now;
      this.pushWaterfallRow_();
      this.drawSpectrum_();
    }

    if (now - this.lastSyncTime_ >= SdrConsoleTab.SYNC_INTERVAL_MS) {
      this.lastSyncTime_ = now;
      this.syncDomWithState_();
    }
  }

  /** Scroll the waterfall down one row and paint the newest spectrum on top */
  private pushWaterfallRow_(): void {
    const canvas = this.waterfallCanvas_;
    const ctx = this.waterfallCtx_;
    const specA = this.specA_;
    if (!canvas || !ctx || !specA) return;

    const data = specA.spectrumDataProcessor.combinedData;
    if (!data || data.length === 0) return;

    ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height - 1, 0, 1, canvas.width, canvas.height - 1);

    const row = ctx.createImageData(canvas.width, 1);
    for (let x = 0; x < canvas.width; x++) {
      const bin = Math.min(data.length - 1, Math.floor((x / canvas.width) * data.length));
      const [r, g, b] = WaterfallDisplay.amplitudeToColorRGB(data[bin], specA.state);
      const px = x * 4;
      row.data[px] = r;
      row.data[px + 1] = g;
      row.data[px + 2] = b;
      row.data[px + 3] = 255;
    }
    ctx.putImageData(row, 0, 0);
  }

  /** FFT-style spectrum trace above the waterfall */
  private drawSpectrum_(): void {
    const canvas = this.spectrumCanvas_;
    const ctx = this.spectrumCtx_;
    const specA = this.specA_;
    if (!canvas || !ctx || !specA) return;

    const data = specA.spectrumDataProcessor.combinedData;
    if (!data || data.length === 0) return;

    const { width, height } = canvas;
    const minDb = specA.state.minAmplitude;
    const maxDb = specA.state.maxAmplitude;
    const range = Math.max(1, maxDb - minDb);

    ctx.fillStyle = '#000814';
    ctx.fillRect(0, 0, width, height);

    // Gridlines every 10 dB with amplitude labels on the left
    ctx.strokeStyle = 'rgba(107, 114, 128, 0.25)';
    ctx.fillStyle = '#9ca3af';
    ctx.font = '9px "Courier New", monospace';
    ctx.lineWidth = 1;
    for (let db = Math.ceil(minDb / 10) * 10; db <= maxDb; db += 10) {
      const y = height - ((db - minDb) / range) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      if (y > 10) {
        ctx.fillText(`${db} dB`, 3, y - 2);
      }
    }

    // Trace with subtle fill
    ctx.beginPath();
    for (let x = 0; x < width; x++) {
      const bin = Math.min(data.length - 1, Math.floor((x / width) * data.length));
      const norm = Math.max(0, Math.min(1, (data[bin] - minDb) / range));
      const y = height - norm * height;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#67e8f9';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fillStyle = 'rgba(103, 232, 249, 0.12)';
    ctx.fill();
  }

  /** Band plan ribbon segments for the current span (static per scenario) */
  private renderBandPlan_(): void {
    const ribbon = this.dom_?.querySelector<HTMLElement>('#sdr-bandplan');
    const specA = this.specA_;
    if (!ribbon || !specA) return;

    const startHz = specA.state.centerFrequency - specA.state.span / 2;
    const spanHz = specA.state.span;

    ribbon.innerHTML = BAND_PLAN
      .filter((band) => band.highHz > startHz && band.lowHz < startHz + spanHz)
      .map((band) => {
        const left = Math.max(0, ((band.lowHz - startHz) / spanHz) * 100);
        const right = Math.min(100, ((band.highHz - startHz) / spanHz) * 100);
        return html`<div class="sdr-bandplan-seg" style="left: ${left}%; width: ${right - left}%;">${band.label}</div>`;
      })
      .join('');
  }

  /** Frequency tick labels under the waterfall (static per scenario) */
  private renderFreqTicks_(): void {
    const scale = this.dom_?.querySelector<HTMLElement>('#sdr-freq-scale');
    const specA = this.specA_;
    if (!scale || !specA) return;

    const startHz = specA.state.centerFrequency - specA.state.span / 2;
    const ticks: string[] = [];
    for (let i = 0; i <= 4; i++) {
      const freqMhz = (startHz + (i / 4) * specA.state.span) / 1e6;
      ticks.push(html`<span class="sdr-tick">${freqMhz.toFixed(3)}M</span>`);
    }
    scale.innerHTML = ticks.join('');
  }

  /** Position the VFO passband overlay over the spectrum + waterfall */
  private syncVfoOverlay_(modem: ReceiverModemState, dom: HTMLElement): void {
    const overlay = dom.querySelector<HTMLElement>('#sdr-vfo-overlay');
    const specA = this.specA_;
    if (!overlay || !specA) return;

    const startHz = specA.state.centerFrequency - specA.state.span / 2;
    const spanHz = specA.state.span;
    const vfoHz = modem.frequency * 1e6;
    const bwHz = modem.bandwidth * 1e6;

    const leftFrac = (vfoHz - bwHz / 2 - startHz) / spanHz;
    const widthFrac = bwHz / spanHz;

    if (leftFrac + widthFrac < 0 || leftFrac > 1) {
      overlay.style.display = 'none';
      return;
    }

    overlay.style.display = 'block';
    overlay.style.left = `${Math.max(0, leftFrac) * 100}%`;
    overlay.style.width = `${Math.min(1, leftFrac + widthFrac) * 100 - Math.max(0, leftFrac) * 100}%`;
  }

  // ==========================================================================
  // STATE SYNC
  // ==========================================================================

  private syncDomWithState_(): void {
    const dom = this.dom_;
    if (!dom) return;

    const modem = this.modem1_;
    const receiver = this.receiver_;
    if (!modem || !receiver) return;

    this.syncFreqDigits_(modem, dom);
    this.syncVfoOverlay_(modem, dom);

    // AFC checkbox reflects modem state (AFC itself retunes the VFO)
    const afcToggle = qs<HTMLInputElement>('#sdr-afc-toggle', dom);
    if (document.activeElement !== afcToggle) {
      afcToggle.checked = modem.isAfcEnabled === true;
    }

    // Radio config (skip fields the user is editing)
    const modeSelect = qs<HTMLSelectElement>('#sdr-mode-select', dom);
    if (document.activeElement !== modeSelect) {
      modeSelect.value = modem.modulation;
    }
    const fecSelect = qs<HTMLSelectElement>('#sdr-fec-select', dom);
    if (document.activeElement !== fecSelect) {
      fecSelect.value = modem.fec;
    }
    const bwInput = qs<HTMLInputElement>('#sdr-bw-input', dom);
    if (document.activeElement !== bwInput) {
      bwInput.value = (modem.bandwidth * 1e3).toFixed(0);
    }

    // RF gain slider + readout
    const gainSlider = qs<HTMLInputElement>('#sdr-gain-slider', dom);
    const lnbGain = this.lnb_?.state.gain ?? 0;
    if (document.activeElement !== gainSlider) {
      gainSlider.value = String(lnbGain);
    }
    qs<HTMLElement>('#sdr-gain-readout', dom).textContent = `${lnbGain.toFixed(1)} dB`;

    // Signal meter / lock / offset / ADC
    const info = receiver.getSignalsInBandwidth(modem);
    const cn = info.effectiveCnRatio_dB ?? info.cnRatio_dB;
    const hasCn = info.hasCarrier && Number.isFinite(cn);

    // Passband energy straight from the spectrum bins: a real SDR's S-meter
    // moves whenever energy is in the passband, even when the demodulator
    // can't make sense of it — without this, a carrier sitting plainly on the
    // waterfall reads as dead numbers ("graphs and numbers don't line up").
    const passbandExcess = this.passbandEnergyExcessDb_(modem);

    const meterFill = qs<HTMLElement>('#sdr-meter-fill', dom);
    const meterFrac = hasCn
      ? Math.max(0, Math.min(1, cn / 30))
      : Math.max(0, Math.min(1, passbandExcess.max / 30));
    meterFill.style.width = `${(meterFrac * 100).toFixed(0)}%`;

    qs<HTMLElement>('#sdr-cn-readout', dom).textContent = hasCn ? `${cn.toFixed(1)} dB` : '--.- dB';

    // Lock indicator diagnoses itself: the modem channel (BW) must bracket the
    // signal (like setting a satcom modem's symbol rate), the mode/FEC must
    // match, and only then does it lock.
    const lockIndicator = qs<HTMLElement>('#sdr-lock-indicator', dom);
    let lockText = 'NO LOCK';
    if (info.hasLock) {
      lockText = 'LOCKED';
    } else if (info.hasCarrier && (info.modulationMismatch || info.fecMismatch)) {
      lockText = 'MODE?';
    } else if (info.hasCarrier && info.isBandwidthClipped) {
      lockText = 'BW TOO WIDE';
    } else if (!info.hasCarrier && passbandExcess.mean > 3) {
      // The whole passband is lifted above the noise, but nothing the modem
      // accepts: the channel is narrower than the signal sitting in it
      lockText = 'BW TOO NARROW';
    }
    lockIndicator.textContent = lockText;
    lockIndicator.classList.toggle('locked', info.hasLock);
    lockIndicator.classList.toggle('hint', !info.hasLock && lockText !== 'NO LOCK');

    qs<HTMLElement>('#sdr-offset-readout', dom).textContent = info.hasCarrier
      ? `${info.frequencyOffset_Hz >= 0 ? '+' : ''}${Math.round(info.frequencyOffset_Hz)} Hz`
      : '--- Hz';

    const adcReadout = qs<HTMLElement>('#sdr-adc-readout', dom);
    if (info.adcDegradation) {
      const adc = info.adcDegradation;
      adcReadout.textContent = `${adc.inputLevel_dBFS.toFixed(1)} dBFS ${adc.status.toUpperCase()}`;
      adcReadout.classList.toggle('sdr-adc-bad', adc.status !== 'optimal');
    } else {
      adcReadout.textContent = '---';
      adcReadout.classList.remove('sdr-adc-bad');
    }

    qs<HTMLElement>('#sdr-status-tuning', dom).textContent =
      `VFO ${modem.frequency.toFixed(3)} MHz${modem.isAfcEnabled ? ' (AFC)' : ''} | ${modem.modulation} ${modem.fec}`;

    this.syncRotatorPanel_(dom);
    this.syncDecodePanel_(modem, dom);
  }

  /** Digit-wise VFO readout: 0.000.000.000 Hz grouped, leading zeros dimmed */
  private syncFreqDigits_(modem: ReceiverModemState, dom: HTMLElement): void {
    const container = qs<HTMLElement>('#sdr-freq-digits', dom);
    const freqHz = Math.max(0, Math.round(modem.frequency * 1e6));
    const digits = String(freqHz).padStart(10, '0');

    let leading = true;
    let out = '';
    for (let i = 0; i < 10; i++) {
      const place = 10 ** (9 - i);
      const ch = digits[i];
      if (ch !== '0') leading = false;
      // Group separators after GHz and MHz and kHz digits
      if (i === 1 || i === 4 || i === 7) {
        out += `<span class="sdr-digit-sep ${leading ? 'dim' : ''}">.</span>`;
      }
      out += `<span class="sdr-digit ${leading ? 'dim' : ''}" data-place="${place}">${ch}</span>`;
    }
    container.innerHTML = out;
  }

  /** Refresh rotator readouts (only present on steerable rigs) */
  private syncRotatorPanel_(dom: HTMLElement): void {
    const antenna = this.antenna_;
    if (!antenna || !this.isSteerable_) return;

    const azReadout = dom.querySelector<HTMLElement>('#sdr-rot-az');
    if (azReadout) {
      azReadout.textContent = `${antenna.state.azimuth.toFixed(1)}°`;
    }
    const elReadout = dom.querySelector<HTMLElement>('#sdr-rot-el');
    if (elReadout) {
      elReadout.textContent = `${antenna.state.elevation.toFixed(1)}°`;
    }

    const isTracking = antenna.state.trackingMode === 'program-track';

    const status = dom.querySelector<HTMLElement>('#sdr-rot-status');
    if (status) {
      let statusText = 'IDLE';
      if (isTracking) {
        const target = antenna.state.targetSatelliteId !== null
          ? SimulationManager.getInstance().getSatByNoradId(antenna.state.targetSatelliteId)?.name
          : null;
        statusText = target ? `TRACKING ${target}` : 'TRACKING';
      }
      status.textContent = statusText;
      status.classList.toggle('locked', isTracking);
    }

    const trackToggle = dom.querySelector<HTMLInputElement>('#sdr-rot-track');
    if (trackToggle && document.activeElement !== trackToggle) {
      trackToggle.checked = isTracking;
    }

    const targetSelect = dom.querySelector<HTMLSelectElement>('#sdr-rot-target');
    if (targetSelect && document.activeElement !== targetSelect && antenna.state.targetSatelliteId !== null) {
      targetSelect.value = String(antenna.state.targetSatelliteId);
    }
  }

  /** Show the decoded payload + station ID when the modem sees a matching signal */
  private syncDecodePanel_(modem: ReceiverModemState, dom: HTMLElement): void {
    const panel = qs<HTMLElement>('#sdr-decode-panel', dom);
    if (!this.receiver_) return;

    const visible = this.receiver_.getVisibleSignals(modem);
    const feedUrl = visible[0]?.feed || '';

    // RDS-style decoded identity line
    qs<HTMLElement>('#sdr-id-readout', dom).textContent = visible[0]?.signalId ?? '---';

    if (feedUrl === this.currentFeedUrl_) return;
    this.currentFeedUrl_ = feedUrl;

    if (!feedUrl) {
      panel.innerHTML = html`<span class="sdr-decode-nosignal">NO SIGNAL</span>`;
      return;
    }

    const isImage = /\.(png|jpe?g|gif|webp)$/i.test(feedUrl);
    panel.innerHTML = isImage
      ? html`<img class="sdr-decode-media" src="/images/${feedUrl}" alt="Decoded image" />`
      : html`<video class="sdr-decode-media" src="/videos/${feedUrl}" autoplay muted loop></video>`;
  }

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  public activate(): void {
    if (this.dom_) {
      this.dom_.style.display = 'block';
    }
  }

  public deactivate(): void {
    if (this.dom_) {
      this.dom_.style.display = 'none';
    }
  }

  public dispose(): void {
    EventBus.getInstance().off(Events.UPDATE, this.boundUpdateHandler_);
    this.dom_?.remove();
  }
}
