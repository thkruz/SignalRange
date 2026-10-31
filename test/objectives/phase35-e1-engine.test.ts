/**
 * Phase 35 E1 (nats-eu r1): off-tab nudge (D3), pass-phase rows and the
 * on-pass-phase timer (D9), hold-through-observation (D9), signal-scoped lock
 * rows (D10), per-station observation (D11), the HPA row needing an enabled
 * HPA (s04-F5) and token fill on checklist text.
 */
import { vi } from 'vitest';
import { OrbitalSatellite } from '../../src/equipment/satellite/orbital-satellite';
import { EventBus } from '../../src/events/event-bus';
import { Events } from '../../src/events/events';
import { GnssThreatManager } from '../../src/gnss-threat/gnss-threat-manager';
import type { Condition, Objective } from '../../src/objectives/objective-types';
import { OFF_TAB_NUDGE_SECONDS } from '../../src/objectives/objective-types';
import { ObjectivesManager } from '../../src/objectives/objectives-manager';
import { TabbedCanvas } from '../../src/pages/mission-control/tabbed-canvas';
import { resetMissionClock } from '../../src/simulation/mission-clock';
import { advanceSimTime } from '../helpers/sim-time';

const station = vi.hoisted(() => ({
  hpaEnabled: false,
  hpaOverdriven: false,
  locked: true,
  targetSignalId: 'SAR-1' as string | undefined,
  snr: 12,
  elevation: 10,
}));

const fakeSat = vi.hoisted(() => ({ sat: null as unknown }));

vi.mock('../../src/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: () => ({
      groundStations: [
        {
          state: { id: 'gs-1', location: { latitude: 53, longitude: -9, elevation: 0 } },
          antennas: [],
          rfFrontEnds: [
            {
              hpaModule: {
                state: {
                  isPowered: true,
                  get isHpaEnabled() {
                    return station.hpaEnabled;
                  },
                  get isOverdriven() {
                    return station.hpaOverdriven;
                  },
                },
              },
            },
          ],
          spectrumAnalyzers: [],
          receivers: [
            {
              state: { activeModem: 1, modems: [{ modemNumber: 1, isPowered: true }] },
              getSnrForModem: () => station.snr,
              getSignalsInBandwidth: () => ({ hasLock: station.locked, targetSignalId: station.targetSignalId }),
            },
          ],
          transmitters: [],
        },
      ],
      satellites: [],
      getSatByNoradId: (id: number) => (id === 99999 ? fakeSat.sat : null),
    }),
  },
}));

const objective = (id: string, conditions: Condition[], extra: Partial<Objective> = {}): Objective => ({
  id,
  title: id,
  description: id,
  groundStation: 'gs-1',
  conditions,
  ...extra,
});

const second = (): void => {
  EventBus.getInstance().emit(Events.UPDATE, 1000);
};

const stateOf = (id: string) => ObjectivesManager.getInstance().getObjectiveState(id)!;

const makeSat = (): { sat: OrbitalSatellite; setEl: (el: number) => void } => {
  const sat = Object.create(OrbitalSatellite.prototype) as OrbitalSatellite;
  let el = 0;
  Object.defineProperty(sat, 'minElevation', { value: 0 });
  (sat as unknown as { geometryFor: () => { el: number } }).geometryFor = () => ({ el });
  return { sat, setEl: (v) => (el = v) };
};

describe('Phase 35 E1 objectives engine', () => {
  let activeTab: string | null = null;
  let selectedAsset: string | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    EventBus.destroy();
    ObjectivesManager.destroy();
    resetMissionClock();
    station.hpaEnabled = false;
    station.hpaOverdriven = false;
    station.locked = true;
    station.targetSignalId = 'SAR-1';
    station.snr = 12;
    activeTab = null;
    selectedAsset = null;
    vi.spyOn(TabbedCanvas, 'getActiveTab').mockImplementation(() => activeTab);
    vi.spyOn(TabbedCanvas, 'getSelectedAssetId').mockImplementation(() => selectedAsset);
  });

  afterEach(() => {
    ObjectivesManager.destroy();
    EventBus.destroy();
    resetMissionClock();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('D3 off-tab reads are announced', () => {
    const cnRow: Condition = {
      type: 'receiver-snr-threshold',
      description: 'C/N Above 8 dB',
      mustMaintain: false,
      params: { minCNRatio: 8, requiresObservation: true, observationTab: 'rx-analysis' },
    };

    it('nudges once after OFF_TAB_NUDGE_SECONDS of live-true reading on the wrong tab, and not before', () => {
      const pending: unknown[] = [];
      EventBus.getInstance().on(Events.OBJECTIVE_OBSERVATION_PENDING, (d) => pending.push(d));
      ObjectivesManager.initialize([objective('cn', [cnRow])]);
      activeTab = 'dashboard-gs-1';

      for (let i = 0; i < OFF_TAB_NUDGE_SECONDS - 1; i++) second();
      expect(pending).toHaveLength(0);
      expect(stateOf('cn').conditionStates[0].offTabNudged).toBeFalsy();

      second();
      second();
      expect(pending).toEqual([{ objectiveId: 'cn', conditionIndex: 0, tab: 'rx-analysis' }]);
      expect(stateOf('cn').conditionStates[0].offTabNudged).toBe(true);
      expect(ObjectivesManager.getInstance().generateHtmlChecklist()).toContain('Reads true now. Open RX Analysis to log it.');
    });

    it('does not count a value that reads false, and resets when it drops', () => {
      const pending: unknown[] = [];
      EventBus.getInstance().on(Events.OBJECTIVE_OBSERVATION_PENDING, (d) => pending.push(d));
      ObjectivesManager.initialize([objective('cn', [cnRow])]);
      activeTab = 'dashboard-gs-1';
      station.snr = 3;
      for (let i = 0; i < 10; i++) second();
      expect(pending).toHaveLength(0);

      station.snr = 12;
      for (let i = 0; i < OFF_TAB_NUDGE_SECONDS - 1; i++) second();
      station.snr = 3;
      second();
      station.snr = 12;
      for (let i = 0; i < OFF_TAB_NUDGE_SECONDS - 1; i++) second();
      expect(pending).toHaveLength(0);
    });

    it('stays quiet once the tab is open and the row latches', () => {
      const pending: unknown[] = [];
      EventBus.getInstance().on(Events.OBJECTIVE_OBSERVATION_PENDING, (d) => pending.push(d));
      ObjectivesManager.initialize([objective('cn', [cnRow])]);
      activeTab = 'rx-analysis-gs-1';
      for (let i = 0; i < 6; i++) second();
      expect(stateOf('cn').conditionStates[0].observed).toBe(true);
      expect(pending).toHaveLength(0);
    });
  });

  describe('D11 observation is per station', () => {
    it('does not read the row while another station is selected', () => {
      ObjectivesManager.initialize([
        objective('cn', [
          { type: 'receiver-snr-threshold', description: 'C/N', mustMaintain: false, params: { minCNRatio: 8, requiresObservation: true, observationTab: 'rx-analysis' } },
        ]),
      ]);
      activeTab = 'rx-analysis-gs-2';
      selectedAsset = 'gs-2';
      for (let i = 0; i < 6; i++) second();
      expect(stateOf('cn').conditionStates[0].observed).toBeFalsy();

      activeTab = 'rx-analysis-gs-1';
      selectedAsset = 'gs-1';
      for (let i = 0; i < 4; i++) second();
      expect(stateOf('cn').conditionStates[0].observed).toBe(true);
    });
  });

  describe('D9 hold through observation', () => {
    it('keeps observed latched but returns the live value for a hold-at-completion row', () => {
      ObjectivesManager.initialize([
        objective('hold', [
          {
            type: 'receiver-snr-threshold',
            description: 'C/N Above 8 dB',
            mustMaintain: true,
            params: { minCNRatio: 8, requiresObservation: true, observationTab: 'rx-analysis' },
          },
          { type: 'hpa-enabled', description: 'HPA on', mustMaintain: false },
        ]),
      ]);
      activeTab = 'rx-analysis-gs-1';
      for (let i = 0; i < 4; i++) second();
      const cs = stateOf('hold').conditionStates[0];
      expect(cs.observed).toBe(true);
      expect(cs.isSatisfied).toBe(true);

      station.snr = 2;
      second();
      expect(cs.observed).toBe(true);
      expect(cs.isSatisfied).toBe(false);
    });
  });

  describe('D9 satellite-pass-phase', () => {
    const row = (phase: 'past-culmination' | 'setting-below' | 'set', elevation?: number): Condition => ({
      type: 'satellite-pass-phase',
      description: phase,
      mustMaintain: false,
      params: { noradId: 99999, phase, ...(elevation === undefined ? {} : { elevation }) },
    });

    it('latches past-culmination when elevation starts falling and stays latched', () => {
      const { sat, setEl } = makeSat();
      fakeSat.sat = sat;
      ObjectivesManager.initialize([objective('pass', [row('past-culmination')])]);
      for (const el of [5, 20, 40]) {
        setEl(el);
        second();
      }
      expect(stateOf('pass').conditionStates[0].isSatisfied).toBe(false);
      setEl(39);
      second();
      expect(stateOf('pass').conditionStates[0].isSatisfied).toBe(true);
      setEl(50);
      second();
      expect(stateOf('pass').conditionStates[0].isSatisfied).toBe(true);
    });

    it('latches setting-below only after culmination and under the elevation', () => {
      const { sat, setEl } = makeSat();
      fakeSat.sat = sat;
      ObjectivesManager.initialize([objective('pass', [row('setting-below', 10)])]);
      for (const el of [3, 30, 12]) {
        setEl(el);
        second();
      }
      expect(stateOf('pass').conditionStates[0].isSatisfied).toBe(false);
      setEl(9);
      second();
      expect(stateOf('pass').conditionStates[0].isSatisfied).toBe(true);
    });

    it('does not latch set until the satellite has been above the receivable elevation', () => {
      const { sat, setEl } = makeSat();
      fakeSat.sat = sat;
      ObjectivesManager.initialize([objective('pass', [row('set')])]);
      setEl(-5);
      second();
      expect(stateOf('pass').conditionStates[0].isSatisfied).toBe(false);
      setEl(10);
      second();
      setEl(-1);
      second();
      expect(stateOf('pass').conditionStates[0].isSatisfied).toBe(true);
    });

    it('starts an on-pass-phase countdown when the row latches, not on activation', () => {
      const { sat, setEl } = makeSat();
      fakeSat.sat = sat;
      ObjectivesManager.initialize([
        objective('secure', [row('set'), { type: 'hpa-enabled', description: 'never', mustMaintain: false }], { timeLimitSeconds: 120, timerStartTrigger: 'on-pass-phase' }),
      ]);
      expect(stateOf('secure').isTimerRunning).toBe(false);
      setEl(15);
      second();
      expect(stateOf('secure').isTimerRunning).toBe(false);
      setEl(-2);
      second();
      expect(stateOf('secure').isTimerRunning).toBe(true);
      expect(stateOf('secure').timeRemainingSeconds).toBe(120);
      advanceSimTime(3000, { emitUpdate: true });
      expect(stateOf('secure').timeRemainingSeconds).toBeLessThan(120);
    });
  });

  describe('D10 signal-scoped lock rows', () => {
    it('receiver-signal-locked with a signalId needs the modem measuring that carrier', () => {
      ObjectivesManager.initialize([
        objective('lock-2', [{ type: 'receiver-signal-locked', description: 'Locked on SAR-2', mustMaintain: false, params: { signalId: 'SAR-2' } }]),
        objective('lock-any', [{ type: 'receiver-signal-locked', description: 'Locked', mustMaintain: false }]),
      ]);
      second();
      expect(stateOf('lock-2').isCompleted).toBe(false);
      expect(stateOf('lock-any').isCompleted).toBe(true);

      station.targetSignalId = 'SAR-2';
      second();
      expect(stateOf('lock-2').isCompleted).toBe(true);
    });

    it('receiver-snr-threshold with a signalId ignores the C/N of another carrier', () => {
      ObjectivesManager.initialize([
        objective('cn-2', [{ type: 'receiver-snr-threshold', description: 'C/N on SAR-2', mustMaintain: false, params: { minCNRatio: 8, signalId: 'SAR-2' } }]),
      ]);
      second();
      expect(stateOf('cn-2').isCompleted).toBe(false);
      station.targetSignalId = 'SAR-2';
      second();
      expect(stateOf('cn-2').isCompleted).toBe(true);
    });
  });

  describe('s04-F5 HPA within limits', () => {
    it('is not met with the HPA disabled', () => {
      ObjectivesManager.initialize([objective('hpa', [{ type: 'hpa-not-overdriven', description: 'HPA within limits', mustMaintain: false }])]);
      second();
      expect(stateOf('hpa').isCompleted).toBe(false);
      station.hpaEnabled = true;
      second();
      expect(stateOf('hpa').isCompleted).toBe(true);
    });
  });

  describe('s01-F5 beacon row dwell with a low frame every second', () => {
    it('latches inside the dwell when one 16 ms frame a second reads low (LEO position step)', () => {
      ObjectivesManager.initialize([
        objective('beacon', [
          { type: 'receiver-snr-threshold', description: 'Beacon', mustMaintain: false, params: { minCNRatio: 8, requiresObservation: true, observationTab: 'rx-analysis' } },
          { type: 'hpa-enabled', description: 'never', mustMaintain: false },
        ]),
      ]);
      activeTab = 'rx-analysis-gs-1';
      let ticks = 0;
      while (ticks < 60 * 5 && !stateOf('beacon').conditionStates[0].observed) {
        station.snr = ticks % 60 === 0 ? 2 : 12;
        EventBus.getInstance().emit(Events.UPDATE, 16.667);
        ticks++;
      }
      expect(ticks).toBeLessThan(60 * 4);
    });
  });

  describe('s20-F2 GPSDO stillness restarts on a reference-mode change', () => {
    it('resets secondsSinceOffsetChange when the mode changes, not when it is set again', () => {
      GnssThreatManager.destroy();
      const mgr = GnssThreatManager.getInstance();
      mgr.advance(50);
      mgr.setReferenceMode('holdover');
      expect(mgr.secondsSinceOffsetChange).toBe(0);
      mgr.advance(10);
      mgr.setReferenceMode('holdover');
      expect(mgr.secondsSinceOffsetChange).toBe(10);
    });
  });

  describe('token fill on checklist text', () => {
    it('fills {{stationTime}} in the objective title and description', () => {
      ObjectivesManager.initialize([objective('t', [{ type: 'hpa-enabled', description: 'x', mustMaintain: false }], { title: 'Pass at {{stationTime}}' })]);
      const html = ObjectivesManager.getInstance().generateHtmlChecklist();
      expect(html).not.toContain('{{stationTime}}');
    });
  });
});
