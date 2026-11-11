import { capacityNote, METRIC_LABEL } from '@app/physical/reading-labels';
import type { ServiceModel } from '@app/physical/service-model';
import type { Freshness, LayerStatus, ServiceSample } from '@app/physical/service-types';

/**
 * Field evidence wording (no DOM): how a reading, its age and its freshness are printed. Shared by the
 * field service panel (device-light rows) and the handheld radio's call log.
 */

export const FRESHNESS_LABEL: Record<Freshness, string> = {
  current: 'Current',
  stale: 'Stale',
  invalidated: 'Invalidated',
  unavailable: 'Cannot see this',
};

export const STATUS_LABEL: Record<LayerStatus, string> = { up: 'Up', degraded: 'Degraded', down: 'Down', unknown: 'Unknown' };

/** Badge text: a Current reading also says when it gets old (a change on site can still end it sooner) */
export function badgeText(r: { freshness?: Freshness; sample?: ServiceSample | null; invalidatedWhy?: string }): string {
  if (!r.freshness) return '';
  if (r.freshness === 'current' && r.sample) return `${FRESHNESS_LABEL.current}, fresh until ${formatClock(r.sample.tS + r.sample.maxAgeS)}`;

  if (r.freshness === 'invalidated' && r.invalidatedWhy) return `${FRESHNESS_LABEL.invalidated}: ${r.invalidatedWhy}`;

  return FRESHNESS_LABEL[r.freshness];
}

export function formatClock(tS: number): string {
  const s = Math.max(0, Math.floor(tS));
  const mm = Math.floor(s / 60);

  return `elapsed ${String(mm).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function formatSampleValue(sample: ServiceSample): string {
  if (sample.value === 'unknown') {
    return 'No reading';
  }
  if (typeof sample.value === 'number') {
    const n = Math.round(sample.value * 10) / 10;
    if (sample.metric === 'jitterMs') {
      return `Jitter ${n} ms (mean change between 1 s delay readings, last ${sample.windowS ?? 60} s)`;
    }

    return `${METRIC_LABEL[sample.metric]}${capacityNote(sample)} ${n} ${sample.unit}`;
  }
  if (sample.value === 'down' && sample.metric !== 'status') {
    return `${METRIC_LABEL[sample.metric]}: no link`;
  }

  return STATUS_LABEL[sample.value];
}

/** An endpoint report of the application layer, with no workload run yet to back it */
export const UNTESTED_APPLICATION_TEXT = 'Not yet tested (the endpoint only reports for itself; run a workload)';

export function untestedApplication(model: ServiceModel, serviceId: string, sample: ServiceSample): boolean {
  return (
    sample.layer === 'application' &&
    sample.metric === 'status' &&
    sample.provenance === 'endpoint-report' &&
    sample.value === 'up' &&
    !model.samplesFor(serviceId).some((s) => s.provenance === 'workload-run')
  );
}
