import { BaseElement } from '@app/components/base-element';
import { ContactScheduleManager } from '@app/contact-schedule/contact-schedule-manager';
import { html } from '@app/engine/utils/development/formatter';
import { qs } from '@app/engine/utils/query-selector';
import './contact-schedule-tab.css';

/**
 * ContactScheduleTab - Multi-station pass allocation console (nats-eu M3)
 *
 * The operator allocates each upcoming pass/contact to one of the EU stations.
 * Two contacts on the same station with overlapping windows is a conflict;
 * leaving a required-priority contact unassigned keeps the plan incomplete.
 * Drives ContactScheduleManager, whose state the contact-assigned /
 * contact-plan-valid conditions read.
 *
 * Only registered when the scenario declares settings.contactSchedule, so
 * legacy campaigns never see this tab. Purely action-driven: nothing here is
 * time-dependent, so no sim-tick listener is needed.
 */
export class ContactScheduleTab extends BaseElement {
  private readonly domCache_ = new Map<string, HTMLElement>();

  constructor(containerId: string) {
    super();
    this.init_(containerId, 'replace');
    this.dom_ = qs('.contact-schedule-tab');

    this.renderPlanStatus_();
  }

  protected get html_(): string {
    const mgr = ContactScheduleManager.getInstance();
    const config = mgr.getConfig();

    const stationOptions = (assigned: string | undefined): string => [
      `<option value="" ${assigned === undefined ? 'selected' : ''}>— Unallocated</option>`,
      ...config.stationIds.map((id) => `<option value="${id}" ${assigned === id ? 'selected' : ''}>${id}</option>`),
    ].join('');

    const rows = config.contacts.map((contact) => html`
      <tr>
        <td>
          <span class="fw-bold">${contact.label ?? contact.id}</span>
          <span class="text-muted small ms-1 font-monospace">${contact.id}</span>
        </td>
        <td class="font-monospace">${contact.satelliteNoradId}</td>
        <td><span class="cs-priority">P${contact.priority}</span></td>
        <td class="font-monospace small">
          ${ContactScheduleTab.formatElapsed_(contact.windowStartS)} – ${ContactScheduleTab.formatElapsed_(contact.windowEndS)}
        </td>
        <td>
          <select class="form-select form-select-sm cs-station-select" data-contact-id="${contact.id}">
            ${stationOptions(mgr.getAssignment(contact.id))}
          </select>
        </td>
      </tr>
    `).join('');

    const requiredNote = config.requiredPriorityAtOrAbove !== undefined
      ? `All P${config.requiredPriorityAtOrAbove} and higher-priority contacts must be allocated.`
      : 'Every contact must be allocated.';

    return html`
      <div class="contact-schedule-tab">
        <div class="row g-2 pb-6">
          <div class="col-12">
            <div class="d-flex justify-content-between align-items-center">
              <h2 class="cs-title">Ground Network Contact Plan</h2>
              <span class="text-muted small">Sites: ${config.stationIds.join(' · ')}</span>
            </div>
          </div>

          <div class="col-lg-8">
            <div class="card h-100">
              <div class="card-header"><h3 class="card-title">Contact Allocation</h3></div>
              <div class="card-body p-0">
                <table class="table table-sm cs-contacts mb-0">
                  <thead>
                    <tr><th>Contact</th><th>NORAD</th><th>PRI</th><th>AOS – LOS</th><th>Site</th></tr>
                  </thead>
                  <tbody id="cs-contacts-body">${rows}</tbody>
                </table>
              </div>
            </div>
          </div>

          <div class="col-lg-4">
            <div class="card h-100">
              <div class="card-header"><h3 class="card-title">Deconfliction</h3></div>
              <div class="card-body">
                <div class="d-flex justify-content-center mb-3">
                  <div id="cs-plan-badge" class="cs-badge cs-badge-warn">UNALLOCATED</div>
                </div>
                <div class="text-muted small mb-3">${requiredNote}</div>
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <span class="text-muted small">Unallocated (required):</span>
                  <span id="cs-unassigned-count" class="fw-bold font-monospace">—</span>
                </div>
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <span class="text-muted small">Conflicts:</span>
                  <span id="cs-conflict-count" class="fw-bold font-monospace">—</span>
                </div>
                <ul id="cs-conflict-list" class="cs-conflict-list list-unstyled small mb-0"></ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  protected addEventListeners_(): void {
    // One delegated listener covers every per-contact station select.
    document.getElementById('cs-contacts-body')?.addEventListener('change', (e) => {
      const select = (e.target as HTMLElement).closest<HTMLSelectElement>('select[data-contact-id]');
      if (!select?.dataset.contactId) {
        return;
      }

      const mgr = ContactScheduleManager.getInstance();
      if (select.value === '') {
        mgr.unassign(select.dataset.contactId);
      } else {
        mgr.assign(select.dataset.contactId, select.value);
      }
      this.renderPlanStatus_();
    });
  }

  private renderPlanStatus_(): void {
    const mgr = ContactScheduleManager.getInstance();
    const config = mgr.getConfig();
    const conflicts = mgr.getConflicts();

    const requiredAtOrAbove = config.requiredPriorityAtOrAbove ?? Number.POSITIVE_INFINITY;
    const unassignedRequired = config.contacts
      .filter((c) => c.priority <= requiredAtOrAbove && !mgr.isContactAssigned(c.id));

    this.setText_('cs-unassigned-count', unassignedRequired.length.toString());
    this.setText_('cs-conflict-count', conflicts.length.toString());

    const list = this.cache_('cs-conflict-list');
    if (list) {
      list.innerHTML = conflicts.map((c) => html`
        <li class="cs-conflict-item font-monospace">${c.contactA} × ${c.contactB} on ${c.stationId}</li>
      `).join('');
    }

    const badge = this.cache_('cs-plan-badge');
    if (!badge) {
      return;
    }
    if (mgr.isPlanValid()) {
      badge.textContent = 'DECONFLICTED';
      badge.className = 'cs-badge cs-badge-good';
    } else if (conflicts.length > 0) {
      badge.textContent = 'CONFLICT';
      badge.className = 'cs-badge cs-badge-bad';
    } else {
      badge.textContent = 'UNALLOCATED';
      badge.className = 'cs-badge cs-badge-warn';
    }
  }

  private static formatElapsed_(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);

    return `T+${m}:${s.toString().padStart(2, '0')}`;
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
    this.renderPlanStatus_();
  }

  public deactivate(): void {
    if (this.dom_) {
      this.dom_.style.display = 'none';
    }
  }

  public dispose(): void {
    this.domCache_.clear();
    this.dom_?.remove();
  }
}
