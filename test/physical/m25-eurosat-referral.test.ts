import { applyForwardEurosat, applyForwardField, FORWARD_EUROSAT_ENDPOINT, FORWARD_EUROSAT_SERVICE, FORWARD_FIRST_CARD } from '@app/campaigns/frontline/forward-field-config';
import { createFrontlineSettings } from '@app/campaigns/frontline/scenario-support';
import { EquipmentLedger } from '@app/physical/equipment-records';
import { describe, expect, it } from 'vitest';

const ledger = (): EquipmentLedger =>
  new EquipmentLedger(
    {
      units: [{ unitId: 'u1', record: { serial: 'S1', accountId: 'a1', configVersion: 'v1' } }],
      requests: [
        { id: 'ref', unitId: 'u1', field: 'accountId', to: 'specialist-review', responseEventId: 'e1', referral: true },
        { id: 'fix', unitId: 'u1', field: 'configVersion', to: 'v2', responseEventId: 'e2' },
      ],
    },
    () => 0
  );

describe('M25 referral requests', () => {
  it('files a referral without a record change and never edits the record on approval', () => {
    const l = ledger();
    const res = l.submitCorrection('ref', 'a1');
    expect(res.ok).toBe(true);
    l.respond('ref', 'approved');
    expect(l.getRequest('ref')?.status).toBe('approved');
    expect(l.getRecord('u1')?.accountId).toBe('a1');
  });

  it('holds an early answer until the referral is filed', () => {
    const l = ledger();
    l.respond('ref', 'approved');
    expect(l.getRequest('ref')).toBeUndefined();
    l.submitCorrection('ref');
    expect(l.getRequest('ref')?.status).toBe('approved');
  });

  it('still refuses an ordinary correction that changes nothing and still edits on approval', () => {
    const l = ledger();
    expect(l.submitCorrection('fix', 'v1')).toEqual({ ok: false, reason: 'no-change' });
    l.submitCorrection('fix');
    l.respond('fix', 'approved');
    expect(l.getRecord('u1')?.configVersion).toBe('v2');
  });
});

describe('M25 EuroSat layer', () => {
  it('adds the EuroSat service on top of the forward field and restricts Skylink', () => {
    const plant = createFrontlineSettings(11).physicalPlant;
    expect(plant).toBeDefined();
    if (!plant) {
      return;
    }
    applyForwardField(plant, [FORWARD_FIRST_CARD], []);
    applyForwardEurosat(plant);
    expect(plant.service?.paths.some((p) => p.id === FORWARD_EUROSAT_SERVICE)).toBe(true);
    expect(plant.service?.endpoints.some((e) => e.id === FORWARD_EUROSAT_ENDPOINT)).toBe(true);
    expect(plant.parts.find((p) => p.id === 'vsat-modem')?.modes?.map((m) => m.id)).toEqual(['standby', 'run']);
  });

  it('leaves S9 and S10 without a EuroSat service', () => {
    for (const n of [9, 10]) {
      const plant = createFrontlineSettings(n).physicalPlant;
      if (!plant) {
        continue;
      }
      applyForwardField(plant, [FORWARD_FIRST_CARD], []);
      expect(plant.service?.paths.some((p) => p.id === FORWARD_EUROSAT_SERVICE)).toBe(false);
    }
  });
});
