import { frontlineScenario1Data } from '@app/campaigns/frontline/scenario1';
import { frontlineScenario2Data } from '@app/campaigns/frontline/scenario2';
import { frontlineScenario3Data } from '@app/campaigns/frontline/scenario3';
import { frontlineScenario8Data } from '@app/campaigns/frontline/scenario8';
import { conditionNextHtml } from '@app/objectives/objectives-manager';
import { describe, expect, it } from 'vitest';

describe('Frontline S1 onboarding (N4)', () => {
  it('points the intro at the clipboard task sheet', () => {
    expect(frontlineScenario1Data.dialogClips?.intro?.text ?? '').toMatch(/clipboard/iu);
  });

  it('every open row of every objective carries a next line', () => {
    for (const objective of frontlineScenario1Data.objectives) {
      const rows = objective.conditions.filter((c) => !c.hidden);
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        // The record-baseline and handover rows are filed through the form button, not found in the scene
        if (objective.id === 's1-record-baseline' || objective.id === 's1-hand-over-post') continue;
        expect(row.next, `${objective.id}: ${row.description}`).toBeTruthy();
      }
    }
  });

  it('introduces the laptop, cable run and tent control on the objective that first needs them', () => {
    const start = frontlineScenario1Data.dialogClips?.objectivesOnStart ?? {};
    expect(start['s1-identify-equipment']?.text).toMatch(/tent control/iu);
    expect(start['s1-check-condition']?.text).toMatch(/cable run/iu);
    expect(start['s1-establish-connection']?.text).toMatch(/laptop/iu);
  });

  it('S2 no longer promises a guided interruption', () => {
    expect(frontlineScenario2Data.description).not.toMatch(/guided/iu);
  });

  it('later intros still point at the clipboard', () => {
    for (const data of [frontlineScenario3Data, frontlineScenario8Data]) {
      expect(data.dialogClips?.intro?.text ?? '').toMatch(/clipboard/iu);
    }
  });
});

describe('conditionNextHtml', () => {
  it('shows only while the row is open and its objective is active', () => {
    expect(conditionNextHtml('open it', false, true)).toContain('Next: open it');
    expect(conditionNextHtml('open it', true, true)).toBe('');
    expect(conditionNextHtml('open it', false, false)).toBe('');
    expect(conditionNextHtml(undefined, false, true)).toBe('');
  });
});
