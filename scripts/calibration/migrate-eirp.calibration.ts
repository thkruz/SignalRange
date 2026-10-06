/**
 * Phase 19.3 EIRP migration: what an authored uplink `power` becomes.
 *
 * Before 19.3 a carrier authored on a satellite's uplink (and a
 * transponder-path interference event) was a "power at the transponder
 * input" in dBm, tuned to the simulator: the transponder clipped it softly
 * above 47 dBm, added kTB·NF and 36.5 dB of gain, and that was the downlink
 * EIRP. Since 19.3 it is the uplinker's EIRP (dBm), put through the
 * free-space loss from the satellite's reference range into a transponder
 * with an SFD, a G/T and a saturated EIRP.
 *
 * For every satellite in every scenario this prints, per transponder, the
 * pre-19.3 downlink EIRP of each authored uplink carrier and interference
 * event, and the uplink EIRP that gives the same downlink EIRP through the
 * transponder physics now authored on the satellite (all of the
 * transponder's authored carriers on together, solved jointly). The values
 * in the campaign files were set from this table; rerun it after changing a
 * transponder's physics.
 *
 *   MIGRATE_EIRP=1 npx vitest run --config vitest.calibration.config.mts migrate-eirp
 */

import { vi } from 'vitest';

vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: () => ({ satellites: [], getSatByNoradId: () => null, isDeveloperMode: false, groundStations: [] }),
    destroy: () => undefined,
  },
}));

import type { Satellite, Transponder } from '@app/equipment/satellite/satellite';
import { operateTransponder } from '@app/equipment/satellite/transponder-model';
import { SCENARIOS } from '@app/scenario-manager';
import type { RfSignal } from '@app/types';

/** The pre-19.3 transponder: soft clip above 47 dBm (cap 50), + kTB·NF (290 K, 3.5 dB), + 36.5 dB */
export function legacyDownlinkDbm(inputDbm: number, bandwidthHz: number, gainDb = 36.5): number {
  let p = inputDbm;
  if (p > 47) {
    const excess = p - 47;
    p = Math.min(47 + excess / (1 + excess / 10), 50);
  }
  const noiseDbm = 10 * Math.log10(1.38e-23 * 290 * bandwidthHz * 10 ** 0.35 * 1000);
  p = 10 * Math.log10(10 ** (p / 10) + 10 ** (noiseDbm / 10));

  return p + gainDb;
}

const fsplDb = (hz: number, km: number): number => 32.45 + 20 * Math.log10(km) + 20 * Math.log10(hz / 1e6);

interface Uplink {
  signalId: string;
  frequency: number;
  bandwidth: number;
  /** The authored pre-19.3 input power, dBm */
  legacyPowerDbm: number;
  /** Legacy transponder gain (CUBEHOP's VU-XPD authored 132 dB) */
  legacyGainDb?: number;
}

/**
 * Uplink EIRPs (dBm) that reproduce each carrier's legacy downlink EIRP
 * through `tp` with all of them on together: a fixed-point iteration on the
 * per-carrier input, which converges while the targets fit under the
 * saturated EIRP.
 */
export function solveUplinkEirps(tp: Transponder, rangeKm: number, uplinks: Uplink[]): { signalId: string; targetDbw: number; eirpDbm: number; achievedDbw: number }[] {
  const targets = uplinks.map((u) => legacyDownlinkDbm(u.legacyPowerDbm, u.bandwidth, u.legacyGainDb));
  const iso = uplinks.map(() => -120);
  for (let iter = 0; iter < 400; iter++) {
    const point = operateTransponder(
      tp.physics,
      uplinks.map((u, i) => ({ signalId: u.signalId, isoPowerDbm: iso[i], bandwidthHz: u.bandwidth })),
      tp.uplinkFrequency as number,
      tp.bandwidth as number
    );
    let worst = 0;
    point.carriers.forEach((c, i) => {
      const err = targets[i] - c.eirpDbm;
      worst = Math.max(worst, Math.abs(err));
      iso[i] += Math.max(-10, Math.min(10, err * 0.7));
    });
    if (worst < 0.005) break;
  }
  const final = operateTransponder(
    tp.physics,
    uplinks.map((u, i) => ({ signalId: u.signalId, isoPowerDbm: iso[i], bandwidthHz: u.bandwidth })),
    tp.uplinkFrequency as number,
    tp.bandwidth as number
  );

  return uplinks.map((u, i) => ({
    signalId: u.signalId,
    targetDbw: targets[i] - 30,
    eirpDbm: iso[i] + fsplDb(u.frequency, rangeKm),
    achievedDbw: final.carriers[i].eirpDbm - 30,
  }));
}

const enabled = process.env.MIGRATE_EIRP === '1';

describe.skipIf(!enabled)('phase 19.3 EIRP migration', () => {
  it('prints the uplink EIRP that keeps each authored downlink', () => {
    const seen = new Set<Satellite>();
    const rows: string[] = [];
    for (const scenario of SCENARIOS) {
      const settings = scenario.settings as unknown as {
        satellites?: Satellite[];
        interferenceEvents?: Array<{ id: string; satelliteNoradId?: number; frequency: number; bandwidth: number; power: number; polarization: RfSignal['polarization']; path?: string; legacyPowerDbm?: number }>;
      };
      for (const sat of settings.satellites ?? []) {
        const events = (settings.interferenceEvents ?? []).filter((e) => (e.path ?? 'transponder') === 'transponder' && e.satelliteNoradId === sat.noradId);
        if (seen.has(sat) && events.length === 0) continue;
        seen.add(sat);
        const rangeKm = sat.uplinkReferenceRangeKm();
        for (const tp of sat.transponders) {
          const authored = sat.externalSignal.filter((s) => sat.transponderFor(s.frequency, s.polarization) === tp);
          const evs = events.filter((e) => sat.transponderFor(e.frequency as never, e.polarization) === tp);
          if (authored.length + evs.length === 0) continue;
          const legacy = (s: { signalId?: string; id?: string }) => (s as { legacyPowerDbm?: number }).legacyPowerDbm;
          const uplinks: Uplink[] = [
            ...authored.map((s) => ({ signalId: s.signalId, frequency: s.frequency as number, bandwidth: s.bandwidth as number, legacyPowerDbm: legacy(s) ?? (s.power as number) })),
            ...evs.map((e) => ({ signalId: `event:${e.id}`, frequency: e.frequency, bandwidth: e.bandwidth, legacyPowerDbm: e.legacyPowerDbm ?? e.power })),
          ];
          for (const r of solveUplinkEirps(tp, rangeKm, uplinks)) {
            rows.push(
              `${scenario.id.padEnd(24)} ${sat.name.padEnd(16)} ${tp.id.padEnd(10)} ${r.signalId.padEnd(34)} range ${rangeKm.toFixed(0).padStart(6)} km  old DL ${r.targetDbw.toFixed(2).padStart(7)} dBW  -> uplink EIRP ${r.eirpDbm.toFixed(1).padStart(6)} dBm (DL ${r.achievedDbw.toFixed(2)} dBW)`
            );
          }
        }
      }
    }
    process.stdout.write(`\n${rows.join('\n')}\n`);
    expect(rows.length).toBeGreaterThan(0);
  });
});
