/**
 * M05 dependency graph: which plant ids sit on each service's path. Built once from PlantConfig.
 * A path is the terminal and the local parts, each with its power chain (poweredBy, viaCable,
 * feeding connectors), the cables attached to it and their connectors, plus the authored
 * `linkTargetIds`. Also feeds the path diagram (M17).
 */

import type { PlantConfig } from '@app/physical/physical-plant-types';

export class DependencyGraph {
  private readonly paths_ = new Map<string, Set<string>>();
  private readonly all_ = new Set<string>();
  private readonly chain_: (startId: string) => Set<string>;

  constructor(cfg: PlantConfig) {
    const parts = new Map(cfg.parts.map((p) => [p.id, p]));
    for (const p of cfg.parts) this.all_.add(p.id);
    for (const c of cfg.connectors) this.all_.add(c.id);
    for (const c of cfg.cables) this.all_.add(c.id);

    const addCable = (ids: Set<string>, cableId: string): void => {
      ids.add(cableId);
      for (const c of cfg.connectors) {
        if (c.cableId === cableId) ids.add(c.id);
      }
    };
    const chain = (startId: string): Set<string> => {
      const ids = new Set<string>();
      let current = parts.get(startId);
      for (let depth = 0; current && depth < 16; depth++) {
        ids.add(current.id);
        if (current.viaCable) addCable(ids, current.viaCable);
        for (const c of cfg.connectors) {
          if (c.feeds === current.id || c.partId === current.id) ids.add(c.id);
        }
        for (const cable of cfg.cables) {
          if (cable.from === current.id || cable.to === current.id) addCable(ids, cable.id);
        }
        current = current.poweredBy ? parts.get(current.poweredBy) : undefined;
      }

      return ids;
    };

    for (const path of cfg.service?.paths ?? []) {
      const ids = new Set<string>();
      for (const start of [path.terminalPartId, ...path.localPartIds]) {
        for (const id of chain(start)) ids.add(id);
      }
      for (const id of path.linkTargetIds ?? []) {
        ids.add(id);
        if (cfg.cables.some((c) => c.id === id)) addCable(ids, id);
      }
      this.paths_.set(path.id, ids);
    }
    this.chain_ = chain;
  }

  serviceIds(): string[] {
    return [...this.paths_.keys()];
  }

  /** Every part, connector and cable id on the service path (empty for an unknown service) */
  pathIds(serviceId: string): ReadonlySet<string> {
    return this.paths_.get(serviceId) ?? new Set();
  }

  /** The part, its power chain, and the cables and connectors on that chain */
  upstreamOf(partId: string): ReadonlySet<string> {
    return this.chain_(partId);
  }

  servicesFor(targetId: string): string[] {
    return [...this.paths_].filter(([, ids]) => ids.has(targetId)).map(([id]) => id);
  }

  allIds(): ReadonlySet<string> {
    return this.all_;
  }

  /**
   * Candidate causes for the services showing a symptom. With no symptom known (nothing sampled
   * yet, or no service model) every service path counts, or every plant id when no paths exist.
   */
  candidates(symptomServiceIds: readonly string[]): Set<string> {
    const out = new Set<string>();
    const wanted = symptomServiceIds.filter((id) => this.paths_.has(id));
    const source = wanted.length > 0 ? wanted : this.serviceIds();
    for (const id of source) {
      for (const t of this.paths_.get(id) ?? []) out.add(t);
    }

    return out.size > 0 ? out : new Set(this.all_);
  }
}
