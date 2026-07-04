import { GroundStation } from '@app/assets/ground-station/ground-station';
import { BaseElement } from '@app/components/base-element';
import { html } from '@app/engine/utils/development/formatter';
import { qs } from '@app/engine/utils/query-selector';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { LinkBudgetManager, type LinkBudgetInputs } from '@app/link-budget/link-budget-manager';
import './link-budget-tab.css';

/**
 * LinkBudgetTab - Link analysis console (nats-eu M1)
 *
 * Mirrors a real link-verification workflow: the PREDICTED panel is the Friis
 * budget the operator runs before the pass (cross-checked against the ATP card
 * - "in family" / "out of family"), the MEASURED panel shows the C/N the
 * configured chain actually delivers and lets the operator accept the link
 * against the GO/NO-GO margin criteria. Drives LinkBudgetManager, whose state
 * the link-budget-computed / link-margin-met conditions read.
 *
 * Only registered when the scenario declares settings.linkBudget, so legacy
 * campaigns never see this tab.
 */
export class LinkBudgetTab extends BaseElement {
  /** Throttle interval for the live measured-C/N readout on the sim tick (ms) */
  private static readonly UPDATE_INTERVAL_MS = 500;

  private readonly groundStation_: GroundStation;
  private readonly boundUpdateHandler_: () => void;
  private readonly domCache_ = new Map<string, HTMLElement>();
  private lastSyncTime_ = 0;

  constructor(groundStation: GroundStation, containerId: string) {
    super();
    this.groundStation_ = groundStation;
    this.init_(containerId, 'replace');
    this.dom_ = qs('.link-budget-tab');

    this.boundUpdateHandler_ = this.throttledSync_.bind(this);
    EventBus.getInstance().on(Events.UPDATE, this.boundUpdateHandler_);

    this.syncDomWithState_();
    this.renderPlanningResult_();
    this.renderCommitResult_();
  }

  protected get html_(): string {
    const config = LinkBudgetManager.getInstance().getConfig();

    return html`
      <div class="link-budget-tab">
        <div class="row g-2 pb-6">
          <div class="col-12">
            <div class="d-flex justify-content-between align-items-center">
              <h2 class="lb-title">Link Analysis</h2>
              <span class="text-muted small">${config?.label ?? 'Link verification'}</span>
            </div>
          </div>

          <div class="col-lg-7">
            <div class="card h-100">
              <div class="card-header"><h3 class="card-title">Downlink Budget — Predicted</h3></div>
              <div class="card-body">
                <div class="row g-2">
                  <div class="col-6">
                    <label class="form-label small" for="lb-eirp">Satellite EIRP</label>
                    <div class="input-group input-group-sm">
                      <input type="number" id="lb-eirp" class="form-control font-monospace" step="0.1" />
                      <span class="input-group-text">dBm</span>
                    </div>
                  </div>
                  <div class="col-6">
                    <label class="form-label small" for="lb-fspl">Free-space path loss</label>
                    <div class="input-group input-group-sm">
                      <input type="number" id="lb-fspl" class="form-control font-monospace" step="0.1" />
                      <span class="input-group-text">dB</span>
                    </div>
                  </div>
                  <div class="col-6">
                    <label class="form-label small" for="lb-rxgain">RX antenna gain</label>
                    <div class="input-group input-group-sm">
                      <input type="number" id="lb-rxgain" class="form-control font-monospace" step="0.1" />
                      <span class="input-group-text">dBi</span>
                    </div>
                  </div>
                  <div class="col-6">
                    <label class="form-label small" for="lb-noisetemp">System noise temp</label>
                    <div class="input-group input-group-sm">
                      <input type="number" id="lb-noisetemp" class="form-control font-monospace" step="1" min="1" />
                      <span class="input-group-text">K</span>
                    </div>
                  </div>
                  <div class="col-6">
                    <label class="form-label small" for="lb-bandwidth">Occupied bandwidth</label>
                    <div class="input-group input-group-sm">
                      <input type="number" id="lb-bandwidth" class="form-control font-monospace" step="0.1" min="0.001" />
                      <span class="input-group-text">MHz</span>
                    </div>
                  </div>
                  <div class="col-6">
                    <label class="form-label small" for="lb-miscloss">Implementation loss</label>
                    <div class="input-group input-group-sm">
                      <input type="number" id="lb-miscloss" class="form-control font-monospace" step="0.1" value="0" />
                      <span class="input-group-text">dB</span>
                    </div>
                  </div>
                </div>
                <button id="lb-compute" class="btn btn-primary w-100 mt-3">Compute C/N</button>
                <div id="lb-worksheet-hint" class="text-muted small mt-2"></div>
                <div class="d-flex justify-content-between align-items-center mt-3 pt-2 lb-result-strip">
                  <span class="text-muted small">Predicted C/N:</span>
                  <span id="lb-computed-cnr" class="fw-bold font-monospace">—</span>
                  <span id="lb-accept-badge" class="lb-badge lb-badge-muted">NO SOLUTION</span>
                </div>
                <div class="text-muted small mt-2">Cross-check against the ATP card for this pass.</div>
              </div>
            </div>
          </div>

          <div class="col-lg-5">
            <div class="card h-100">
              <div class="card-header"><h3 class="card-title">Link Verification — Measured</h3></div>
              <div class="card-body">
                <table class="table table-sm lb-metrics font-monospace mb-2">
                  <tbody>
                    <tr><td>Measured C/N (active modem)</td><td id="lb-live-cnr" class="text-end">—</td></tr>
                    <tr><td>Demod threshold</td><td class="text-end">${config ? `${config.thresholdCNRDb.toFixed(1)} dB` : '—'}</td></tr>
                    <tr><td>Required margin</td><td class="text-end">${config ? `${(config.requiredMarginDb ?? 3).toFixed(1)} dB` : '—'}</td></tr>
                    <tr><td>Live margin</td><td id="lb-predicted-margin" class="text-end">—</td></tr>
                  </tbody>
                </table>
                <button id="lb-commit" class="btn btn-primary w-100" disabled>Accept Link</button>
                <div class="d-flex justify-content-between align-items-center mt-3">
                  <span class="text-muted small">Accepted margin:</span>
                  <span id="lb-applied-margin" class="fw-bold font-monospace">—</span>
                </div>
                <div class="d-flex justify-content-center mt-2">
                  <div id="lb-margin-badge" class="lb-badge lb-badge-muted">PENDING</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  protected addEventListeners_(): void {
    const computeBtn = document.getElementById('lb-compute');
    computeBtn?.addEventListener('click', this.computeHandler_.bind(this));

    const commitBtn = document.getElementById('lb-commit');
    commitBtn?.addEventListener('click', this.commitHandler_.bind(this));
  }

  private computeHandler_(): void {
    const hint = this.cache_('lb-worksheet-hint');
    const inputs = this.readWorksheet_();
    if (!inputs) {
      if (hint) {
        hint.textContent = 'Budget incomplete — all fields required.';
      }

      return;
    }

    if (hint) {
      hint.textContent = '';
    }
    LinkBudgetManager.getInstance().computeCNR(inputs);
    this.renderPlanningResult_();
  }

  private commitHandler_(): void {
    const achievedCNRDb = this.getLiveCNR_();
    if (achievedCNRDb === null) {
      return;
    }
    LinkBudgetManager.getInstance().commitLink(achievedCNRDb);
    this.renderCommitResult_();
  }

  /** Parse the budget fields; null if any required field is empty/invalid. */
  private readWorksheet_(): LinkBudgetInputs | null {
    const read = (id: string): number => {
      const input = this.dom_?.querySelector<HTMLInputElement>(`#${id}`);

      return input && input.value !== '' ? Number(input.value) : NaN;
    };

    const eirpDbm = read('lb-eirp');
    const fsplDb = read('lb-fspl');
    const rxGainDbi = read('lb-rxgain');
    const systemNoiseTempK = read('lb-noisetemp');
    const bandwidthMHz = read('lb-bandwidth');
    const miscLossRaw = read('lb-miscloss');

    if ([eirpDbm, fsplDb, rxGainDbi, systemNoiseTempK, bandwidthMHz].some((v) => Number.isNaN(v)) ||
      systemNoiseTempK <= 0 || bandwidthMHz <= 0) {
      return null;
    }

    return {
      eirpDbm,
      fsplDb,
      rxGainDbi,
      systemNoiseTempK,
      bandwidthHz: bandwidthMHz * 1e6,
      miscLossDb: Number.isNaN(miscLossRaw) ? 0 : miscLossRaw,
    };
  }

  /** Live C/N delivered by the active modem of the station's receiver. */
  private getLiveCNR_(): number | null {
    const receiver = this.groundStation_.receivers[0];
    if (!receiver) {
      return null;
    }
    const modem = receiver.state.modems.find((m) => m.modemNumber === receiver.state.activeModem);
    if (!modem?.isPowered) {
      return null;
    }

    return receiver.getSnrForModem(modem);
  }

  private throttledSync_(): void {
    const now = Date.now();
    if (now - this.lastSyncTime_ < LinkBudgetTab.UPDATE_INTERVAL_MS) {
      return;
    }
    this.lastSyncTime_ = now;
    this.syncDomWithState_();
  }

  /** Passive sync: measured C/N readout + accept availability. Never touches the budget inputs. */
  private syncDomWithState_(): void {
    const config = LinkBudgetManager.getInstance().getConfig();
    const liveCNR = this.getLiveCNR_();

    this.setText_('lb-live-cnr', liveCNR !== null ? `${liveCNR.toFixed(1)} dB` : '—');
    this.setText_(
      'lb-predicted-margin',
      liveCNR !== null && config ? `${(liveCNR - config.thresholdCNRDb).toFixed(1)} dB` : '—',
    );

    const commitBtn = this.dom_?.querySelector<HTMLButtonElement>('#lb-commit');
    if (commitBtn) {
      commitBtn.disabled = liveCNR === null;
    }
  }

  private renderPlanningResult_(): void {
    const mgr = LinkBudgetManager.getInstance();
    const computed = mgr.state.computedCNRDb;

    this.setText_('lb-computed-cnr', computed !== null ? `${computed.toFixed(1)} dB` : '—');

    const badge = this.cache_('lb-accept-badge');
    if (!badge) {
      return;
    }
    if (computed === null) {
      badge.textContent = 'NO SOLUTION';
      badge.className = 'lb-badge lb-badge-muted';
    } else if (mgr.isBudgetComputedCorrectly()) {
      badge.textContent = 'IN FAMILY';
      badge.className = 'lb-badge lb-badge-good';
    } else {
      badge.textContent = 'OUT OF FAMILY';
      badge.className = 'lb-badge lb-badge-bad';
    }
  }

  private renderCommitResult_(): void {
    const mgr = LinkBudgetManager.getInstance();
    const margin = mgr.state.appliedMarginDb;

    this.setText_('lb-applied-margin', margin !== null ? `${margin.toFixed(1)} dB` : '—');

    const badge = this.cache_('lb-margin-badge');
    if (!badge) {
      return;
    }
    if (margin === null) {
      badge.textContent = 'PENDING';
      badge.className = 'lb-badge lb-badge-muted';
    } else if (mgr.isMarginMet()) {
      badge.textContent = 'LINK GO';
      badge.className = 'lb-badge lb-badge-good';
    } else {
      badge.textContent = 'NO-GO';
      badge.className = 'lb-badge lb-badge-bad';
    }
  }

  private setText_(id: string, value: string): void {
    const el = this.cache_(id);
    if (el) {
      el.textContent = value;
    }
  }

  private cache_(id: string): HTMLElement | null {
    const cached = this.domCache_.get(id);
    if (cached) {
      return cached;
    }
    const el = this.dom_?.querySelector<HTMLElement>(`#${id}`) ?? null;
    if (el) {
      this.domCache_.set(id, el);
    }

    return el;
  }

  public activate(): void {
    if (this.dom_) {
      this.dom_.style.display = 'block';
    }
    this.syncDomWithState_();
  }

  public deactivate(): void {
    if (this.dom_) {
      this.dom_.style.display = 'none';
    }
  }

  public dispose(): void {
    EventBus.getInstance().off(Events.UPDATE, this.boundUpdateHandler_);
    this.domCache_.clear();
    this.dom_?.remove();
  }
}
