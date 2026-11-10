import type { HypothesisScope, NotebookTarget } from './field-notebook-panel';

/** The slice of the plant and service model the hypothesis picker reads */
export interface NotebookTargetSource {
  plant: { getLabel(id: string): string; getPartIds(): string[]; getConnectorIds(): string[]; getCableIds(): string[] } | null;
  services: { getServiceIds(): string[]; getPath(id: string): { label?: string; providerId?: string } | undefined } | null;
}

/** The camp network every service on site shares; a segment hypothesis can name it */
export const SHARED_LOCAL_TARGET: NotebookTarget = { id: 'local-shared-service', label: 'The shared local service' };

function humanize(id: string): string {
  const spaced = id.replace(/[-_:]+/gu, ' ').trim();

  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Alphabetical by label so authoring order cannot point at the answer */
function byLabel(list: NotebookTarget[]): NotebookTarget[] {
  return [...list].sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Hypothesis targets the player can pick for a scope. Every candidate is listed with a readable
 * label (never a raw part id) and the list is sorted by label, not filtered or ordered by the fault.
 */
export function buildNotebookTargets(scope: HypothesisScope, src: NotebookTargetSource): NotebookTarget[] {
  const { plant, services: model } = src;
  const label = (id: string): string => {
    const l = plant?.getLabel(id);

    return l && l !== id ? l : humanize(id);
  };
  const services = (model?.getServiceIds() ?? []).map((id) => ({ id, label: model?.getPath(id)?.label ?? humanize(id) }));
  if (scope === 'segment') return byLabel(services.length > 0 ? [...services, SHARED_LOCAL_TARGET] : services);
  if (scope === 'endpoint') return byLabel(services);
  if (scope === 'provider') {
    const ids = new Set<string>();
    for (const s of services) {
      const pid = model?.getPath(s.id)?.providerId;
      if (pid) ids.add(pid);
    }

    return byLabel([...ids].map((id) => ({ id, label: humanize(id) })));
  }
  if (!plant) return [];
  const parts = plant.getPartIds().map((id) => ({ id, label: label(id) }));
  if (scope === 'power') return byLabel(parts);

  return byLabel([...parts, ...plant.getConnectorIds().map((id) => ({ id, label: label(id) })), ...plant.getCableIds().map((id) => ({ id, label: label(id) }))]);
}
