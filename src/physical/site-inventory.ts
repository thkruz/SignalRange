/**
 * @file site-inventory - Prune a plant config to the equipment present on a site (Campaign 6, M07)
 * @description Pure and DOM-free. `applySiteInventory` drops every part not listed in
 * `config.site.inventory`, then everything that needs a dropped part: cables with a missing end,
 * connectors on a missing part or cable, faults and events aimed at removed ids, and service paths
 * whose terminal is gone. A config without an inventory is returned unchanged.
 */

import type { PlantConfig } from './physical-plant-types';

export function applySiteInventory(config: PlantConfig): PlantConfig {
  const inventory = config.site?.inventory;
  if (!inventory) {
    return config;
  }
  const keep = new Set(inventory);
  const parts = config.parts.filter((p) => keep.has(p.id));
  const partIds = new Set(parts.map((p) => p.id));

  const cables = config.cables.filter((c) => partIds.has(c.from) && partIds.has(c.to));
  const cableIds = new Set(cables.map((c) => c.id));

  const connectors = config.connectors.filter((c) => {
    if (c.cableId !== undefined && !cableIds.has(c.cableId)) {
      return false;
    }
    if (c.partId !== undefined && !partIds.has(c.partId)) {
      return false;
    }

    return c.feeds === undefined || partIds.has(c.feeds);
  });
  const connectorIds = new Set(connectors.map((c) => c.id));

  const present = (id: string): boolean => partIds.has(id) || cableIds.has(id) || connectorIds.has(id);

  const result: PlantConfig = { ...config, parts, cables, connectors };
  if (config.faults) {
    result.faults = config.faults.filter((f) => present(f.target));
  }
  if (config.events) {
    result.events = config.events.map((e) => ({
      ...e,
      actions: e.actions.filter((a) => (a.kind === 'inject-fault' ? present(a.fault.target) : true)),
    }));
  }
  if (config.service) {
    result.service = { ...config.service, paths: config.service.paths.filter((p) => partIds.has(p.terminalPartId)) };
  }

  return result;
}
