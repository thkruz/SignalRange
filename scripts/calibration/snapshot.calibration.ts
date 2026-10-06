/**
 * Phase 19.1 calibration snapshot: fly every scenario headlessly and record
 * what its stations actually receive, so each fidelity track can show which
 * authored numbers its model change moves.
 *
 *   npx vitest run --config vitest.calibration.config.mts
 *   node scripts/calibration/diff.mjs            # compare with the committed ledger
 *
 * Per scenario, per station antenna, per satellite: the station's chain is
 * built the way GroundStation does (antenna, RF front end, receiver; no
 * canvas analyzer), pointed with program-track and flown at 60 Hz. LEO: the
 * first pass above 5 deg within 12 h of the scenario clock, sampled once a
 * second. GEO and fixed satellites: one settled sample. For every carrier the
 * antenna receives it records IF power, the modem noise floor, C/N and lock,
 * plus gain, G/T and Tsys at the peak elevation and the LNB's noise
 * temperature. Clear sky only: weather is authored per scenario and would
 * make the ledger a function of when the pass happens to fall.
 *
 * The scenario's authored physical thresholds (receiver C/N, detection
 * power, link-budget ground truth) are copied beside the observables, so
 * diff.mjs can report the best-case margin of each against the station.
 *
 * Output: test/calibration/<scenario-id>.json (committed). Numbers are
 * rounded to 0.01 so a model change, not float noise, is what diffs.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { vi } from 'vitest';

let simNowMs = Date.UTC(2026, 0, 1, 12, 0, 0);

vi.mock('@app/simulation/sim-time', () => ({
  getSimulatedNowMs: () => simNowMs,
  getSimulatedNow: () => new Date(simNowMs),
}));

let simSatellites: Satellite[] = [];

vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: () => ({
      satellites: simSatellites,
      getSatsByAzEl: (az: number, el: number) => simSatellites.filter((sat) => Math.abs(sat.az - az) <= 1 && Math.abs(sat.el - el) <= 1),
      getSatByNoradId: (noradId: number) => simSatellites.find((s) => s.noradId === noradId) ?? null,
      isDeveloperMode: false,
      groundStations: [],
      update: () => undefined,
      draw: () => undefined,
      sync: () => undefined,
    }),
    destroy: () => undefined,
  },
}));

import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import type { AntennaCore } from '@app/equipment/antenna/antenna-core';
import { createAntenna } from '@app/equipment/antenna/antenna-factory';
import { Receiver, type ReceiverModemState } from '@app/equipment/receiver/receiver';
import { TapPoint } from '@app/equipment/rf-front-end/coupler-module/tap-points';
import { createRFFrontEnd } from '@app/equipment/rf-front-end/rf-front-end-factory';
import { OrbitalSatellite, observerFromLocation } from '@app/equipment/satellite/orbital-satellite';
import type { Satellite } from '@app/equipment/satellite/satellite';
import { EventBus } from '@app/events/event-bus';
import type { ScenarioData } from '@app/ScenarioData';
import { SCENARIOS } from '@app/scenario-manager';
import { PassPlannerService } from '@app/services/pass-planner-service';
import { Rng, resolveScenarioSeed } from '@app/simulation/rng';
import type { Hertz, MHz, RfFrequency, RfSignal } from '@app/types';
import type { Degrees } from 'ootk';

const OUT_DIR = resolve(__dirname, '../../test/calibration');
const TICK_HZ = 60;
const LEO_HORIZON_H = 12;
const LEO_MIN_EL = 5 as Degrees;
/** Condition params that are physical thresholds (dB, dBm, K) */
const PHYSICAL_PARAMS = ['minCNRatio', 'maxCNRatio', 'cnHoldSeconds', 'minPower', 'maxSignalStrength', 'minMarginDb', 'maxNoiseTemperature', 'minOutputPower', 'maxImdLevel'];

const r2 = (x: number): number | null => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);

interface CarrierTrack {
  signalId: string;
  rfMHz: number;
  ifMHz: number;
  bandwidthMHz: number;
  modulation: string;
  fec: string;
  cn: number[];
  rxIfDbm: number[];
  noiseIfDbm: number[];
  locked: number;
  samples: number;
}

interface Settings {
  groundStations?: GroundStationConfig[];
  satellites?: Satellite[];
  scenarioStartDate?: string;
  scenarioStartWallTime?: string;
  linkBudget?: Record<string, number>;
}

function startMsOf(settings: Settings): number {
  if (!settings.scenarioStartDate) return Date.UTC(2026, 0, 1, 12, 0, 0);
  return Date.parse(`${settings.scenarioStartDate}T${settings.scenarioStartWallTime ?? '12:00:00'}Z`);
}

/** Authored physical thresholds, one row per condition that carries one */
function authoredThresholds(scenario: ScenarioData) {
  const rows: Array<{ objectiveId: string; condition: string; groundStation?: string; params: Record<string, number> }> = [];
  for (const objective of scenario.objectives ?? []) {
    for (const condition of objective.conditions) {
      const params: Record<string, number> = {};
      for (const key of PHYSICAL_PARAMS) {
        const value = (condition.params as Record<string, unknown> | undefined)?.[key];
        if (typeof value === 'number') params[key] = value;
      }
      if (Object.keys(params).length > 0) {
        rows.push({ objectiveId: objective.id, condition: condition.type, groundStation: objective.groundStation, params });
      }
    }
  }
  return rows;
}

/** One station antenna, its front end and a receiver, wired as GroundStation does */
function buildChain(station: GroundStationConfig, index: number) {
  document.body.innerHTML = '<div id="cal-fe"></div><div id="cal-rx"></div>';
  const key = index === 0 ? (station.antennaConfigKey ?? station.antennas[0]) : station.antennas[index];
  const state = { ...(station.antennasState?.[index] ?? {}), isPowered: true, isOperational: true };
  const antenna = createAntenna('cal-ant', 'headless', key, state, station.teamId ?? 1) as AntennaCore;
  antenna.attachStationLocation(station.location.latitude, station.location.longitude, station.location.elevation);
  const frontEnd = createRFFrontEnd('cal-fe', station.rfFrontEnds[index] ?? station.rfFrontEnds[0], 'standard');
  frontEnd.connectAntenna(antenna);
  antenna.attachRfFrontEnd(frontEnd);
  const receiver = new Receiver('cal-rx', [antenna], station.receivers?.[0], station.teamId ?? 1);
  receiver.connectRfFrontEnd(frontEnd);

  // Settle the LNB at its steady noise temperature (no warm-up transient)
  const lnb = frontEnd.lnbModule as unknown as { powerOnTimestamp_: number | null; updateNoiseTemperature_: () => void; state: { noiseTemperature: number; loFrequency: number } };
  lnb.powerOnTimestamp_ = null;
  for (let i = 0; i < 3000; i++) lnb.updateNoiseTemperature_();

  return { key, antenna, frontEnd, receiver, lnb };
}

/**
 * Where the AGC settles on receive noise alone (no carrier in the beam):
 * target minus the noise in the IF passband, clamped to its range. At the
 * max-gain rail this is the pre-AOS "AGC at max gain" board alarm (19.2).
 */
function agcOnNoise(chain: Chain) {
  const { frontEnd } = chain;
  frontEnd.update();
  const spm = frontEnd.couplerModule.signalPathManager;
  const agc = frontEnd.agcModule.state;
  const noiseInDbm = spm.getExternalNoise() - spm.agcGain;
  const gain = Math.max(agc.minGain, Math.min(agc.maxGain, agc.targetLevel - noiseInDbm));

  return {
    noiseInDbm: r2(noiseInDbm),
    filterMHz: r2(frontEnd.filterModule.state.bandwidth),
    settledGainDb: r2(gain),
    maxGainDb: r2(agc.maxGain),
    railedAtMax: gain >= agc.maxGain - 0.5,
  };
}

type Chain = ReturnType<typeof buildChain>;

function sample(chain: Chain, tracks: Map<string, CarrierTrack>): void {
  const { antenna, frontEnd, receiver } = chain;
  frontEnd.update();
  const spm = frontEnd.couplerModule.signalPathManager;
  const pathGain = spm.getTotalGainTo(TapPoint.RX_IF);
  const baseModem = receiver.state.modems[0];

  for (const sig of antenna.state.rxSignalsIn as RfSignal[]) {
    const ifHz = frontEnd.lnbModule.calculateIfFrequency(sig.frequency as RfFrequency) as number;
    let track = tracks.get(sig.signalId);
    if (!track) {
      track = {
        signalId: sig.signalId,
        rfMHz: (sig.frequency as number) / 1e6,
        ifMHz: ifHz / 1e6,
        bandwidthMHz: (sig.bandwidth as number) / 1e6,
        modulation: String(sig.modulation),
        fec: String(sig.fec),
        cn: [],
        rxIfDbm: [],
        noiseIfDbm: [],
        locked: 0,
        samples: 0,
      };
      tracks.set(sig.signalId, track);
    }
    const modem: ReceiverModemState = {
      ...baseModem,
      isPowered: true,
      frequency: (ifHz / 1e6) as MHz,
      bandwidth: ((sig.bandwidth as number) / 1e6) as MHz,
      modulation: sig.modulation,
      fec: sig.fec,
    };
    const info = receiver.getSignalsInBandwidth(modem);
    track.samples++;
    track.cn.push(info.cnRatio_dB);
    track.rxIfDbm.push((sig.power as number) + pathGain);
    track.noiseIfDbm.push(spm.getNoiseFloorAt(TapPoint.RX_IF, sig.bandwidth as Hertz).noiseFloorNoGain + spm.getTotalRxGain());
    if (info.hasLock) track.locked++;
  }
}

function summarise(track: CarrierTrack) {
  const finite = track.cn.filter(Number.isFinite).sort((a, b) => a - b);
  return {
    signalId: track.signalId,
    rfMHz: r2(track.rfMHz),
    ifMHz: r2(track.ifMHz),
    bandwidthMHz: r2(track.bandwidthMHz),
    modulation: track.modulation,
    fec: track.fec,
    samples: track.samples,
    peakCnDb: r2(finite.at(-1) ?? -Infinity),
    medianCnDb: r2(finite[Math.floor(finite.length / 2)] ?? -Infinity),
    peakRxIfDbm: r2(Math.max(...track.rxIfDbm)),
    noiseIfDbm: r2(track.noiseIfDbm[0] ?? -Infinity),
    lockedSamples: track.locked,
  };
}

function flyLink(chain: Chain, station: GroundStationConfig, sat: Satellite, startMs: number) {
  const { antenna } = chain;
  const tracks = new Map<string, CarrierTrack>();
  antenna.handleTrackingModeChange('program-track');
  antenna.handleTargetSatelliteChange(sat.noradId);

  let pass: { aosS: number; losS: number; maxEl: number } | null = null;
  let peakEl = sat.el as number;
  const tickMs = 1000 / TICK_HZ;

  if (sat instanceof OrbitalSatellite) {
    const observer = observerFromLocation(station.location, station.id);
    simNowMs = startMs;
    const found = new PassPlannerService().getPasses(sat, startMs, { horizonHours: LEO_HORIZON_H, minElevation: LEO_MIN_EL, observer })[0];
    if (!found) return { satellite: sat.name, noradId: sat.noradId, kind: 'leo', pass: null, carriers: [] };
    pass = { aosS: (found.aosMs - startMs) / 1000, losS: (found.losMs - startMs) / 1000, maxEl: found.maxEl };
    peakEl = found.maxEl;
    let tick = 0;
    for (simNowMs = found.aosMs - 30_000; simNowMs <= found.losMs; simNowMs += tickMs, tick++) {
      for (const s of simSatellites) s.update();
      antenna.update();
      if (tick % TICK_HZ === 0 && simNowMs >= found.aosMs) sample(chain, tracks);
    }
  } else {
    simNowMs = startMs;
    for (let tick = 0; tick < 30 * TICK_HZ; tick++) {
      for (const s of simSatellites) s.update();
      antenna.update();
    }
    for (let i = 0; i < 5; i++) {
      for (const s of simSatellites) s.update();
      antenna.update();
      sample(chain, tracks);
    }
  }

  const internals = antenna as unknown as { antennaGain_dBi: (f: number) => number; gOverT_dB_perK_: (f: number, el: number) => number; systemTempK_: (f: number, el: number) => number };
  const refHz = [...tracks.values()][0]?.rfMHz ? [...tracks.values()][0].rfMHz * 1e6 : null;

  return {
    satellite: sat.name,
    noradId: sat.noradId,
    kind: sat instanceof OrbitalSatellite ? 'leo' : 'fixed',
    pass: pass && { aosS: r2(pass.aosS), losS: r2(pass.losS), maxEl: r2(pass.maxEl) },
    atPeak:
      refHz === null
        ? null
        : {
            elevationDeg: r2(peakEl),
            frequencyMHz: r2(refHz / 1e6),
            gainDbi: r2(internals.antennaGain_dBi(refHz)),
            gOverTDbPerK: r2(internals.gOverT_dB_perK_(refHz, peakEl)),
            tsysK: r2(internals.systemTempK_(refHz, peakEl)),
          },
    carriers: [...tracks.values()].map(summarise),
  };
}

function snapshot(scenario: ScenarioData) {
  const settings = scenario.settings as unknown as Settings;
  const startMs = startMsOf(settings);
  Rng.setSeed(resolveScenarioSeed(scenario.id, scenario.seed, ''));
  simSatellites = settings.satellites ?? [];
  simNowMs = startMs;
  for (const sat of simSatellites) {
    (sat as unknown as { health: number }).health = 1;
  }

  const stations = (settings.groundStations ?? []).flatMap((station) =>
    station.antennas.map((_, index) => {
      const chain = buildChain(station, index);
      const agcOnNoiseAlone = agcOnNoise(chain);
      const links = simSatellites.map((sat) => flyLink(chain, station, sat, startMs));
      EventBus.destroy();
      return {
        stationId: station.id,
        antennaIndex: index,
        antennaConfig: chain.key,
        lnbLoMHz: chain.lnb.state.loFrequency,
        lnbNoiseTempK: r2(chain.lnb.state.noiseTemperature),
        agcOnNoiseAlone,
        links,
      };
    })
  );

  return {
    scenarioId: scenario.id,
    title: scenario.title,
    authored: {
      linkBudget: settings.linkBudget ?? null,
      thresholds: authoredThresholds(scenario),
    },
    stations,
  };
}

describe('calibration snapshot', () => {
  it('flies every scenario and writes the ledger', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    // The engine warns per frame (e.g. gain queried out of band); across 74
    // scenarios that overflows vitest's console relay. The ledger is the output.
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, method).mockImplementation(() => undefined);
    }
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
    mkdirSync(OUT_DIR, { recursive: true });
    const only = process.env.CALIBRATION_ONLY?.split(',');
    const failures: string[] = [];

    for (const scenario of SCENARIOS) {
      if (only && !only.includes(scenario.id)) continue;
      let entry: unknown;
      try {
        entry = snapshot(scenario);
      } catch (error) {
        failures.push(`${scenario.id}: ${(error as Error).message}`);
        entry = { scenarioId: scenario.id, title: scenario.title, error: (error as Error).message };
      }
      writeFileSync(resolve(OUT_DIR, `${scenario.id}.json`), `${JSON.stringify(entry, null, 2)}\n`);
      EventBus.destroy();
      document.body.innerHTML = '';
    }

    expect(failures).toEqual([]);
  });
});
