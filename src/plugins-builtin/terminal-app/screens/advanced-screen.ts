/**
 * @file advanced-screen - SkyLink Advanced: read-only debug data for support (phase 40, WP6, D16)
 * @description The fields a consumer app lists for support. This is where a careful player can
 * see that the location is not valid and no GNSS satellites are seen. The screen never says why
 * (D5). The skin's `debugFields` pick and order the rows. "Copy debug data" puts the same rows on
 * the clipboard as plain text.
 */
import { formatAge } from '../strings';
import type { TerminalSnapshot, TerminalView } from '../terminal-app-model';
import type { TerminalDebugFieldId } from '../terminal-skin';
import { type AdvancedStringKey, trAdvanced } from './advanced-strings';
import { escapeHtml, type TerminalScreen, type TerminalScreenContext, type TerminalScreenFactory } from './terminal-screen';

export interface DebugRow {
  id: TerminalDebugFieldId;
  label: string;
  value: string;
}

const FIELD_LABEL: Record<TerminalDebugFieldId, AdvancedStringKey> = {
  'software-version': 'advanced.field.softwareVersion',
  uptime: 'advanced.field.uptime',
  'boot-count': 'advanced.field.bootCount',
  'location-valid': 'advanced.field.location',
  'gnss-satellites': 'advanced.field.gnssSatellites',
  'alert-flags': 'advanced.field.alerts',
  'tilt-boresight': 'advanced.field.tilt',
  'obstruction-fraction': 'advanced.field.obstruction',
};

const degrees = (value: number | null): string => (value === null ? trAdvanced('advanced.value.notAvailable') : trAdvanced('advanced.value.degrees', { value: Math.round(value) }));

function fieldValue(id: TerminalDebugFieldId, data: TerminalSnapshot): string {
  const d = data.debug;
  switch (id) {
    case 'software-version':
      return d.softwareVersion;
    case 'uptime':
      return formatAge(data.uptimeS);
    case 'boot-count':
      return String(data.bootCount);
    case 'location-valid':
      return trAdvanced(d.locationValid ? 'advanced.value.locationValid' : 'advanced.value.locationNotValid');
    case 'gnss-satellites':
      return String(d.gnssSatellites);
    case 'alert-flags':
      return data.alerts.length > 0 ? data.alerts.map((a) => a.text).join(', ') : trAdvanced('advanced.value.noAlerts');
    case 'tilt-boresight':
      return d.tiltDeg === null && d.boresightDeg === null ? trAdvanced('advanced.value.notAvailable') : `${degrees(d.tiltDeg)} / ${degrees(d.boresightDeg)}`;
    case 'obstruction-fraction':
      return d.obstructionFraction === null ? trAdvanced('advanced.value.notAvailable') : trAdvanced('advanced.value.percent', { value: (d.obstructionFraction * 100).toFixed(1) });
  }
}

/** The rows for a snapshot, in the skin's field order */
export function debugRows(fields: readonly TerminalDebugFieldId[], data: TerminalSnapshot): DebugRow[] {
  return fields.map((id) => ({ id, label: trAdvanced(FIELD_LABEL[id]), value: fieldValue(id, data) }));
}

/** Plain text for the clipboard, one "Label: value" line per row */
export function debugText(rows: readonly DebugRow[]): string {
  return [trAdvanced('advanced.copy.header'), ...rows.map((r) => `${r.label}: ${r.value}`)].join('\n');
}

export const createAdvancedScreen: TerminalScreenFactory = (ctx: TerminalScreenContext): TerminalScreen => {
  let root: HTMLElement | null = null;
  let rows: DebugRow[] = [];
  let copyHandler: (() => void) | null = null;

  const q = <T extends HTMLElement>(id: string): T => root?.querySelector(`#adv-${id}`) as T;
  const note = (text: string): void => {
    q('note').textContent = text;
  };

  const onCopy = async (): Promise<void> => {
    if (rows.length === 0) {
      return;
    }
    try {
      await navigator.clipboard.writeText(debugText(rows));
      note(trAdvanced('advanced.copy.done'));
    } catch {
      note(trAdvanced('advanced.copy.failed'));
    }
  };

  return {
    id: 'advanced',
    mount(container) {
      root = container;
      container.innerHTML = `
        <h2 class="mb-3">${trAdvanced('advanced.title')}</h2>
        <p class="text-secondary">${trAdvanced('advanced.intro')}</p>
        <div class="text-warning mb-2" id="adv-offline" hidden>${trAdvanced('advanced.offline')}</div>
        <div class="card"><div class="card-body">
          <dl class="row mb-0" id="adv-list"><dt class="col-12 text-secondary">${trAdvanced('advanced.noData')}</dt></dl>
        </div></div>
        <div class="mt-3 d-flex align-items-center gap-3">
          <button class="btn btn-primary" id="adv-copy" disabled>${trAdvanced('advanced.copy.button')}</button>
          <span class="text-secondary" id="adv-note" role="status"></span>
        </div>`;
      copyHandler = () => void onCopy();
      q('copy').addEventListener('click', copyHandler);
    },
    sync(view: TerminalView) {
      q('offline').hidden = !view.stale;
      if (!view.data) {
        rows = [];
        q('copy').toggleAttribute('disabled', true);

        return;
      }
      rows = debugRows(ctx.skin.debugFields, view.data);
      q('list').innerHTML = rows
        .map(
          (r) =>
            `<dt class="col-sm-5 text-secondary" data-field="${r.id}">${escapeHtml(r.label)}</dt><dd class="col-sm-7 font-monospace" data-value="${r.id}">${escapeHtml(r.value)}</dd>`
        )
        .join('');
      q('copy').toggleAttribute('disabled', false);
    },
    dispose() {
      if (root && copyHandler) {
        q('copy')?.removeEventListener('click', copyHandler);
      }
      copyHandler = null;
      root = null;
    },
  };
};
