import { badgeText, formatClock, formatSampleValue, UNTESTED_APPLICATION_TEXT, untestedApplication } from '@app/physical/field-evidence-format';
import { LAYER_LABEL } from '@app/physical/reading-labels';
import type { ServiceModel } from '@app/physical/service-model';
import type { Freshness, LayerStatus, SampleProvenance, ServiceLayer, ServiceSample } from '@app/physical/service-types';

/**
 * Field radio calls (Phase 44 slice 3): the rules behind the C6 handheld radio, kept apart from its DOM.
 *
 * Each channel is a party the player can call. The pilot answers what her terminal and the provider show
 * (pilot-report evidence). The remote operator answers whether the application works at the far end, and each
 * endpoint the scenario names has its own channel for its own report (endpoint-report evidence). A question is
 * one (service, layer, endpoint) reading. The answer is the same `takeSample` the old Check button took, so
 * costs, freshness and observation limits are unchanged; this module only words the call and the log.
 */

export type RadioChannelKind = 'pilot' | 'operator' | 'endpoint';

export interface RadioQuestion {
  /** `service|layer|endpoint` */
  key: string;
  serviceId: string;
  layer: ServiceLayer;
  endpointId?: string;
  /** What the player asks, as they would say it */
  text: string;
}

export interface RadioChannel {
  /** Stable id: 'pilot', 'operator' or `endpoint:<id>` */
  id: string;
  kind: RadioChannelKind;
  via: Extract<SampleProvenance, 'pilot-report' | 'endpoint-report'>;
  /** Channel number on the display */
  number: number;
  /** Short display tag (upper case, fits the LCD) */
  tag: string;
  /** Who answers, for the log and the subtitle */
  party: string;
  questions: RadioQuestion[];
}

export function humanizeId(id: string): string {
  const s = id.replace(/[-_]+/gu, ' ').trim();

  return s ? s[0].toUpperCase() + s.slice(1) : id;
}

const LAYER_ASK: Partial<Record<ServiceLayer, string>> = {
  registration: 'Is your terminal registered?',
  provider: 'Is the provider network normal?',
  application: 'Is the application working?',
};

/** The channels a service model offers, in dial order */
export function radioChannels(model: ServiceModel): RadioChannel[] {
  const ids = model.getServiceIds();
  const label = (id: string) => model.getPath(id)?.label ?? id;
  const channels: RadioChannel[] = [
    {
      id: 'pilot',
      kind: 'pilot',
      via: 'pilot-report',
      number: 1,
      tag: 'PILOT',
      party: 'Pilot',
      questions: ids.flatMap((serviceId) =>
        (['registration', 'provider'] as const).map((layer) => ({ key: `${serviceId}|${layer}|`, serviceId, layer, text: `${label(serviceId)}: ${LAYER_ASK[layer]}` }))
      ),
    },
    {
      id: 'operator',
      kind: 'operator',
      via: 'endpoint-report',
      number: 2,
      tag: 'REM OP',
      party: 'Remote operator',
      questions: ids.map((serviceId) => ({ key: `${serviceId}|application|`, serviceId, layer: 'application' as const, text: `${label(serviceId)}: ${LAYER_ASK.application}` })),
    },
  ];
  const endpoints: string[] = [];
  for (const id of ids) for (const ep of model.getPath(id)?.endpointIds ?? []) if (!endpoints.includes(ep)) endpoints.push(ep);
  for (const ep of endpoints) {
    const name = humanizeId(ep);
    channels.push({
      id: `endpoint:${ep}`,
      kind: 'endpoint',
      via: 'endpoint-report',
      number: channels.length + 1,
      tag: name.toUpperCase().slice(0, 12),
      party: name,
      questions: ids
        .filter((id) => model.getPath(id)?.endpointIds?.includes(ep))
        .map((serviceId) => ({
          key: `${serviceId}|application|${ep}`,
          serviceId,
          layer: 'application' as const,
          endpointId: ep,
          text: `${label(serviceId)}: Do you have service?`,
        })),
    });
  }

  return channels;
}

/** The party who answered a sample, for log lines (also samples taken before the radio was built) */
export function partyFor(sample: ServiceSample): string {
  if (sample.provenance === 'pilot-report') return 'Pilot';
  if (sample.endpointId) return humanizeId(sample.endpointId);

  return 'Remote operator';
}

const STATUS_SAY: Record<'registration' | 'provider' | 'application', Record<LayerStatus, string>> = {
  registration: {
    up: 'My terminal shows registered.',
    degraded: 'Terminal is registered but it keeps dropping.',
    down: 'Terminal is not registered.',
    unknown: "I can't tell from here.",
  },
  provider: {
    up: 'Provider network looks normal.',
    degraded: 'Provider network is slow and patchy.',
    down: 'Provider network is down at my end.',
    unknown: "I can't tell from here.",
  },
  application: {
    up: 'Application is working at my end.',
    degraded: 'Application works, but badly.',
    down: 'Application is not working.',
    unknown: "I can't tell from here.",
  },
};

/** What the party says over the speaker for a sample (the call log keeps the formal reading) */
export function replyText(model: ServiceModel, sample: ServiceSample): string {
  const layer = sample.layer === 'registration' || sample.layer === 'provider' || sample.layer === 'application' ? sample.layer : null;
  if (!layer || typeof sample.value === 'number') return `${formatSampleValue(sample)}. Over.`;
  if (untestedApplication(model, sample.serviceId, sample)) return 'App says it is up, but nothing has been run through it yet. Over.';

  return `${STATUS_SAY[layer][sample.value]} Over.`;
}

export interface CallLogEntry {
  sampleId: string;
  time: string;
  party: string;
  /** "SkyLink · Terminal link" */
  subject: string;
  reading: string;
  freshness: Freshness;
  badge: string;
  /** The party reported the layer as down (the pad marks it) */
  down: boolean;
}

/** The call log: every pilot and endpoint report in the model, newest first */
export function callLog(model: ServiceModel, limit = 14): CallLogEntry[] {
  const out: CallLogEntry[] = [];
  for (const id of model.getServiceIds()) {
    for (const s of model.samplesFor(id)) {
      if (s.provenance !== 'pilot-report' && s.provenance !== 'endpoint-report') continue;
      const freshness = model.freshness(s);
      const why = freshness === 'invalidated' ? model.invalidation(s) : null;
      out.push({
        sampleId: s.id,
        time: formatClock(s.tS),
        party: partyFor(s),
        subject: `${model.getPath(id)?.label ?? id} · ${LAYER_LABEL[s.layer]}${s.endpointId ? ` (${humanizeId(s.endpointId)})` : ''}`,
        reading: untestedApplication(model, id, s) ? UNTESTED_APPLICATION_TEXT : formatSampleValue(s),
        freshness,
        down: s.value === 'down',
        badge: badgeText({
          sample: s,
          freshness,
          invalidatedWhy: why ? (why.kind === 'event' ? `${why.label} at ${formatClock(why.atS)}` : `equipment or settings changed at ${formatClock(why.atS)}`) : undefined,
        }),
      });
    }
  }
  // Sample ids grow with time: sort by their sequence number
  const seq = (e: CallLogEntry) => Number(e.sampleId.replace(/\D+/gu, '')) || 0;

  return out.sort((a, b) => seq(b) - seq(a)).slice(0, limit);
}
