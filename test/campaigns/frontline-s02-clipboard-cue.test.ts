import { frontlineScenario2Data } from '@app/campaigns/frontline/scenario2';
import { describe, expect, it } from 'vitest';

describe('Frontline S2 opening dialog', () => {
  it('points the player at the clipboard task sheet, the only place the checklist lives', () => {
    const intro = frontlineScenario2Data.dialogClips?.intro?.text ?? '';
    expect(intro).toMatch(/clipboard/iu);
  });
});
