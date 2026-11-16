import { afterEach, describe, expect, it } from 'vitest';
import { hamTechS05Data } from '../../../src/campaigns/ham-sdr/tech/s05-build-better-antenna';
import { HamStationManager } from '../../../src/ham/ham-station-manager';
import { type Harness, harness } from '../../ham/manager/harness';
import { expectedQuizIds, failing, quizLocalIds } from './solve-utils-b';

const data = hamTechS05Data;
const A = 'KF0SRT';
let h: Harness;
let m: HamStationManager;

const record = (): void => {
  h.actOk({ type: 'rx.record', deviceId: 'sdr', emitterId: 'reference' });
};
const sweep = (): void => {
  h.actOk({ type: 'analyzer.sweep', start: 120, stop: 160, points: 201 });
};

afterEach(() => {
  HamStationManager.destroy();
});

describe(`S5 solve (${A})`, () => {
  it('uses exactly the ten S05 quiz items once each', () => {
    expect([...quizLocalIds(data)].sort()).toEqual([...expectedQuizIds('05')].sort());
  });

  it('is built for the technician-level station', () => {
    expect(data.settings.hamStation?.operator.license).toBe('technician');
    expect(data.objectives?.[0].id).toBe('review-mission-brief');
  });

  it('can be solved step by step with the manager', () => {
    h = harness(data.settings.hamStation!);
    m = h.m;

    // calculate-length
    expect(failing(data, 'calculate-length', m)).not.toEqual([]);
    h.actOk({ type: 'worksheet.answer', id: 's05-length', values: { total: 1.95, each: 0.975 } });
    expect(failing(data, 'calculate-length', m)).not.toEqual([]);
    h.actOk({ type: 'worksheet.answer', id: 's05-length', values: { total: 0.976, each: 0.488 } });
    expect(failing(data, 'calculate-length', m)).toEqual([]);

    // select-site
    expect(failing(data, 'select-site', m)).not.toEqual([]);
    h.actOk({
      type: 'worksheet.answer',
      id: 's05-site',
      values: {
        sites: {
          'Under the overhead power line': 'Reject: contact risk if it falls',
          'Wobbly fence post by the garage': 'Reject: not stable enough',
          'Occupied corner of the TV mast': 'Reject: space already in use',
          'Clear garden mast away from wires': 'Use this site',
        },
      },
    } as never);
    expect(failing(data, 'select-site', m)).toEqual([]);

    // assemble-antenna: a connection with no baseline is not enough
    expect(failing(data, 'assemble-antenna', m).length).toBe(3);
    h.actOk({ type: 'inspect', targetId: 'dipole' });
    h.actOk({ type: 'connect', a: { deviceId: 'dipole-coax', portId: 'b' }, b: { deviceId: 'dipole', portId: 'in' } } as never);
    h.advance(3);
    expect(failing(data, 'assemble-antenna', m)).toHaveLength(1);
    record();
    expect(failing(data, 'assemble-antenna', m)).toEqual([]);

    // resonant-region: the sweep before calibration is uncalibrated and cannot count
    expect(failing(data, 'resonant-region', m).length).toBe(3);
    h.actOk({ type: 'disconnect', connectionId: 'adp-coax' });
    h.actOk({ type: 'connect', a: { deviceId: 'analyzer', portId: 'rf' }, b: { deviceId: 'dipole-coax', portId: 'a' } } as never);
    h.actOk({ type: 'analyzer.calibrate', referenceDeviceId: 'dipole-coax' });
    sweep();
    expect(failing(data, 'resonant-region', m)).toHaveLength(1);
    h.actOk({ type: 'antenna.adjust', deviceId: 'dipole', elementLengthsM: [0.488, 0.488] });
    expect(failing(data, 'resonant-region', m)).toHaveLength(1);
    sweep();
    expect(failing(data, 'resonant-region', m)).toEqual([]);

    // match-polarization: no vertical reading yet, and a horizontal-only record fails
    h.actOk({ type: 'disconnect', connectionId: 'analyzer.rf~dipole-coax.a' });
    h.actOk({ type: 'connect', a: { deviceId: 'sdr-adapter', portId: 'b' }, b: { deviceId: 'dipole-coax', portId: 'a' } } as never);
    h.advance(3);
    record();
    expect(failing(data, 'match-polarization', m)).not.toEqual([]);
    h.actOk({ type: 'antenna.adjust', deviceId: 'dipole', orientation: 'vertical' });
    h.advance(3);
    record();
    expect(failing(data, 'match-polarization', m)).toEqual([]);

    // check-exposure
    expect(failing(data, 'check-exposure', m)).not.toEqual([]);
    h.actOk({ type: 'worksheet.answer', id: 's05-exposure', values: { limit: '0.2', density: 0.033, verdict: 'Yes, under the limit' } });
    expect(failing(data, 'check-exposure', m)).toEqual([]);

    // compare-reports
    expect(failing(data, 'compare-reports', m)).toEqual([]);
  });

  it('rejects a stale or reversed comparison', () => {
    h = harness(data.settings.hamStation!);
    m = h.m;
    h.actOk({ type: 'connect', a: { deviceId: 'dipole-coax', portId: 'b' }, b: { deviceId: 'dipole', portId: 'in' } } as never);
    h.advance(3);
    record();
    // only the horizontal baseline exists: no improvement yet
    expect(failing(data, 'compare-reports', m)).not.toEqual([]);
    h.actOk({ type: 'antenna.adjust', deviceId: 'dipole', orientation: 'vertical' });
    h.advance(3);
    record();
    // vertical but still out of band is not in-band vertical
    expect(failing(data, 'compare-reports', m)).not.toEqual([]);
    h.actOk({ type: 'antenna.adjust', deviceId: 'dipole', elementLengthsM: [0.488, 0.488] });
    h.advance(3);
    record();
    expect(failing(data, 'compare-reports', m)).toEqual([]);
    // turning the antenna back to horizontal must break "ends on the better reading"
    h.actOk({ type: 'antenna.adjust', deviceId: 'dipole', orientation: 'horizontal' });
    h.advance(3);
    record();
    expect(failing(data, 'compare-reports', m)).not.toEqual([]);
  });

  it('does not accept a horizontal dipole as matched', () => {
    h = harness(data.settings.hamStation!);
    m = h.m;
    h.actOk({ type: 'connect', a: { deviceId: 'dipole-coax', portId: 'b' }, b: { deviceId: 'dipole', portId: 'in' } } as never);
    h.actOk({ type: 'antenna.adjust', deviceId: 'dipole', elementLengthsM: [0.488, 0.488] });
    h.advance(3);
    record();
    expect(failing(data, 'match-polarization', m)).not.toEqual([]);
  });

  it('refuses a wrong exposure verdict', () => {
    h = harness(data.settings.hamStation!);
    m = h.m;
    h.actOk({ type: 'worksheet.answer', id: 's05-exposure', values: { limit: '1.0', density: 0.033, verdict: 'Yes, under the limit' } });
    expect(failing(data, 'check-exposure', m)).not.toEqual([]);
  });
});
