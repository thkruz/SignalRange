import { afterEach, describe, expect, it } from 'vitest';
import { CryptoModule } from '../../src/equipment/crypto';
import { collectStationServiceAlarms, TRAFFIC_KEY_MISMATCH_LABEL } from '../../src/services/station-service-alarms';

describe('station service alarms', () => {
  afterEach(() => CryptoModule.resetInstance());

  it('raises nothing without a crypto unit', () => {
    expect(collectStationServiceAlarms('GW-01')).toEqual([]);
  });

  it('raises an error for a traffic key mismatch', () => {
    CryptoModule.getInstance().injectKeyMismatch();
    const alarms = collectStationServiceAlarms('GW-01');
    expect(alarms).toHaveLength(1);
    expect(alarms[0]).toMatchObject({ severity: 'error', message: TRAFFIC_KEY_MISMATCH_LABEL, assetId: 'GW-01' });
  });
});
