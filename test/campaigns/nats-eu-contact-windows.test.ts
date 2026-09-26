/**
 * nats-eu contact windows are propagated, not guessed (phase 16, E1).
 *
 * `settings.contactSchedule` windows are authored numbers, and before per-station
 * propagation the Shetland ones were Galway's window plus an offset. Now every
 * contact names the site whose horizon it was propagated for (`stationId`) and
 * this test flies that site's real pass: the window must open between the 0 deg
 * horizon crossing and the scenario's elevation mask, and close between the mask
 * and the horizon on the way down. Either authoring convention (0 deg or the
 * mask) passes; an invented window does not.
 */

import { natsEuCampaignData } from '@app/campaigns/nats-eu/campaign-data';
import { OrbitalSatellite, observerFromLocation } from '@app/equipment/satellite/orbital-satellite';
import type { ScenarioData } from '@app/ScenarioData';
import { PassPlannerService, type SatellitePass, scenarioMinElevation } from '@app/services/pass-planner-service';
import type { Degrees } from 'ootk';
import { describe, expect, it } from 'vitest';

/** Windows are rounded to 10 s when authored; allow that plus bisection slack. */
const TOLERANCE_S = 15;

interface Contact {
  id: string;
  satelliteNoradId: number;
  windowStartS: number;
  windowEndS: number;
  stationId?: string;
}

function contactsOf(scenario: ScenarioData): Contact[] {
  return (scenario.settings as { contactSchedule?: { contacts: Contact[] } }).contactSchedule?.contacts ?? [];
}

function startMs(scenario: ScenarioData): number {
  const { scenarioStartDate, scenarioStartWallTime } = scenario.settings as { scenarioStartDate?: string; scenarioStartWallTime?: string };
  return Date.parse(`${scenarioStartDate}T${scenarioStartWallTime ?? '00:00:00'}Z`);
}

const planner = new PassPlannerService();
const scheduled = natsEuCampaignData.scenarios.filter((s) => s.number >= 1 && contactsOf(s).length > 0);

describe('nats-eu contact windows match the propagated pass at their station', () => {
  it('has at least the three two-station scenarios under test', () => {
    expect(scheduled.map((s) => s.number)).toEqual(expect.arrayContaining([5, 8, 9]));
  });

  for (const scenario of scheduled) {
    describe(`S${scenario.number} ${scenario.title}`, () => {
      const t0 = startMs(scenario);
      const maskDeg = scenarioMinElevation(scenario.settings);

      it('names the station for every contact', () => {
        for (const contact of contactsOf(scenario)) {
          expect(contact.stationId, `${contact.id} has no stationId`).toBeDefined();
          expect(
            scenario.settings.groundStations.some((gs) => gs.id === contact.stationId),
            `${contact.id}: unknown station ${contact.stationId}`
          ).toBe(true);
        }
      });

      for (const contact of contactsOf(scenario)) {
        it(`${contact.id} opens and closes on ${contact.stationId}'s real pass`, () => {
          const station = scenario.settings.groundStations.find((gs) => gs.id === contact.stationId);
          const satellite = scenario.settings.satellites.find((sat): sat is OrbitalSatellite => sat instanceof OrbitalSatellite && sat.noradId === contact.satelliteNoradId);
          expect(station, 'station').toBeDefined();
          expect(satellite, 'orbital satellite').toBeDefined();
          if (!station || !satellite) {
            return;
          }

          const observer = observerFromLocation(station.location, station.id);
          const windowStartMs = t0 + contact.windowStartS * 1000;
          const windowEndMs = t0 + contact.windowEndS * 1000;
          const horizonHours = Math.ceil((contact.windowEndS + 3600) / 3600);
          const overlapping = (pass: SatellitePass) => pass.aosMs < windowEndMs && pass.losMs > windowStartMs;

          const horizonPass = planner.getPasses(satellite, t0, { horizonHours, minElevation: 0 as Degrees, observer, stepS: 10 }).find(overlapping);
          expect(horizonPass, `${contact.id}: no ${station.id} pass overlaps ${contact.windowStartS}-${contact.windowEndS} s`).toBeDefined();
          if (!horizonPass) {
            return;
          }

          // At the mask the pass may not exist at all (a graze); then the
          // horizon crossing is the only bound.
          const maskPass = planner.getPasses(satellite, t0, { horizonHours, minElevation: maskDeg, observer, stepS: 10 }).find(overlapping) ?? horizonPass;

          const aos0 = (horizonPass.aosMs - t0) / 1000;
          const los0 = (horizonPass.losMs - t0) / 1000;
          const aosMask = (maskPass.aosMs - t0) / 1000;
          const losMask = (maskPass.losMs - t0) / 1000;

          expect(contact.windowStartS, `${contact.id} start (horizon ${aos0.toFixed(0)} s, mask ${aosMask.toFixed(0)} s)`).toBeGreaterThanOrEqual(aos0 - TOLERANCE_S);
          expect(contact.windowStartS, `${contact.id} start (horizon ${aos0.toFixed(0)} s, mask ${aosMask.toFixed(0)} s)`).toBeLessThanOrEqual(aosMask + TOLERANCE_S);
          expect(contact.windowEndS, `${contact.id} end (mask ${losMask.toFixed(0)} s, horizon ${los0.toFixed(0)} s)`).toBeGreaterThanOrEqual(losMask - TOLERANCE_S);
          expect(contact.windowEndS, `${contact.id} end (mask ${losMask.toFixed(0)} s, horizon ${los0.toFixed(0)} s)`).toBeLessThanOrEqual(los0 + TOLERANCE_S);
        });
      }
    });
  }
});
