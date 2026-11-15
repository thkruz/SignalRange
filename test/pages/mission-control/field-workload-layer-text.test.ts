import { layerDownText } from '@app/pages/mission-control/tabs/field-workload-panel';
import { describe, expect, it } from 'vitest';

describe('layerDownText', () => {
  it('names Standby and the way out when a terminal was left in Standby', () => {
    const text = layerDownText(['layer:mode-standby']);
    expect(text).toContain('Standby');
    expect(text).toContain('Running');
  });

  it('still explains a search in progress', () => {
    expect(layerDownText(['layer:terminal-searching'])).toContain('searching');
  });

  it('returns null when no layer was down', () => {
    expect(layerDownText(['rttMs'])).toBeNull();
  });
});
