import { describe, expect, it } from 'vitest';
import { s01Station } from '../../../src/campaigns/ham-sdr/tech/s01-station';
import { HamStationManager } from '../../../src/ham/ham-station-manager';
import { buildJobTagSection } from '../../../src/ham/ui/bench/job-tag-section';
import { benchSheet, jobTags } from '../../../src/ham/ui/bench/job-tags';

const ANSWER = {
  Antenna: 'Captures the radio wave',
  'Coax jumper': 'Carries the signal to the receiver',
  'SMA adapter': 'Changes the connector style',
  'USB SDR': 'Turns radio signals into data',
  Laptop: 'Shows the waterfall and plays the audio',
} as const;

function s01(): HamStationManager {
  return HamStationManager.createForTest(s01Station, { nowS: 0 });
}

describe('S1 job tags on the bench (blind-play blocker)', () => {
  it('tagging all five parts alone does not complete the worksheet, a Check button on the bench does', () => {
    const m = s01();
    const ws = s01Station.worksheets[0];
    for (const [part, job] of Object.entries(ANSWER)) jobTags.set(m, ws.id, 'order', part, job);
    expect(m.worksheet(ws.id)?.correct).toBeFalsy();
    const sheet = benchSheet(m, ws);
    expect(sheet?.missing).toEqual([]);
    expect(sheet?.wrong).toEqual([]);

    let checked = '';
    const sec = buildJobTagSection(
      m,
      'sdr-adapter',
      () => undefined,
      (id) => (checked = id)
    );
    const btn = sec?.querySelector<HTMLButtonElement>('[data-testid="ham-tag-s01-trace-check"]');
    expect(btn).not.toBeNull();
    btn?.click();
    expect(checked).toBe('s01-trace');

    const r = m.act({ type: 'worksheet.answer', id: ws.id, values: sheet?.values ?? {} });
    expect(r.data?.correct).toBe(true);
    expect(m.worksheet(ws.id)?.correct).toBe(true);
  });

  it('names the parts that are untagged or wrong', () => {
    const m = s01();
    const ws = s01Station.worksheets[0];
    jobTags.set(m, ws.id, 'order', 'Antenna', ANSWER.Laptop);
    jobTags.set(m, ws.id, 'order', 'SMA adapter', ANSWER['SMA adapter']);
    const sheet = benchSheet(m, ws);
    expect(sheet?.wrong).toEqual(['Antenna']);
    expect(sheet?.missing).toEqual(['Coax jumper', 'USB SDR', 'Laptop']);
  });
});

describe('Ask Riley never answers with an empty hint', () => {
  it('gives real text for an objective with no authored hint', () => {
    const m = s01();
    const brief = m.act({ type: 'hint', objectiveId: 'review-mission-brief' });
    expect(brief.message).not.toBe('Hint shown.');
    expect(brief.message).toContain('Mission Brief');
    expect(brief.data?.texts).toEqual([brief.message]);
    const other = m.act({ type: 'hint', objectiveId: 'no-such-objective' });
    expect(other.data?.texts).toHaveLength(1);
    expect(other.message.length).toBeGreaterThan(20);
  });
});
