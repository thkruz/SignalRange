import { BaseElement } from '@app/components/base-element';
import { ElectronicAttackManager, type EaAssessment } from '@app/electronic-attack/electronic-attack-manager';
import { html } from '@app/engine/utils/development/formatter';
import { qs } from '@app/engine/utils/query-selector';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import './ea-assessment-tab.css';

/**
 * EaAssessmentTab - Electronic-attack / SATCOM denial battle-damage assessment
 * (Campaign 4). Read-only readout of the ElectronicAttackManager's live J/S
 * picture: whether a jam waveform is radiating in the target uplink band, if the
 * jam antenna is on target, the jam/victim powers at the transponder, and the
 * resulting J/S vs the denial threshold. Only registered when the scenario
 * declares settings.electronicAttack, so legacy campaigns never see this tab.
 */
export class EaAssessmentTab extends BaseElement {
  /** Throttle interval for passive DOM sync on the sim tick (ms) */
  private static readonly UPDATE_INTERVAL_MS = 500;

  private readonly boundUpdateHandler_: () => void;
  private readonly domCache_ = new Map<string, HTMLElement>();
  private lastSyncTime_ = 0;

  constructor(containerId: string) {
    super();
    this.init_(containerId, 'replace');
    this.dom_ = qs('.ea-assessment-tab');

    this.boundUpdateHandler_ = this.throttledSync_.bind(this);
    EventBus.getInstance().on(Events.UPDATE, this.boundUpdateHandler_);

    this.syncDomWithState_();
  }

  protected get html_(): string {
    return html`
      <div class="ea-assessment-tab">
        <div class="row g-2 pb-6">
          <div class="col-12">
            <div class="d-flex justify-content-between align-items-center">
              <h2 class="ea-title">Electronic Attack Assessment</h2>
              <span class="text-muted small">Target denial · jam-to-signal ratio</span>
            </div>
          </div>

          <div class="col-lg-4">
            <div class="card h-100">
              <div class="card-header"><h3 class="card-title">Denial Status</h3></div>
              <div class="card-body d-flex flex-column align-items-center justify-content-center">
                <div id="ea-status-badge" class="ea-status-badge ea-status-standby">STANDBY</div>
                <div id="ea-status-detail" class="text-muted small mt-2 text-center font-monospace"></div>
              </div>
            </div>
          </div>

          <div class="col-lg-8">
            <div class="card h-100">
              <div class="card-header"><h3 class="card-title">Link Assessment</h3></div>
              <div class="card-body">
                <table class="table table-sm ea-metrics font-monospace mb-0">
                  <tbody>
                    <tr><td>Jam radiating in target band</td><td id="ea-radiating" class="text-end"></td></tr>
                    <tr><td>Jam antenna on target</td><td id="ea-ontarget" class="text-end"></td></tr>
                    <tr><td>Pointing error</td><td id="ea-pointing" class="text-end"></td></tr>
                    <tr><td>Jam power @ transponder (J)</td><td id="ea-jam-power" class="text-end"></td></tr>
                    <tr><td>Victim carrier @ transponder (S)</td><td id="ea-victim-power" class="text-end"></td></tr>
                    <tr class="ea-jts-row"><td>Jam-to-signal ratio (J/S)</td><td id="ea-jts" class="text-end"></td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  protected addEventListeners_(): void {
    // Read-only tab: no interactive controls to wire.
  }

  private throttledSync_(): void {
    const now = Date.now();
    if (now - this.lastSyncTime_ < EaAssessmentTab.UPDATE_INTERVAL_MS) {
      return;
    }
    this.lastSyncTime_ = now;
    this.syncDomWithState_();
  }

  private syncDomWithState_(): void {
    const assessment = ElectronicAttackManager.isInitialized()
      ? ElectronicAttackManager.getInstance().getAssessment()
      : null;

    this.setBadge_(assessment);

    const yn = (v: boolean): string => (v ? 'YES' : 'no');
    this.setText_('ea-radiating', assessment ? yn(assessment.isRadiatingInBand) : '—');
    this.setText_('ea-ontarget', assessment ? yn(assessment.isOnTarget) : '—');
    this.setText_(
      'ea-pointing',
      assessment?.pointingErrorDeg !== null && assessment?.pointingErrorDeg !== undefined
        ? `${assessment.pointingErrorDeg.toFixed(1)}°`
        : '—',
    );
    this.setText_('ea-jam-power', EaAssessmentTab.dbm_(assessment?.jamPowerDbm ?? null));
    this.setText_('ea-victim-power', assessment ? EaAssessmentTab.dbm_(assessment.victimPowerDbm) : '—');
    this.setText_('ea-jts', assessment?.jToSDb !== null && assessment?.jToSDb !== undefined ? `${assessment.jToSDb.toFixed(1)} dB` : '—');
  }

  private setBadge_(assessment: EaAssessment | null): void {
    const badge = this.cache_('ea-status-badge');
    const detail = this.cache_('ea-status-detail');
    if (!badge) {
      return;
    }

    let label: string;
    let cls: string;
    let detailText: string;
    if (!assessment || (!assessment.isRadiatingInBand && !assessment.isOnTarget)) {
      label = 'STANDBY';
      cls = 'ea-status-standby';
      detailText = 'No jam waveform on the target uplink';
    } else if (assessment.isEffective) {
      label = 'DENIED';
      cls = 'ea-status-denied';
      detailText = 'Target link denied';
    } else {
      label = 'DEGRADED';
      cls = 'ea-status-degraded';
      detailText = assessment.isRadiatingInBand
        ? (assessment.isOnTarget ? 'On target — J/S below threshold' : 'Radiating — antenna off target')
        : 'Antenna on target — no jam in band';
    }

    badge.textContent = label;
    badge.className = `ea-status-badge ${cls}`;
    if (detail) {
      detail.textContent = detailText;
    }
  }

  private setText_(id: string, value: string): void {
    const el = this.cache_(id);
    if (el) {
      el.textContent = value;
    }
  }

  private static dbm_(v: number | null): string {
    return v === null ? '—' : `${v.toFixed(1)} dBm`;
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
