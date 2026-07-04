/**
 * DOM-level proof that the nats-eu (Campaign 2) operator console tabs are
 * click-through playable. Each tab is constructed against the REAL
 * natsEuSandboxData.settings and driven through real DOM interactions (clicks,
 * input, change events); assertions check the exact manager predicates the
 * ObjectivesManager condition evaluators read - the same predicates proven at
 * the engine layer by test/campaigns/nats-eu-mechanics.test.ts.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { natsEuSandboxData } from '../../../../src/campaigns/nats-eu/sandbox';
import { CommandingManager } from '../../../../src/commanding/commanding-manager';
import { ContactScheduleManager } from '../../../../src/contact-schedule/contact-schedule-manager';
import { EventBus } from '../../../../src/events/event-bus';
import { LinkBudgetManager } from '../../../../src/link-budget/link-budget-manager';
import { CommandingTab } from '../../../../src/pages/mission-control/tabs/commanding-tab';
import { ContactScheduleTab } from '../../../../src/pages/mission-control/tabs/contact-schedule-tab';
import { LinkBudgetTab } from '../../../../src/pages/mission-control/tabs/link-budget-tab';
import { SecurityConsoleTab } from '../../../../src/pages/mission-control/tabs/security-console-tab';
import { ScenarioManager } from '../../../../src/scenario-manager';
import { SecurityConsoleCore } from '../../../../src/security-console/security-console-core';
import { TransecManager } from '../../../../src/transec/transec-manager';
import type { GroundStation } from '../../../../src/assets/ground-station/ground-station';

/** Minimal receiver stub delivering a live 12 dB C/N on the active modem. */
const stubGroundStation = (snrDb: number | null): GroundStation => ({
  receivers: [{
    state: { activeModem: 1, modems: [{ modemNumber: 1, isPowered: true }] },
    getSnrForModem: () => snrDb,
  }],
}) as unknown as GroundStation;

const setInput = (id: string, value: string): void => {
  const input = document.getElementById(id) as HTMLInputElement;
  expect(input).not.toBeNull();
  input.value = value;
};

const click = (id: string): void => {
  const el = document.getElementById(id) as HTMLElement;
  expect(el).not.toBeNull();
  el.click();
};

beforeEach(() => {
  ScenarioManager.getInstance().settings = natsEuSandboxData.settings;
  const container = document.createElement('div');
  container.id = 'canvas-content';
  document.body.appendChild(container);
});

afterEach(() => {
  LinkBudgetManager.destroy();
  CommandingManager.destroy();
  ContactScheduleManager.destroy();
  SecurityConsoleCore.destroy();
  TransecManager.destroy();
  EventBus.destroy();
  document.body.innerHTML = '';
});

describe('LinkBudgetTab (M1)', () => {
  it('computes the worksheet and commits the live margin through clicks', () => {
    const tab = new LinkBudgetTab(stubGroundStation(12), 'canvas-content');

    // Correct worksheet (same numbers the engine test proves yield ~14 dB C/N).
    setInput('lb-eirp', '50');
    setInput('lb-fspl', '180.7');
    setInput('lb-rxgain', '44.5');
    setInput('lb-noisetemp', '120');
    setInput('lb-bandwidth', '36');
    setInput('lb-miscloss', '2');
    click('lb-compute');

    expect(LinkBudgetManager.getInstance().isBudgetComputedCorrectly()).toBe(true);
    expect(document.getElementById('lb-accept-badge')?.textContent).toBe('IN FAMILY');

    // Live C/N is 12 dB vs threshold 8 -> commit yields 4 dB margin >= 3 required.
    const commitBtn = document.getElementById('lb-commit') as HTMLButtonElement;
    expect(commitBtn.disabled).toBe(false);
    click('lb-commit');

    expect(LinkBudgetManager.getInstance().isMarginMet()).toBe(true);
    expect(document.getElementById('lb-margin-badge')?.textContent).toBe('LINK GO');

    tab.dispose();
  });

  it('rejects an incomplete worksheet and blocks commit with no carrier', () => {
    const tab = new LinkBudgetTab(stubGroundStation(null), 'canvas-content');

    click('lb-compute');
    expect(LinkBudgetManager.getInstance().state.computedCNRDb).toBeNull();
    expect(document.getElementById('lb-worksheet-hint')?.textContent).toContain('all fields required');

    // No carrier on the active modem -> the link cannot be committed.
    expect((document.getElementById('lb-commit') as HTMLButtonElement).disabled).toBe(true);

    tab.dispose();
  });
});

describe('CommandingTab (M2/M5)', () => {
  it('drives Doppler comp, canned command sends, key rotation, and guarded zeroize', () => {
    const tab = new CommandingTab('canvas-content');
    const mgr = CommandingManager.getInstance();

    // Command sent without Doppler comp is rejected.
    const canned = document.querySelector<HTMLButtonElement>('button[data-command-id="PLD-SAFE"]');
    expect(canned).not.toBeNull();
    canned!.click();
    expect(mgr.isCommandAcknowledged()).toBe(false);

    // Engage Doppler comp via the switch, then the same command ACKs.
    const doppler = document.getElementById('cmd-doppler') as HTMLInputElement;
    doppler.checked = true;
    doppler.dispatchEvent(new Event('change', { bubbles: true }));
    expect(mgr.state.dopplerCompEnabled).toBe(true);

    canned!.click();
    expect(mgr.isCommandAcknowledged('PLD-SAFE')).toBe(true);

    // Manual command id path.
    setInput('cmd-custom-id', 'CUSTOM-1');
    click('cmd-send-custom');
    expect(mgr.isCommandAcknowledged('CUSTOM-1')).toBe(true);

    // Key rotation lifecycle.
    click('cmd-begin-rotation');
    expect(mgr.state.keyStatus).toBe('Pending Rotation');
    click('cmd-complete-rotation');
    expect(mgr.state.keyRotationCompleted).toBe(true);

    // Zeroize is guarded: disabled until armed.
    const zeroizeBtn = document.getElementById('cmd-zeroize') as HTMLButtonElement;
    expect(zeroizeBtn.disabled).toBe(true);
    const arm = document.getElementById('cmd-zeroize-arm') as HTMLInputElement;
    arm.checked = true;
    arm.dispatchEvent(new Event('change', { bubbles: true }));
    expect(zeroizeBtn.disabled).toBe(false);
    zeroizeBtn.click();
    expect(mgr.state.zeroized).toBe(true);

    tab.dispose();
  });
});

describe('ContactScheduleTab (M3)', () => {
  it('assigns contacts via the station selects until the plan is valid', () => {
    const tab = new ContactScheduleTab('canvas-content');
    const mgr = ContactScheduleManager.getInstance();

    const assign = (contactId: string, stationId: string): void => {
      const select = document.querySelector<HTMLSelectElement>(`select[data-contact-id="${contactId}"]`);
      expect(select).not.toBeNull();
      select!.value = stationId;
      select!.dispatchEvent(new Event('change', { bubbles: true }));
    };

    expect(mgr.isPlanValid()).toBe(false);
    expect(document.getElementById('cs-plan-badge')?.textContent).toBe('UNALLOCATED');

    assign('SAR1-P1', 'GW-01');
    expect(mgr.isContactAssigned('SAR1-P1', 'GW-01')).toBe(true);

    assign('SAR2-P1', 'SH-02');
    expect(mgr.isPlanValid()).toBe(true);
    expect(document.getElementById('cs-plan-badge')?.textContent).toBe('DECONFLICTED');

    // Unassigning a required contact drops the plan back to incomplete.
    assign('SAR2-P1', '');
    expect(mgr.isPlanValid()).toBe(false);

    tab.dispose();
  });
});

describe('SecurityConsoleTab (M6/M7)', () => {
  it('reviews the audit log, flags an anomaly, and applies access control', () => {
    const tab = new SecurityConsoleTab('canvas-content');
    const core = SecurityConsoleCore.getInstance();

    click('sec-mark-reviewed');
    expect(core.isReviewed).toBe(true);

    const flag = document.querySelector<HTMLButtonElement>('button[data-event-id="evt-replay"]');
    expect(flag).not.toBeNull();
    flag!.click();
    expect(core.isEventAcknowledged('evt-replay')).toBe(true);

    const account = document.querySelector<HTMLSelectElement>('select[data-account-id="op-guest"]');
    expect(account).not.toBeNull();
    account!.value = 'disabled';
    account!.dispatchEvent(new Event('change', { bubbles: true }));
    expect(core.getAccountStatus('op-guest')).toBe('disabled');

    tab.dispose();
  });

  it('locks TRANSEC hop-sync only in hopping mode with a loaded key', () => {
    const tab = new SecurityConsoleTab('canvas-content');
    const mgr = TransecManager.getInstance();

    const mode = document.getElementById('sec-transec-mode') as HTMLSelectElement;
    mode.value = 'hopping';
    mode.dispatchEvent(new Event('change', { bubbles: true }));
    expect(mgr.isModeSet('hopping')).toBe(true);
    expect(mgr.isSyncLocked()).toBe(false);

    click('sec-transec-load-key');
    expect(mgr.isSyncLocked()).toBe(true);
    expect(document.getElementById('sec-transec-sync-badge')?.textContent).toBe('SYNC LOCKED');

    click('sec-transec-drop-key');
    expect(mgr.isSyncLocked()).toBe(false);

    tab.dispose();
  });
});
