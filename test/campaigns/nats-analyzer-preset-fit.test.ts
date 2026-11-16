/**
 * Phase 27 AN lint: every nats spectrum-analyzer window shows its signal.
 *
 * For each scenario's analyzer preset (and each objective that asks the
 * player for a centre, span and amplitude window), the expected level of the
 * strongest carrier in the window is read from the calibration ledger (the
 * headless sim's per-carrier power at the RX IF tap, which is what the
 * analyzer displays) and put through the analyzer's own RBW response (a CW
 * beacon reads its power; a modulated carrier reads its density in the RBW).
 * It must sit inside [min + 10, max - 5] dB, and the RBW must be at most
 * span / 20 so a narrow signal is resolved. A window with no carrier in the
 * ledger (a preset the player is meant to re-tune, the loopback) only gets
 * the RBW check.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: () => ({ satellites: [], getSatByNoradId: () => null, isDeveloperMode: false, groundStations: [] }),
    destroy: () => undefined,
  },
}));

import { scenario1Data } from '@app/campaigns/nats/scenario1';
import { scenario2Data } from '@app/campaigns/nats/scenario2';
import { scenario3Data } from '@app/campaigns/nats/scenario3';
import { scenario4Data } from '@app/campaigns/nats/scenario4';
import { scenario5Data } from '@app/campaigns/nats/scenario5';
import { scenario6Data } from '@app/campaigns/nats/scenario6';
import { scenario7Data } from '@app/campaigns/nats/scenario7';
import { scenario8Data } from '@app/campaigns/nats/scenario8';
import { scenario9Data } from '@app/campaigns/nats/scenario9';
import { scenario10Data } from '@app/campaigns/nats/scenario10';
import { scenario11Data } from '@app/campaigns/nats/scenario11';
import { scenario12Data } from '@app/campaigns/nats/scenario12';
import { scenario13Data } from '@app/campaigns/nats/scenario13';
import { scenario14Data } from '@app/campaigns/nats/scenario14';
import { scenario15Data } from '@app/campaigns/nats/scenario15';
import { scenario16Data } from '@app/campaigns/nats/scenario16';
import { scenario17Data } from '@app/campaigns/nats/scenario17';
import { scenario18Data } from '@app/campaigns/nats/scenario18';
import { scenario19Data } from '@app/campaigns/nats/scenario19';
import { scenario20Data } from '@app/campaigns/nats/scenario20';
import { scenario21Data } from '@app/campaigns/nats/scenario21';
import { scenario22Data } from '@app/campaigns/nats/scenario22';
import { scenario23Data } from '@app/campaigns/nats/scenario23';
import { scenario24Data } from '@app/campaigns/nats/scenario24';
import { autoRbwHz, minRbwForSpanHz } from '@app/equipment/real-time-spectrum-analyzer/real-time-spectrum-analyzer';
import { SpectrumDataProcessor } from '@app/equipment/real-time-spectrum-analyzer/spectrum-data-processor';
import type { ScenarioData } from '@app/ScenarioData';

const SCENARIOS: ScenarioData[] = [
  scenario1Data,
  scenario2Data,
  scenario3Data,
  scenario4Data,
  scenario5Data,
  scenario6Data,
  scenario7Data,
  scenario8Data,
  scenario9Data,
  scenario10Data,
  scenario11Data,
  scenario12Data,
  scenario13Data,
  scenario14Data,
  scenario15Data,
  scenario16Data,
  scenario17Data,
  scenario18Data,
  scenario19Data,
  scenario20Data,
  scenario21Data,
  scenario22Data,
  scenario23Data,
  scenario24Data,
];

/** Headroom the signal needs under Max Amp, dB */
const TOP_MARGIN_DB = 5;
/** Room the signal needs over Min Amp, dB */
const BOTTOM_MARGIN_DB = 10;
/** Widest RBW for a span: span / 20 */
const MAX_RBW_FRACTION = 1 / 20;

interface LedgerCarrier {
  signalId: string;
  ifMHz: number;
  bandwidthMHz: number;
  modulation: string;
  peakRxIfDbm: number | null;
}

interface Ledger {
  stations?: { stationId: string; links: { satellite: string; carriers: LedgerCarrier[] }[] }[];
}

function ledgerOf(scenarioId: string): Ledger {
  try {
    return JSON.parse(readFileSync(resolve(__dirname, `../calibration/${scenarioId}.json`), 'utf8')) as Ledger;
  } catch {
    return {};
  }
}

/** The beacon's real linewidth: a CW line is drawn as the RBW filter's own shape */
function displayedDbm(carrier: LedgerCarrier, rbwHz: number, freqHz: number): number {
  const powerMw = 10 ** ((carrier.peakRxIfDbm as number) / 10);
  const isCw = carrier.modulation === 'CW';
  const symbolRate = isCw ? 0 : (carrier.bandwidthMHz * 1e6) / 1.2;
  const sigmaRbw = rbwHz / (2 * Math.sqrt(2 * Math.LN2));
  const sigmaShape = (0.2 * symbolRate) / 2.56;
  const sigma = Math.sqrt(sigmaRbw ** 2 + sigmaShape ** 2);
  const mw = SpectrumDataProcessor.rbwResponse(powerMw, carrier.ifMHz * 1e6, symbolRate, sigmaRbw, sigma, freqHz);

  return 10 * Math.log10(mw);
}

interface Window {
  label: string;
  stationId: string;
  centerHz: number;
  spanHz: number;
  rbwHz: number | null;
  minDbm?: number;
  maxDbm?: number;
}

/** The strongest carrier the window shows, at its displayed peak */
function expectedIn(ledger: Ledger, window: Window): { signalId: string; dbm: number } | null {
  const station = ledger.stations?.find((s) => s.stationId === window.stationId);
  if (!station) return null;
  const lo = window.centerHz - window.spanHz / 2;
  const hi = window.centerHz + window.spanHz / 2;
  const rbw = window.rbwHz === null ? autoRbwHz(window.spanHz) : Math.max(window.rbwHz, minRbwForSpanHz(window.spanHz));
  let best: { signalId: string; dbm: number } | null = null;
  for (const link of station.links) {
    for (const carrier of link.carriers) {
      if (carrier.peakRxIfDbm === null) continue;
      const f = carrier.ifMHz * 1e6;
      const half = (carrier.bandwidthMHz * 1e6) / 2;
      if (f + half < lo || f - half > hi) continue;
      // Peak inside the window: at the carrier, or the window edge nearest it
      const at = Math.min(hi, Math.max(lo, f));
      const dbm = displayedDbm(carrier, rbw, at);
      if (!best || dbm > best.dbm) best = { signalId: carrier.signalId, dbm };
    }
  }

  return best;
}

function presetWindows(scenario: ScenarioData): Window[] {
  const stations = (scenario.settings as unknown as { groundStations?: { id: string; spectrumAnalyzers?: Record<string, unknown>[] }[] }).groundStations ?? [];

  return stations.flatMap((station) =>
    (station.spectrumAnalyzers ?? []).slice(0, 1).map((sa) => ({
      label: `${scenario.id} ${station.id} preset`,
      stationId: station.id,
      centerHz: sa.centerFrequency as number,
      spanHz: sa.span as number,
      rbwHz: (sa.rbw as number | null | undefined) ?? null,
      minDbm: sa.minAmplitude as number,
      maxDbm: sa.maxAmplitude as number,
    }))
  );
}

/** Objectives that ask for a whole window (centre, span, min and max) */
function objectiveWindows(scenario: ScenarioData): Window[] {
  const out: Window[] = [];
  for (const objective of scenario.objectives ?? []) {
    const params = (type: string) => objective.conditions.find((c) => c.type === type)?.params as Record<string, unknown> | undefined;
    const centre = params('speca-center-frequency')?.centerFrequency as number | undefined;
    const span = params('speca-span-set')?.span as number | undefined;
    const min = params('speca-min-amplitude')?.minAmplitude as number | undefined;
    const max = params('speca-max-amplitude')?.maxAmplitude as number | undefined;
    if (centre === undefined || span === undefined || min === undefined || max === undefined) continue;
    const rbwParams = params('speca-rbw-set');
    out.push({
      label: `${scenario.id} objective ${objective.id}`,
      stationId: objective.groundStation ?? 'VT-01',
      centerHz: centre,
      spanHz: span,
      rbwHz: (rbwParams?.rbw as number | null | undefined) ?? null,
      minDbm: min,
      maxDbm: max,
    });
  }

  return out;
}

const rows = SCENARIOS.flatMap((scenario) => {
  const ledger = ledgerOf(scenario.id);
  return [...presetWindows(scenario), ...objectiveWindows(scenario)].map((window) => ({ window, expected: expectedIn(ledger, window) }));
});

// PRESET_FIT_REPORT=1 prints every window and its expected level
if (process.env.PRESET_FIT_REPORT) {
  for (const { window, expected } of rows) {
    console.log(
      `${window.label} | ${window.centerHz / 1e6} MHz / ${window.spanHz} Hz | RBW ${window.rbwHz ?? 'auto'} | ${window.minDbm}/${window.maxDbm} | ${expected ? `${expected.signalId} ${expected.dbm.toFixed(1)} dBm` : '-'}`
    );
  }
}

describe('nats analyzer windows fit their signal (phase 27 AN)', () => {
  it('finds analyzer windows in every scenario', () => {
    expect(rows.length).toBeGreaterThanOrEqual(SCENARIOS.length);
  });

  it.each(rows.map((row) => [row.window.label, row] as const))('%s: RBW resolves the span', (_label, { window }) => {
    if (window.rbwHz === null) return;
    expect(window.rbwHz, `${window.label}: RBW ${window.rbwHz} Hz > span/20 (${window.spanHz * MAX_RBW_FRACTION} Hz)`).toBeLessThanOrEqual(window.spanHz * MAX_RBW_FRACTION);
  });

  it.each(rows.filter((row) => row.expected !== null).map((row) => [row.window.label, row] as const))(
    '%s: the signal sits inside [min+10, max-5]',
    (_label, { window, expected }) => {
      const level = expected?.dbm as number;
      const where = `${window.label}: ${expected?.signalId} at ${level.toFixed(1)} dBm, window ${window.minDbm}/${window.maxDbm}`;
      expect(level, where).toBeLessThanOrEqual((window.maxDbm as number) - TOP_MARGIN_DB);
      expect(level, where).toBeGreaterThanOrEqual((window.minDbm as number) + BOTTOM_MARGIN_DB);
    }
  );
});
