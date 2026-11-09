/**
 * Phase 40 WP7: the app records what the player opens and does; the background feed stays unlogged.
 */

import type { TerminalAppModel, TerminalView } from '@app/plugins-builtin/terminal-app/terminal-app-model';
import { TerminalEvidence } from '@app/plugins-builtin/terminal-app/terminal-evidence';
import { describe, expect, it, vi } from 'vitest';

function fakeLog() {
  const views: Array<[string, string]> = [];
  const actions: Array<[string, string]> = [];
  let last: [string, string] | null = null;

  return {
    views,
    actions,
    log: {
      recordAppView: (screen: string, text: string) => {
        if (last && last[0] === screen && last[1] === text) {
          return null;
        }
        last = [screen, text];
        views.push([screen, text]);

        return { id: 'e' };
      },
      recordAppAction: (_screen: string, verb: string, text: string) => {
        actions.push([verb, text]);

        return { id: 'a' };
      },
    },
  };
}

const view = (over: Partial<TerminalView> = {}): TerminalView => ({
  link: 'connected',
  stale: false,
  ageS: 0,
  data: {
    sampleTimeS: 0,
    hero: 'online',
    heroText: 'Online',
    message: null,
    alerts: [],
    uptimeS: 10,
    bootCount: 2,
    downMbps: 100,
    upMbps: 10,
    latencyMs: 40,
    powerW: 50,
    outages: [],
    stats: {} as never,
    debug: { softwareVersion: '1', locationValid: false, gnssSatellites: 0, tiltDeg: null, boresightDeg: null, obstructionFraction: 0.25 },
  } as never,
  ...over,
});

function make() {
  const f = fakeLog();
  const takeSample = vi.fn(() => ({}) as never);
  const model = { serviceId: () => 'skylink', obstructions: () => null, speedTests: () => [] } as unknown as TerminalAppModel;
  const ev = new TerminalEvidence(model, { log: () => f.log as never, services: () => ({ takeSample }) });

  return { f, ev, takeSample };
}

describe('TerminalEvidence', () => {
  it('Home takes real registration and account samples once per recorded view', () => {
    const { ev, takeSample } = make();
    ev.viewScreen('home', view());
    ev.viewScreen('home', view());
    expect(takeSample.mock.calls.map((c) => (c as unknown[])[1])).toEqual(['registration', 'account']);
  });

  it('does not sample when the dish is unreachable, and says so in the entry', () => {
    const { ev, takeSample, f } = make();
    ev.viewScreen('home', view({ link: 'dish-unreachable', stale: true, ageS: 240 }));
    expect(takeSample).not.toHaveBeenCalled();
    expect(f.views[0][1]).toContain("Can't reach your SkyLink");
  });

  it('records what the advanced screen showed', () => {
    const { ev, f } = make();
    ev.viewScreen('advanced', view());
    expect(f.views[0][1]).toContain('location not valid');
    expect(f.views[0][1]).toContain('obstruction 25%');
  });

  it('records the no-router state and app actions; no log means no-op', () => {
    const { ev, f } = make();
    ev.viewScreen('statistics', view({ link: 'no-router', data: null }));
    expect(f.views[0][1]).toContain('no router');
    ev.action('speed-test', 'app-speed-test', 'Ran');
    expect(f.actions).toEqual([['app-speed-test', 'Ran']]);
    const none = new TerminalEvidence({} as TerminalAppModel, { log: () => null, services: () => null });
    expect(() => none.viewScreen('home', view())).not.toThrow();
  });
});
