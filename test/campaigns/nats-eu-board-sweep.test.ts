/**
 * nats-eu board sweeps: a LEO pre-AOS board is never clean.
 *
 * Every Campaign 2 scenario opens before AOS with the tracker parked on empty
 * sky, so the receive AGC sits at its 10 dB rail and the Dashboard lists
 * "AGC at max gain (10.0 dB) - weak signal" under Active Alarms. Phase 16
 * shipped nine sweep quizzes that graded "No active alarms" as correct; the
 * Playwright specs answered them by the quiz's own text and never read the
 * board, so manual QA (2026-09-17) was the first thing to catch it.
 *
 * Two locks:
 *  1. Engine fact: the REAL Galway and Shetland chains, ticked with nothing in
 *     the beam, raise the AGC warning (and only as a warning, not an error).
 *  2. Content invariant: no nats-eu dashboard-sweep quiz may grade a "no active
 *     alarms" answer as correct, and every one must name the AGC rail.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** nats-eu-scenario1 clock: 2027-03-15 14:00:00 UTC, fifteen minutes before AOS */
const SCENARIO_START_MS = Date.UTC(2027, 2, 15, 14, 0, 0);

vi.mock('@app/simulation/sim-time', () => ({
  getSimulatedNowMs: () => SCENARIO_START_MS,
  getSimulatedNow: () => new Date(SCENARIO_START_MS),
}));

// Nothing in the sky: the antenna sees no satellites, so the LNB has no signal
// to hand the AGC. That is the pre-AOS board every sweep quiz is asked on.
vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: () => ({
      satellites: [],
      getSatsByAzEl: () => [],
      getSatByNoradId: () => null,
      isDeveloperMode: false,
      update: () => undefined,
      draw: () => undefined,
      sync: () => undefined,
    }),
    destroy: () => undefined,
  },
}));

import { natsEuCampaignData } from '@app/campaigns/nats-eu/campaign-data';
import { galwayGroundStation, shetlandGroundStation } from '@app/campaigns/nats-eu/ground-stations';
import { ANTENNA_CONFIG_KEYS } from '@app/equipment/antenna/antenna-config-keys';
import { AntennaUIHeadless } from '@app/equipment/antenna/antenna-ui-headless';
import { createRFFrontEnd } from '@app/equipment/rf-front-end/rf-front-end-factory';
import { EventBus } from '@app/events/event-bus';

const AGC_RAIL = /AGC at max gain/;

describe('nats-eu board sweep: the pre-AOS board carries the RX AGC rail', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    document.body.innerHTML = '<div id="board-sweep-fe"></div>';
  });

  afterEach(() => {
    EventBus.destroy();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it.each([
    ['GW-01', galwayGroundStation],
    ['SH-02', shetlandGroundStation],
  ])('%s with nothing in the beam raises the AGC max-gain warning on the RX chain', (_id, station) => {
    const antenna = new AntennaUIHeadless('board-sweep-antenna', ANTENNA_CONFIG_KEYS.KU_BAND_4M_LEO_TRACKER, station.antennasState![0], 1);
    const frontEnd = createRFFrontEnd('board-sweep-fe', station.rfFrontEnds[0], 'standard');
    frontEnd.connectAntenna(antenna);
    antenna.attachRfFrontEnd(frontEnd);

    // Two seconds at 60 Hz: well past the AGC release time constant.
    for (let i = 0; i < 120; i++) {
      antenna.update();
      frontEnd.update();
    }

    const rx = frontEnd.getStatusAlarms(2);
    const agc = rx.filter((a) => AGC_RAIL.test(a.message));
    expect(agc, `RX alarms: ${JSON.stringify(rx)}`).toHaveLength(1);
    expect(agc[0].severity).toBe('warning');
    expect(frontEnd.getStatusAlarms(1).map((a) => a.message)).toEqual([]);
  });
});

describe('nats-eu board sweep quizzes grade the board the simulation shows', () => {
  const sweepQuizzes = natsEuCampaignData.scenarios.flatMap((scenario) =>
    (scenario.objectives ?? [])
      .filter((objective) => /dashboard-sweep/.test(objective.id))
      .flatMap((objective) =>
        objective.conditions
          .filter((condition) => condition.type === 'status-check')
          .map((condition) => ({
            label: `${scenario.id}/${objective.id}`,
            options: condition.params.options as string[],
            correctIndex: condition.params.correctIndex as number,
          }))
      )
  );

  it('finds every dashboard-sweep quiz (eight GW-01 sweeps, the S9 Shetland read, and the S17-S20 Gray Zone sweeps)', () => {
    expect(sweepQuizzes.map((q) => q.label)).toHaveLength(13);
  });

  it.each(sweepQuizzes.map((q) => [q.label, q]))('%s: the correct answer names the AGC rail, never "no active alarms"', (_label, quiz) => {
    const correct = quiz.options[quiz.correctIndex];
    expect(correct).toMatch(/AGC/);
    expect(correct).not.toMatch(/^no active alarms/i);
  });
});
