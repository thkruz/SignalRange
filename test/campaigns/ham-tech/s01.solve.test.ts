import { afterEach, describe, expect, it } from 'vitest';
import { hamTechS01Data } from '../../../src/campaigns/ham-sdr/tech/s01-first-signal';
import { S01_MESSAGE } from '../../../src/campaigns/ham-sdr/tech/s01-station';
import { evaluateWith } from '../../../src/ham/ham-conditions';
import { HamStationManager } from '../../../src/ham/ham-station-manager';
import { harness } from '../../ham/manager/harness';
import { practical, quizIds } from './solve-utils-a';

afterEach(() => HamStationManager.destroy());

const config = () => structuredClone(hamTechS01Data.settings.hamStation) as NonNullable<typeof hamTechS01Data.settings.hamStation>;
const USB = { type: 'connect', a: { deviceId: 'sdr', portId: 'usb' }, b: { deviceId: 'laptop', portId: 'usb1' } } as const;

describe('S1 The First Signal solve', () => {
  it('uses exactly its ten quiz items, each once', () => {
    const ids = quizIds(hamTechS01Data);
    expect(ids).toHaveLength(10);
    expect(new Set(ids).size).toBe(10);
    expect([...ids].sort()).toEqual(['S01-A1', 'S01-A2', 'S01-Q1', 'S01-Q2', 'S01-Q3', 'S01-Q4', 'S01-Q5', 'S01-Q6', 'S01-Q7', 'S01-Q8']);
  });

  it('solves every objective in order', () => {
    const h = harness(config());
    const m = h.m;
    const ok = (id: string) => practical(hamTechS01Data, id).every((c) => evaluateWith(c, m));
    const none = (id: string) => practical(hamTechS01Data, id).some((c) => !evaluateWith(c, m));
    h.advance(3);

    // trace the receive path
    expect(none('trace-receive-path')).toBe(true);
    h.actOk({
      type: 'worksheet.answer',
      id: 's01-trace',
      values: {
        order: {
          Antenna: 'Captures the radio wave',
          'Coax jumper': 'Carries the signal to the receiver',
          'SMA adapter': 'Changes the connector style',
          'USB SDR': 'Turns radio signals into data',
          Laptop: 'Shows the waterfall and plays the audio',
        },
      },
    });
    expect(ok('trace-receive-path')).toBe(false); // USB still unplugged
    h.actOk(USB);
    h.advance(2);
    expect(ok('trace-receive-path')).toBe(true);

    // inspect and seat the plug (needs the receiver off)
    expect(none('inspect-antenna-plug')).toBe(true);
    h.actOk({ type: 'inspect', targetId: 'sdr-sma' });
    expect(h.actRefused({ type: 'seat', connectionId: 'sdr-sma' }).ok).toBe(false); // receiver still powered
    expect(ok('inspect-antenna-plug')).toBe(false);
    h.actOk({ type: 'power', deviceId: 'sdr', on: false });
    h.actOk({ type: 'seat', connectionId: 'sdr-sma' });
    h.actOk({ type: 'power', deviceId: 'sdr', on: true });
    h.advance(3);
    expect(ok('inspect-antenna-plug')).toBe(true);

    // find the training signal
    expect(none('find-training-signal')).toBe(true);
    h.actOk({ type: 'radio.set', deviceId: 'sdr', patch: { vfoMHz: 146.55 } });
    h.advance(2);
    expect(ok('find-training-signal')).toBe(false); // filter still 25 kHz
    h.actOk({ type: 'radio.set', deviceId: 'sdr', patch: { filterHz: 15000 } });
    h.advance(3);
    expect(ok('find-training-signal')).toBe(true);

    // open the audio path: volume cannot open a closed squelch
    expect(none('open-audio-path')).toBe(true);
    expect(ok('open-audio-path')).toBe(false);
    h.actOk({ type: 'radio.set', deviceId: 'sdr', patch: { volume: 10 } });
    h.advance(3);
    expect(ok('open-audio-path')).toBe(false);
    h.actOk({ type: 'radio.set', deviceId: 'sdr', patch: { squelch: 0 } });
    h.advance(3);
    expect(ok('open-audio-path')).toBe(true);

    // compare filters
    expect(ok('compare-filter-settings')).toBe(false);
    h.actOk({ type: 'radio.set', deviceId: 'sdr', patch: { filterHz: 6000 } });
    h.advance(3);
    expect(ok('compare-filter-settings')).toBe(false); // still narrow
    h.actOk({ type: 'radio.set', deviceId: 'sdr', patch: { filterHz: 15000 } });
    h.advance(3);
    expect(ok('compare-filter-settings')).toBe(true);

    // recover the message
    expect(ok('recover-message')).toBe(false); // worksheet missing
    h.actOk({ type: 'worksheet.answer', id: 's01-message', values: { text: S01_MESSAGE } });
    expect(ok('recover-message')).toBe(true);
  });

  it('negative: a loose plug keeps the signal below the visible threshold', () => {
    const h = harness(config());
    h.actOk(USB);
    h.actOk({ type: 'radio.set', deviceId: 'sdr', patch: { vfoMHz: 146.55, filterHz: 15000 } });
    h.advance(3);
    const find = practical(hamTechS01Data, 'find-training-signal');
    expect(find.every((c) => evaluateWith(c, h.m))).toBe(false);
  });

  it('negative: a wrong message choice is not accepted', () => {
    const h = harness(config());
    h.actOk({ type: 'worksheet.answer', id: 's01-message', values: { text: 'Club picnic is cancelled, no net tonight' } });
    expect(h.m.events('worksheet:s01-message:wrong').length).toBe(1);
    expect(practical(hamTechS01Data, 'recover-message').every((c) => evaluateWith(c, h.m))).toBe(false);
  });
});
