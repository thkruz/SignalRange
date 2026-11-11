/**
 * M16 records panel: hidden without a ledger, record vs site table, accept refused on a
 * discrepancy, correction request flow, notice inbox with versions and unread marks; plus the
 * optional choice labels on ClaimRule.
 */

import { FieldHandoverPanel } from '@app/pages/mission-control/tabs/field-handover-panel';
import { FieldRecordsPanel } from '@app/pages/mission-control/tabs/field-records-panel';
import { type EquipmentConfig, EquipmentLedger } from '@app/physical/equipment-records';
import { FieldRecords, type FieldRecordsDeps, type HandoverFormConfig } from '@app/physical/field-records';
import { describe, expect, it } from 'vitest';

const CFG: EquipmentConfig = {
  units: [
    {
      unitId: 'u1',
      label: 'SkyLink terminal',
      record: { serial: 'SN-1', accountId: 'acct-a', configVersion: 'v1' },
      installed: { serial: 'SN-1', accountId: 'acct-b', configVersion: 'v1' },
    },
    { unitId: 'u2', label: 'Router', record: { serial: 'SN-2', accountId: 'acct-a', configVersion: 'v1' } },
  ],
  notices: [
    { id: 'n1', version: 1, providerId: 'skylink-ops', affects: {}, kind: 'maintenance', issuedAtS: 10, text: 'Maintenance window tonight.' },
    { id: 'n1', version: 2, providerId: 'skylink-ops', affects: {}, kind: 'maintenance', issuedAtS: 50, text: 'Maintenance window moved.' },
    { id: 'n2', version: 1, providerId: 'skylink-ops', affects: {}, kind: 'ground-capacity', issuedAtS: 30, text: 'Ground capacity reduced.' },
  ],
  requests: [{ id: 'req1', unitId: 'u1', field: 'accountId', to: 'acct-b', responseEventId: 'ev1' }],
};

function rig(withLedger = true) {
  let t = 100;
  const ledger = withLedger ? new EquipmentLedger(CFG, () => t) : null;
  const deps: FieldRecordsDeps = { plant: null as never, service: null, evidence: null, runs: () => [], getCardVersion: () => 1, equipment: ledger };
  const records = new FieldRecords([], deps);
  const host = document.createElement('div');
  const panel = new FieldRecordsPanel(host, { records: () => (withLedger ? records : null) });

  return { ledger: ledger as EquipmentLedger, host, panel, tick: (s: number) => (t += s) };
}

describe('M16 records panel', () => {
  it('is hidden without a ledger', () => {
    const r = rig(false);
    r.panel.sync();
    expect(r.host.style.display).toBe('none');
  });

  it('shows record against site and marks differences', () => {
    const r = rig();
    r.panel.sync();
    expect(r.host.textContent).toContain('SkyLink terminal');
    expect(r.host.querySelector('[data-frp-row="u1:accountId"]')?.textContent).toContain('Differs');
    expect(r.host.querySelector('[data-frp-row="u1:serial"]')?.textContent).toContain('Matches');
  });

  it('refuses to accept a unit with a difference and accepts a clean one', () => {
    const r = rig();
    r.panel.sync();
    expect(r.panel.accept('u1')).toBe(false);
    expect(r.host.querySelector('[data-frp="msg"]')?.textContent).toContain('1 difference');
    expect(r.ledger.isAccepted('u1')).toBe(false);
    r.host.querySelector<HTMLButtonElement>('button[data-rp-act="accept"][data-rp-unit="u2"]')?.click();
    expect(r.ledger.isAccepted('u2')).toBe(true);
    expect(r.host.querySelector('[data-frp="accepted-u2"]')?.textContent).toContain('Accepted at');
  });

  it('files a correction, shows waiting, then the anchored answer unlocks acceptance', () => {
    const r = rig();
    r.panel.sync();
    r.host.querySelector<HTMLButtonElement>('button[data-rp-act="request"]')?.click();
    expect(r.ledger.getRequest('req1')?.status).toBe('pending');
    expect(r.host.querySelector('[data-frp="req-status-req1"]')?.textContent).toBe('Waiting for an answer');
    expect(r.panel.requestCorrection('req1')).toBe(false);
    r.ledger.respond('req1', 'approved');
    r.panel.sync();
    expect(r.host.querySelector('[data-frp="req-status-req1"]')?.textContent).toBe('Approved');
    expect(r.host.querySelector('[data-frp-row="u1:accountId"]')?.textContent).toContain('Matches');
    expect(r.panel.accept('u1')).toBe(true);
  });

  it('lists delivered notices newest first, supersedes versions and tracks unread', () => {
    const r = rig();
    r.panel.sync();
    expect(r.host.textContent).toContain('No notices yet');
    r.ledger.deliverNotice('n1', 1);
    r.ledger.deliverNotice('n2');
    r.ledger.deliverNotice('n1', 2);
    r.ledger.deliverNotice('n1', 1);
    r.panel.sync();
    const items = [...r.host.querySelectorAll('[data-frp-notice]')].map((e) => e.getAttribute('data-frp-notice'));
    expect(items).toEqual(['n1', 'n2']);
    expect(r.host.textContent).toContain('Maintenance window moved.');
    expect(r.host.textContent).not.toContain('Maintenance window tonight.');
    expect(r.host.querySelector('[data-frp="unread"]')?.textContent).toBe('2 new');
    r.host.querySelector<HTMLButtonElement>('button[data-rp-act="read"]')?.click();
    expect(r.panel.unreadCount()).toBe(1);
    expect(r.host.querySelector('[data-frp="unread"]')?.textContent).toBe('1 new');
  });
});

describe('M16 ClaimRule choice labels', () => {
  it('uses authored labels and falls back to the humanized id', () => {
    const form: HandoverFormConfig = {
      id: 'h',
      title: 'H',
      documentSection: 'S',
      fields: [{ key: 'c', label: 'Cause', required: false, rule: { choice: ['loose-plug', 'other-thing'], labels: { 'loose-plug': 'A plug came loose' } } }],
    };
    const records = new FieldRecords([form], { plant: null as never, service: null, evidence: null, runs: () => [], getCardVersion: () => 1 });
    const host = document.createElement('div');
    const panel = new FieldHandoverPanel(host, { records: () => records, evidence: () => null, service: () => null, runs: () => [], plant: () => null });
    panel.sync();
    const labels = [...host.querySelectorAll('input[type="radio"][data-hf-field="c"] + span')].map((o) => o.textContent);
    expect(labels).toEqual(['A plug came loose', 'Other thing', 'Other']);
  });
});
