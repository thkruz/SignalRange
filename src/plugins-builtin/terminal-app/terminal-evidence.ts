/**
 * @file terminal-evidence - Every SkyLink app view and action is evidence (phase 40 WP7, D7)
 * @description Records what the player saw and did in the app into the plant `EvidenceLog` with
 * provenance `terminal-app`. The background feed (`TerminalAppModel.update`, `peekSample`) stays
 * unlogged; only the player opening a screen or pressing a button writes here.
 *
 * Views: one observation entry per screen opened, `verb: 'app-view'`, `subject: 'skylink-app:<screen>'`,
 * text = a one-line summary of what the screen showed. Dedupe lives in `EvidenceLog.recordAppView`:
 * the same screen with the same text is recorded once per `APP_VIEW_DEDUPE_S` (60) sim seconds; a
 * changed view is recorded at once. Home also takes real `takeSample` reads of the registration and
 * account layers it shows, only when its view entry was recorded and the dish is reachable.
 *
 * Actions: reboot, snow melt and sleep are plant verbs and reach the log through the plant action
 * log, so they are not recorded again here. Speed test, obstruction check/stop/reset and Wi-Fi
 * change are app-only and become `kind: 'action'` entries with `verb: 'app-<name>'`.
 */
import type { EvidenceLog } from '@app/physical/evidence-log';
import { getActiveField } from '@app/physical/field-hooks';
import { PhysicalPlantService } from '@app/physical/physical-plant-service';
import type { ServiceLayer, ServiceSample } from '@app/physical/service-types';
import type { TerminalAppModel, TerminalView } from './terminal-app-model';
import type { TerminalScreenId } from './terminal-skin';

/** App-only action verbs, as written on evidence entries (scenarios use them in `wrongCauseActions`) */
export const APP_ACTION_VERBS = {
  speedTest: 'app-speed-test',
  obstructionCheck: 'app-obstruction-check',
  obstructionStop: 'app-obstruction-stop',
  obstructionReset: 'app-obstruction-reset',
  wifi: 'app-wifi',
} as const;

export interface TerminalEvidenceDeps {
  log: () => EvidenceLog | null;
  services: () => { takeSample(serviceId: string, layer: ServiceLayer, via: 'terminal-app'): ServiceSample } | null;
}

const liveDeps: TerminalEvidenceDeps = {
  log: () => getActiveField()?.evidence ?? null,
  services: () => PhysicalPlantService.servicesOrNull(),
};

const pct = (f: number): string => `${Math.round(f * 100)}%`;

export class TerminalEvidence {
  constructor(
    private readonly model_: TerminalAppModel,
    private readonly deps_: TerminalEvidenceDeps = liveDeps
  ) {}

  /** The player opened `screen`; `view` is what the shell is showing */
  viewScreen(screen: TerminalScreenId, view: TerminalView = this.model_.view()): void {
    const log = this.deps_.log();
    if (!log) {
      return;
    }
    const entry = log.recordAppView(screen, this.describe_(screen, view));
    if (entry && screen === 'home' && view.link === 'connected') {
      this.sampleHome_();
    }
  }

  /** An app-only action (see `APP_ACTION_VERBS`) */
  action(screen: TerminalScreenId, verb: string, text: string): void {
    this.deps_.log()?.recordAppAction(screen, verb, text);
  }

  /** The real reads behind the Home status: registration and account, through the app's provenance */
  private sampleHome_(): void {
    const services = this.deps_.services();
    const serviceId = this.model_.serviceId();
    if (!services || !serviceId) {
      return;
    }
    services.takeSample(serviceId, 'registration', 'terminal-app');
    services.takeSample(serviceId, 'account', 'terminal-app');
  }

  private describe_(screen: TerminalScreenId, view: TerminalView): string {
    if (view.link === 'no-router') {
      return `SkyLink app, ${screen}: could not connect (no router).`;
    }
    const prefix = view.link === 'dish-unreachable' ? `Can't reach your SkyLink${view.ageS === null ? '' : `, data ${Math.round(view.ageS / 60)} min old`}. ` : '';
    const d = view.data;
    if (!d) {
      return `${prefix}SkyLink app, ${screen}: no data.`;
    }
    switch (screen) {
      case 'home':
        return `${prefix}SkyLink app, home: ${d.heroText}${d.alerts.length > 0 ? `; alerts: ${d.alerts.map((a) => a.text).join(', ')}` : '; no alerts'}.`;
      case 'obstructions': {
        const sum = this.model_.obstructions()?.summary();
        if (!sum) {
          return `${prefix}SkyLink app, obstructions: map not available.`;
        }

        return sum.coverage > 0
          ? `${prefix}SkyLink app, obstructions: ${pct(sum.obstructionFraction)} of the sky seen so far is blocked (${pct(sum.coverage)} seen).`
          : `${prefix}SkyLink app, obstructions: map empty, no check run yet.`;
      }
      case 'statistics':
        return `${prefix}SkyLink app, statistics: ${d.outages.length} outage(s) listed${d.outages.length > 0 ? `, latest: ${d.outages[d.outages.length - 1].causeLabel}` : ''}.`;
      case 'speed-test': {
        const tests = this.model_.speedTests();
        const last = tests[tests.length - 1];

        return `${prefix}SkyLink app, speed test: ${last ? `last result ${Math.round(last.downMbps)} down, ${Math.round(last.upMbps)} up Mbps` : 'no test run yet'}.`;
      }
      case 'settings':
        return `${prefix}SkyLink app, settings opened.`;
      case 'advanced': {
        const dbg = d.debug;

        return `${prefix}SkyLink app, advanced: location ${dbg.locationValid ? 'valid' : 'not valid'}, ${dbg.gnssSatellites} GNSS satellites, obstruction ${dbg.obstructionFraction === null ? 'unknown' : pct(dbg.obstructionFraction)}, boot count ${d.bootCount}.`;
      }
      default:
        return `${prefix}SkyLink app, ${screen}.`;
    }
  }
}
