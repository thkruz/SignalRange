import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@app/objectives/objectives-manager', () => ({
  ObjectivesManager: {
    hasInstance: () => true,
    getInstance: () => ({ getObjectiveStates: () => [{ isActive: true, isCompleted: false, isFailed: false, objective: { id: 'obj1', title: 'Find the fault' } }] }),
  },
}));

import type { HamAction } from '../../../src/ham/ham-station-manager';
import { HintPanel } from '../../../src/ham/ui/panels/hint-panel';
import { baseConfig, harness } from '../manager/harness';

afterEach(() => {
  document.body.replaceChildren();
});

describe('HintPanel staged hints', () => {
  it('shows each stage in turn and keeps the earlier ones', () => {
    const h = harness(baseConfig({ hints: { obj1: ['Look at the DC panel.', 'Read the volts at the radio.', 'A big drop means lead loss.'] } }));
    const panel = new HintPanel();
    const host = document.createElement('div');
    document.body.append(host);
    panel.mount(host, {
      manager: h.m,
      act: (a: HamAction) => {
        const r = h.m.act(a);
        panel.update();

        return r;
      },
      feedback: () => undefined,
    });
    const q = (id: string): HTMLElement | null => host.querySelector(`[data-testid="${id}"]`);
    expect(q('ham-hint-obj1-text')).toBeNull();
    q('ham-hint-obj1-ask')?.click();
    expect(q('ham-hint-obj1-text')?.textContent).toBe('Look at the DC panel.');
    q('ham-hint-obj1-ask')?.click();
    expect(q('ham-hint-obj1-stage-2')?.textContent).toBe('Read the volts at the radio.');
    expect(q('ham-hint-obj1-stage-1')?.textContent).toBe('Look at the DC panel.');
    q('ham-hint-obj1-ask')?.click();
    expect(q('ham-hint-obj1-stage-3')?.textContent).toBe('A big drop means lead loss.');
    expect(h.m.events('hint:obj1:3')).toHaveLength(1);
    panel.dispose();
  });
});
