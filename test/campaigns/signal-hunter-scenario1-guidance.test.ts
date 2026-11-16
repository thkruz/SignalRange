/**
 * Phase 47 N4 (C5 S1): the first-use callouts and checklist next-step lines
 * point at controls that exist and at objectives that exist.
 */

import { signalHunterScenario1Data } from '@app/campaigns/signal-hunter/scenario1';
import { describe, expect, it } from 'vitest';

const objectives = signalHunterScenario1Data.objectives ?? [];
const byId = new Map(objectives.map((o) => [o.id, o]));

describe('signal-hunter scenario 1 guidance', () => {
  it('keys every first-use callout to a real objective', () => {
    const clips = signalHunterScenario1Data.dialogClips?.objectivesOnStart ?? {};

    expect(Object.keys(clips).length).toBeGreaterThanOrEqual(3);
    for (const id of Object.keys(clips)) {
      expect(byId.has(id), `callout for unknown objective ${id}`).toBe(true);
    }
    expect(clips['open-geolocation-console']).toBeDefined();
    expect(clips['collect-measurements']).toBeDefined();
    expect(clips['compute-fix']).toBeDefined();
  });

  it('names the console controls on the capture step the blind run stalled on', () => {
    const o = byId.get('collect-measurements');
    const text = `${o?.description ?? ''} ${o?.conditions[0].next ?? ''}`;

    for (const label of ['TARGET FREQUENCY', 'CORRELATION BANDWIDTH', 'CAPTURE', 'AUTO']) {
      expect(text).toContain(label);
    }
  });

  it('uses the condition next field and keeps the quiz cadence out of unlocked-row text', () => {
    const text = byId.get('collect-measurements')?.description ?? '';
    expect(text).not.toMatch(/^Next:/u);
    expect(text).not.toMatch(/30 seconds|off windows/u);
    expect(byId.get('collect-measurements')?.conditions[0].next).toBeTruthy();
    expect(byId.get('compute-fix')?.conditions[0].next).toBeTruthy();
    expect(byId.get('open-geolocation-console')?.conditions[0].next).toBeTruthy();
  });

  it('gives the capture and fix steps a condition hint', () => {
    expect(byId.get('collect-measurements')?.conditions[0].hint).toBeTruthy();
    expect(byId.get('compute-fix')?.conditions[0].hint).toBeTruthy();
  });

  it('keeps every title out of every other objective description', () => {
    for (const o of objectives) {
      for (const other of objectives) {
        if (other.id !== o.id) expect(other.description).not.toContain(o.title);
      }
    }
  });
});
