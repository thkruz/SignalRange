/**
 * Shared authoring helpers for Campaign 6 report forms (gap package A): visible alternatives kept
 * apart from the accepted answers, and typed evidence groups instead of citation counts.
 */

import type { EvidenceGroup, EvidencePredicate } from '@app/physical/evidence-predicates';

/** Visible alternatives with the accepted answers named separately, so the list is not the answer key */
export const pick = (labels: Record<string, string>, accept: string[], backing?: Record<string, EvidenceGroup[]>) => ({
  choice: Object.keys(labels),
  labels,
  accept,
  ...(backing ? { backing } : {}),
});

/** A service reading (observation) of one layer, optionally with the values it must show */
export function reading(
  id: string,
  label: string,
  serviceId: string,
  layer: string,
  valueIn?: Array<string | number>,
  extra: Partial<EvidencePredicate> = {},
  min?: number
): EvidenceGroup {
  return { id, label, ...(min ? { min } : {}), match: { kind: 'observation', serviceId, layer, ...(valueIn ? { valueIn } : {}), ...extra } };
}

/** A hands-on observation of one of these parts or connectors (any verb unless given) */
export function checked(id: string, label: string, subjectIn: string[], extra: Partial<EvidencePredicate> = {}, min?: number): EvidenceGroup {
  return { id, label, ...(min ? { min } : {}), match: { kind: 'observation', subjectIn, ...extra } };
}

/** An effective repair action on one of these targets */
export function repaired(id: string, label: string, subjectIn: string[], verbIn?: string[]): EvidenceGroup {
  return { id, label, match: { kind: 'action', subjectIn, effective: true, ...(verbIn ? { verbIn } : {}) } };
}
