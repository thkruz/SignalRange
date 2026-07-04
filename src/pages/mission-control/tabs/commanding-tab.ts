import { BaseElement } from '@app/components/base-element';
import { CommandingManager, type CommandRejectReason } from '@app/commanding/commanding-manager';
import { html } from '@app/engine/utils/development/formatter';
import { qs } from '@app/engine/utils/query-selector';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import './commanding-tab.css';

/** Terse operator-facing reject reasons for the command history */
const REJECT_REASON_LABELS: Record<CommandRejectReason, string> = {
  'no-doppler-comp': 'Uplink not compensated',
  'key-invalid': 'COMSEC key invalid',
  'out-of-window': 'Outside command window',
};

/** Command status -> console display (ACK/NAK vocabulary) */
const STATUS_DISPLAY: Record<string, { label: string; cls: string }> = {
  acked: { label: 'ACK', cls: 'cmd-badge-good' },
  rejected: { label: 'NAK', cls: 'cmd-badge-bad' },
  pending: { label: 'QUEUED', cls: 'cmd-badge-muted' },
};

/**
 * CommandingTab - TT&C commanding console (nats-eu M2 uplink ops + M5 key ops)
 *
 * The operator engages uplink Doppler compensation, manages the COMSEC key
 * lifecycle (scheduled rotation, guarded emergency zeroize) and sends TT&C
 * commands during the pass window. Drives CommandingManager, whose state the
 * uplink-doppler-comp-enabled / command-acknowledged / key-rotation-completed /
 * zeroize-executed conditions read.
 *
 * Only registered when the scenario declares settings.commanding, so legacy
 * campaigns never see this tab.
 */
export class CommandingTab extends BaseElement {
  /** Throttle interval for passive DOM sync on the sim tick (ms) */
  private static readonly UPDATE_INTERVAL_MS = 1000;
  /** Maximum command-log rows rendered (latest first) */
  private static readonly MAX_LOG_ROWS = 12;

  private readonly boundUpdateHandler_: () => void;
  private readonly domCache_ = new Map<string, HTMLElement>();
  private lastSyncTime_ = 0;

  constructor(containerId: string) {
    super();
    this.init_(containerId, 'replace');
    this.dom_ = qs('.commanding-tab');

    this.boundUpdateHandler_ = this.throttledSync_.bind(this);
    EventBus.getInstance().on(Events.UPDATE, this.boundUpdateHandler_);

    this.syncDomWithState_();
    this.renderCommandLog_();
  }

  protected get html_(): string {
    const config = CommandingManager.getInstance().getConfig();
    const target = [
      config.groundStationId ? `Station ${config.groundStationId}` : null,
      config.targetNoradId !== undefined ? `NORAD ${config.targetNoradId}` : null,
    ].filter(Boolean).join(' → ') || 'Command uplink';

    const windowLabel = config.windowStartS !== undefined || config.windowEndS !== undefined
      ? `${CommandingTab.formatElapsed_(config.windowStartS ?? 0)} – ${config.windowEndS !== undefined ? CommandingTab.formatElapsed_(config.windowEndS) : 'end of mission'}`
      : 'Unrestricted';

    const stackRows = (config.commands ?? []).map((cmd) => html`
      <div class="cmd-stack-row d-flex align-items-center justify-content-between">
        <div>
          <span class="font-monospace fw-bold">${cmd.id}</span>
          ${cmd.label ? `<div class="text-muted small">${cmd.label}</div>` : ''}
        </div>
        <button class="btn btn-sm btn-outline-secondary" data-command-id="${cmd.id}">XMIT</button>
      </div>
    `).join('');

    return html`
      <div class="commanding-tab">
        <div class="row g-2 pb-6">
          <div class="col-12">
            <div class="d-flex justify-content-between align-items-center">
              <h2 class="cmd-title">TT&amp;C Commanding</h2>
              <span class="text-muted small">${target}</span>
            </div>
          </div>

          <div class="col-lg-4">
            <div class="card h-100">
              <div class="card-header"><h3 class="card-title">Command Uplink</h3></div>
              <div class="card-body">
                <div class="form-check form-switch mb-3">
                  <input type="checkbox" id="cmd-doppler" class="form-check-input" role="switch" />
                  <label for="cmd-doppler" class="form-check-label">Uplink Doppler Compensation</label>
                </div>
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <span class="text-muted small">Command window:</span>
                  <span class="fw-bold font-monospace small">${windowLabel}</span>
                </div>
                <div class="d-flex justify-content-between align-items-center">
                  <span class="text-muted small">Window status:</span>
                  <span id="cmd-window-badge" class="cmd-badge cmd-badge-muted">—</span>
                </div>
              </div>
            </div>
          </div>

          <div class="col-lg-4">
            <div class="card h-100">
              <div class="card-header"><h3 class="card-title">COMSEC</h3></div>
              <div class="card-body">
                <div class="d-flex justify-content-between align-items-center mb-3">
                  <span class="text-muted small">Key status:</span>
                  <span id="cmd-key-badge" class="cmd-badge cmd-badge-good">VALID</span>
                </div>
                <button id="cmd-begin-rotation" class="btn btn-outline-secondary w-100 mb-2">Initiate Key Rotation</button>
                <button id="cmd-complete-rotation" class="btn btn-outline-secondary w-100 mb-3">Confirm Key Rotation</button>
                <div class="cmd-zeroize-panel">
                  <div class="form-check form-switch mb-2">
                    <input type="checkbox" id="cmd-zeroize-arm" class="form-check-input" role="switch" />
                    <label for="cmd-zeroize-arm" class="form-check-label">Arm zeroize switch</label>
                  </div>
                  <button id="cmd-zeroize" class="btn btn-danger w-100" disabled>ZEROIZE KEY</button>
                </div>
              </div>
            </div>
          </div>

          <div class="col-lg-4">
            <div class="card h-100">
              <div class="card-header"><h3 class="card-title">Command Stack</h3></div>
              <div class="card-body" id="cmd-send-panel">
                ${stackRows}
                <label class="form-label small mt-2" for="cmd-custom-id">Manual mnemonic</label>
                <div class="input-group input-group-sm">
                  <input type="text" id="cmd-custom-id" class="form-control font-monospace" placeholder="PLD-SAFE" />
                  <button id="cmd-send-custom" class="btn btn-outline-secondary">XMIT</button>
                </div>
              </div>
            </div>
          </div>

          <div class="col-12">
            <div class="card">
              <div class="card-header"><h3 class="card-title">Command History</h3></div>
              <div class="card-body p-0">
                <table class="table table-sm cmd-log font-monospace mb-0">
                  <thead>
                    <tr><th>#</th><th>Mnemonic</th><th>Status</th><th>Detail</th></tr>
                  </thead>
                  <tbody id="cmd-log-body">
                    <tr><td colspan="4" class="text-muted">No commands transmitted.</td></tr>
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
    const doppler = document.getElementById('cmd-doppler') as HTMLInputElement | null;
    doppler?.addEventListener('change', () => {
      const mgr = CommandingManager.getInstance();
      if (mgr.state.dopplerCompEnabled !== doppler.checked) {
        mgr.setDopplerComp(doppler.checked);
      }
      this.syncDomWithState_();
    });

    document.getElementById('cmd-begin-rotation')?.addEventListener('click', () => {
      CommandingManager.getInstance().beginKeyRotation();
      this.syncDomWithState_();
    });

    document.getElementById('cmd-complete-rotation')?.addEventListener('click', () => {
      CommandingManager.getInstance().completeKeyRotation();
      this.syncDomWithState_();
    });

    const zeroizeArm = document.getElementById('cmd-zeroize-arm') as HTMLInputElement | null;
    zeroizeArm?.addEventListener('change', () => {
      const zeroizeBtn = document.getElementById('cmd-zeroize') as HTMLButtonElement | null;
      if (zeroizeBtn) {
        zeroizeBtn.disabled = !zeroizeArm.checked || CommandingManager.getInstance().state.zeroized;
      }
    });

    document.getElementById('cmd-zeroize')?.addEventListener('click', () => {
      CommandingManager.getInstance().zeroizeKey();
      this.syncDomWithState_();
    });

    // One delegated listener covers every canned-command button.
    document.getElementById('cmd-send-panel')?.addEventListener('click', (e) => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-command-id]');
      if (button?.dataset.commandId) {
        this.sendCommand_(button.dataset.commandId);
      }
    });

    document.getElementById('cmd-send-custom')?.addEventListener('click', () => {
      const input = document.getElementById('cmd-custom-id') as HTMLInputElement | null;
      const id = input?.value.trim();
      if (id) {
        this.sendCommand_(id);
        if (input) {
          input.value = '';
        }
      }
    });
  }

  private sendCommand_(id: string): void {
    CommandingManager.getInstance().sendCommand(id);
    this.renderCommandLog_();
  }

  private throttledSync_(): void {
    const now = Date.now();
    if (now - this.lastSyncTime_ < CommandingTab.UPDATE_INTERVAL_MS) {
      return;
    }
    this.lastSyncTime_ = now;
    this.syncDomWithState_();
  }

  private syncDomWithState_(): void {
    const mgr = CommandingManager.getInstance();

    // Doppler switch (skip while the user is interacting with it)
    const doppler = this.dom_?.querySelector<HTMLInputElement>('#cmd-doppler');
    if (doppler && document.activeElement !== doppler) {
      doppler.checked = mgr.state.dopplerCompEnabled;
    }

    // Window badge
    const windowBadge = this.cache_('cmd-window-badge');
    if (windowBadge) {
      const open = mgr.isWindowOpen();
      windowBadge.textContent = open ? 'OPEN' : 'CLOSED';
      windowBadge.className = `cmd-badge ${open ? 'cmd-badge-good' : 'cmd-badge-bad'}`;
    }

    // Key badge + rotation/zeroize control availability
    const keyBadge = this.cache_('cmd-key-badge');
    if (keyBadge) {
      const status = mgr.state.keyStatus;
      keyBadge.textContent = status.toUpperCase();
      const cls = status === 'Valid' ? 'cmd-badge-good' : (status === 'Pending Rotation' ? 'cmd-badge-warn' : 'cmd-badge-bad');
      keyBadge.className = `cmd-badge ${cls}`;
    }

    const zeroized = mgr.state.zeroized;
    const beginBtn = this.dom_?.querySelector<HTMLButtonElement>('#cmd-begin-rotation');
    const completeBtn = this.dom_?.querySelector<HTMLButtonElement>('#cmd-complete-rotation');
    const zeroizeBtn = this.dom_?.querySelector<HTMLButtonElement>('#cmd-zeroize');
    const zeroizeArm = this.dom_?.querySelector<HTMLInputElement>('#cmd-zeroize-arm');
    if (beginBtn) {
      beginBtn.disabled = zeroized;
    }
    if (completeBtn) {
      completeBtn.disabled = zeroized;
    }
    if (zeroizeBtn) {
      zeroizeBtn.disabled = zeroized || !zeroizeArm?.checked;
    }
  }

  private renderCommandLog_(): void {
    const body = this.cache_('cmd-log-body');
    if (!body) {
      return;
    }

    const commands = CommandingManager.getInstance().state.commands;
    if (commands.length === 0) {
      body.innerHTML = html`<tr><td colspan="4" class="text-muted">No commands transmitted.</td></tr>`;

      return;
    }

    const rows = commands
      .map((cmd, i) => ({ cmd, seq: i + 1 }))
      .slice(-CommandingTab.MAX_LOG_ROWS)
      .reverse();

    body.innerHTML = rows.map(({ cmd, seq }) => {
      const display = STATUS_DISPLAY[cmd.status] ?? STATUS_DISPLAY.pending;
      let detail = '';
      if (cmd.reason) {
        detail = REJECT_REASON_LABELS[cmd.reason];
      } else if (cmd.status === 'acked') {
        detail = 'ACK received';
      }

      return html`
        <tr>
          <td class="text-muted">${seq}</td>
          <td>${cmd.id}</td>
          <td><span class="cmd-badge ${display.cls}">${display.label}</span></td>
          <td class="text-muted">${detail}</td>
        </tr>
      `;
    }).join('');
  }

  private static formatElapsed_(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);

    return `T+${m}:${s.toString().padStart(2, '0')}`;
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
    this.renderCommandLog_();
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
