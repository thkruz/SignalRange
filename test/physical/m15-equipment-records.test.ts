/**
 * M15 equipment records: discrepancy check, anchored correction response, versioned notices,
 * policy actions through the event controller, S14 lift restoring only the S10 restriction.
 */

import { type EquipmentConfig, EquipmentLedger } from '@app/physical/equipment-records';
import type { PlantEventConfig } from '@app/physical/physical-plant-types';
import { PlantEventController } from '@app/physical/plant-event-controller';
import { describe, expect, it, vi } from 'vitest';

const objectives = vi.hoisted(() => ({ live: new Set<string>() }));

vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: () => ({
      objectivesManager: { getObjectiveState: (id: string) => ({ isActive: objectives.live.has(id), isCompleted: false }) },
    }),
    hasInstance: () => true,
    destroy: () => undefined,
  },
}));

const CFG: EquipmentConfig = {
  units: [
    { unitId: 'u1', record: { serial: 'SN-1', accountId: 'acct-a', configVersion: 'v1' }, installed: { serial: 'SN-1', accountId: 'acct-b', configVersion: 'v1' } },
    { unitId: 'u2', record: { serial: 'SN-2', accountId: 'acct-a', configVersion: 'v1' } },
  ],
  requests: [{ id: 'fix-acct', unitId: 'u1', field: 'accountId', to: 'acct-b', responseEventId: 'answer' }],
  notices: [
    { id: 'n1', version: 1, providerId: 'p', affects: { accountId: 'acct-a' }, kind: 'ground-capacity', issuedAtS: 0, text: 'v1' },
    { id: 'n1', version: 2, providerId: 'p', affects: { accountId: 'acct-a' }, kind: 'ground-capacity', issuedAtS: 0, text: 'v2' },
  ],
};

function ledger(): { l: EquipmentLedger; setT: (t: number) => void } {
  let t = 10;

  return {
    l: new EquipmentLedger(CFG, () => t),
    setT: (v) => {
      t = v;
    },
  };
}

describe('equipment ledger', () => {
  it('finds discrepancies and refuses acceptance until they are gone', () => {
    const { l } = ledger();
    expect(l.discrepancies('u1')).toEqual([{ unitId: 'u1', field: 'accountId', recorded: 'acct-a', installed: 'acct-b' }]);
    expect(l.discrepancies('u2')).toEqual([]);
    expect(l.accept('u1').ok).toBe(false);
    expect(l.isAccepted('u1')).toBe(false);
    expect(l.accept('u2').ok).toBe(true);
    expect(l.isAccepted('u2')).toBe(true);
    expect(l.accept('nope')).toMatchObject({ ok: false, reason: 'unknown-unit' });
  });

  it('keeps a correction pending until the anchored response, then fixes the record', () => {
    const { l } = ledger();
    const r = l.submitCorrection('fix-acct');
    expect(r.ok && r.request).toMatchObject({ from: 'acct-a', to: 'acct-b', status: 'pending', submittedAtS: 10 });
    expect(l.submitCorrection('fix-acct')).toMatchObject({ ok: false, reason: 'already-filed' });
    expect(l.discrepancies('u1')).toHaveLength(1);
    l.respond('fix-acct', 'approved');
    expect(l.getRequest('fix-acct')?.status).toBe('approved');
    expect(l.discrepancies('u1')).toEqual([]);
    expect(l.accept('u1').ok).toBe(true);
    l.respond('fix-acct', 'rejected');
    expect(l.getRequest('fix-acct')?.status).toBe('approved');
  });

  it('rejection leaves the discrepancy; an early response waits for the filing', () => {
    const a = ledger().l;
    a.submitCorrection('fix-acct');
    a.respond('fix-acct', 'rejected');
    expect(a.discrepancies('u1')).toHaveLength(1);
    const b = ledger().l;
    b.respond('fix-acct', 'approved');
    expect(b.getRequest('fix-acct')).toBeUndefined();
    b.submitCorrection('fix-acct');
    expect(b.getRequest('fix-acct')?.status).toBe('approved');
    expect(ledger().l.submitCorrection('missing')).toMatchObject({ ok: false, reason: 'unknown-request' });
  });

  it('versions notices: newest wins, older delivery is ignored', () => {
    const { l } = ledger();
    expect(l.deliverNotice('n1', 1)?.text).toBe('v1');
    expect(l.deliverNotice('n1')?.text).toBe('v2');
    expect(l.deliverNotice('n1', 1)).toBeNull();
    expect(l.deliverNotice('x')).toBeNull();
    expect(l.deliveredNotices('p').map((n) => n.text)).toEqual(['v2']);
    expect(l.noticeVersion('n1')).toBe(2);
  });

  it('round-trips state', () => {
    const { l } = ledger();
    l.submitCorrection('fix-acct');
    l.respond('fix-acct', 'approved');
    l.deliverNotice('n1');
    l.accept('u2');
    const copy = ledger().l;
    copy.restoreState(JSON.parse(JSON.stringify(l.getState())));
    expect(copy.getState()).toEqual(l.getState());
    expect(copy.discrepancies('u1')).toEqual([]);
  });
});

describe('policy actions through the controller', () => {
  it('routes actions to the target and S14 lift clears only the account restriction', () => {
    const acct = { id: 'a', restriction: 'ground-capacity' as string | undefined };
    const ep = { id: 'e', policy: 'mobility-restricted' as string | undefined };
    const calls: string[] = [];
    const events: PlantEventConfig[] = [
      {
        id: 's10',
        startAfterObjectiveId: 'o1',
        actions: [
          { kind: 'deliver-notice', noticeId: 'n1' },
          { kind: 'respond-request', requestId: 'r', status: 'approved' },
        ],
      },
      { id: 's14-lift', startAfterObjectiveId: 'o2', actions: [{ kind: 'set-account', patch: { id: 'a', restriction: undefined } }] },
    ];
    const ctl = new PlantEventController(events, {
      injectFault: () => undefined,
      clearFault: () => true,
      setWeather: () => undefined,
      setAccount: (p) => Object.assign(acct, p),
      setEndpoint: (p) => Object.assign(ep, p),
      deliverNotice: (id) => calls.push(`notice:${id}`),
      respondRequest: (id, s) => calls.push(`resp:${id}:${s}`),
    });
    objectives.live.add('o1');
    ctl.update(1);
    expect(calls).toEqual(['notice:n1', 'resp:r:approved']);
    objectives.live.add('o2');
    ctl.update(2);
    expect(acct.restriction).toBeUndefined();
    expect(ep.policy).toBe('mobility-restricted');
  });
});
