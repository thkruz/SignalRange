import { CampaignManager } from '@app/campaigns/campaign-manager';
import { ScenarioManager } from '@app/scenario-manager';
import { SimClock } from '@app/simulation/sim-clock';
import { SimulationManager } from '@app/simulation/simulation-manager';
import type { AppState } from '@app/sync/storage';
import { syncManager } from '@app/sync/storage';
import { ReplaySession } from '@app/user-account/replay-session';

/** A saved game for one scenario, as written to e2e/fixtures/checkpoints/*.json */
export interface TestCheckpoint {
  scenarioId: string;
  campaignId?: string;
  /** Objective ids that were complete when captured (informational) */
  completedObjectiveIds?: string[];
  state: AppState;
}

/** What a spectrum analyzer is drawing right now, in dBm per display pixel */
export interface SpectrumTraceSummary {
  /** Strongest pixel */
  peakDbm: number;
  /** Median pixel: the noise floor when the trace is mostly empty */
  floorDbm: number;
  /** Pixels in the trace */
  pixels: number;
  /** Level of the pixel nearest the requested frequency, when one was asked for and lies inside the span */
  levelAtDbm?: number;
}

export interface SrTestApi {
  /** The current game as an AppState, built by the same collector the progress save uses */
  captureCheckpoint(): TestCheckpoint;
  /** Summary of the live trace of one ground station analyzer, or null when the station or analyzer is missing */
  spectrumTrace(groundStationId: string, analyzerIndex?: number, atFrequencyHz?: number): SpectrumTraceSummary | null;
  /**
   * Run `ms` of simulation (run) time as fast as the machine allows: fixed steps in chunks, a macrotask yield
   * between chunks (the propagation worker answers there), no draw. Resolves with the sim ms actually advanced,
   * which is less than asked when the sim is paused for a reason that stops stepping or the wall cap hit.
   */
  advance(ms: number): Promise<number>;
}

declare global {
  interface Window {
    /** Set by an e2e init script before boot: the app serves it as an in-memory replay checkpoint */
    __SR_START_CHECKPOINT__?: { scenarioId: string; state: AppState; label?: string };
    __srTest?: SrTestApi;
  }
}

export function spectrumTrace(groundStationId: string, analyzerIndex = 0, atFrequencyHz?: number): SpectrumTraceSummary | null {
  const station = SimulationManager.getInstance().groundStations.find((gs) => gs.state.id === groundStationId);
  const analyzer = station?.spectrumAnalyzers[analyzerIndex];
  const data = analyzer?.spectrumDataProcessor.combinedData;
  if (!analyzer || !data || data.length === 0) return null;

  const sorted = Array.from(data).sort((a, b) => a - b);
  const summary: SpectrumTraceSummary = { peakDbm: sorted[sorted.length - 1], floorDbm: sorted[Math.floor(sorted.length / 2)], pixels: sorted.length };

  if (atFrequencyHz !== undefined) {
    const { centerFrequency, span } = analyzer.state;
    const fraction = (atFrequencyHz - (centerFrequency - span / 2)) / span;
    if (fraction >= 0 && fraction <= 1) {
      // A carrier is several pixels wide; read the strongest pixel within 1 MHz so a one-pixel offset cannot miss it
      const pixelHz = span / data.length;
      const centre = Math.round(fraction * (data.length - 1));
      const reach = Math.max(1, Math.round(1e6 / pixelHz));
      let best = Number.NEGATIVE_INFINITY;
      for (let i = Math.max(0, centre - reach); i <= Math.min(data.length - 1, centre + reach); i++) best = Math.max(best, data[i]);
      summary.levelAtDbm = best;
    }
  }

  return summary;
}

/** Frame length fed to SimulationManager.advance per call (its MAX_FRAME_MS clamp is 250). */
const BURST_FRAME_MS = 250;
/** Frames per chunk before yielding to the event loop. */
const BURST_FRAMES_PER_YIELD = 20;
/** Wall-time cap for one advance call, ms. */
const BURST_WALL_CAP_MS = 30000;

/**
 * Advance the simulation by `ms` of run time (SimClock.runMs, which keeps counting while a brief or quiz holds
 * scenario time). Measured on the sim clock, not on call count, because advance() holds steps while the
 * propagation worker is behind. Returns early when the sim cannot step (tab hidden, loading, menu).
 */
export async function burstAdvance(ms: number): Promise<number> {
  if (!(ms > 0) || !SimulationManager.hasInstance()) return 0;
  const sim = SimulationManager.getInstance();
  const startRun = SimClock.runMs();
  const startWall = performance.now();
  while (SimClock.runMs() - startRun < ms) {
    if (SimClock.isPaused('hidden') || SimClock.isPaused('loading') || SimClock.isPaused('menu')) break;
    if (performance.now() - startWall > BURST_WALL_CAP_MS) break;
    for (let i = 0; i < BURST_FRAMES_PER_YIELD; i++) {
      sim.advance(BURST_FRAME_MS);
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }
  return SimClock.runMs() - startRun;
}

/** Development builds only (the e2e builds); production bundles drop the hook, and it is inert even if reached. */
export function isTestHookEnabled(): boolean {
  return process.env.NODE_ENV === 'development';
}

export function captureCheckpoint(): TestCheckpoint {
  const scenarioId = ScenarioManager.getInstance().data.id;
  const state = JSON.parse(JSON.stringify(syncManager.getCurrentState())) as AppState;
  const completedObjectiveIds = (state.objectiveStates ?? []).filter((o) => o.isCompleted).map((o) => o.objective.id);

  return {
    scenarioId,
    campaignId: CampaignManager.getInstance().getCampaignForScenario(scenarioId)?.id,
    completedObjectiveIds,
    state,
  };
}

/**
 * Installs window.__srTest and, when an init script left a checkpoint on
 * window.__SR_START_CHECKPOINT__, starts a ReplaySession with it so the scenario
 * page restores that genuine saved state (no sign-in, backend writes blocked).
 * Call once, before the router resolves the first route.
 */
export function installTestHook(): void {
  if (!isTestHookEnabled() || typeof window === 'undefined') return;

  window.__srTest = { captureCheckpoint, spectrumTrace, advance: burstAdvance };

  const start = window.__SR_START_CHECKPOINT__;
  if (start?.scenarioId && start.state) {
    ReplaySession.start({ scenarioId: start.scenarioId, state: start.state, label: start.label ?? 'e2e checkpoint' });
  }
}
