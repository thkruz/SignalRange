/**
 * @file terminal-link - What the terminal app can reach (phase 40, D6)
 * @description Router down: no app at all. Router up but the dish unreachable: the app shows
 * "Can't reach your SkyLink" over stale data. Pure logic over a narrow reader.
 */

import type { PhysicalPlantManager } from '@app/physical/physical-plant-manager';

export type TerminalLinkState = 'connected' | 'dish-unreachable' | 'no-router';

export interface TerminalLinkReader {
  routerPowered(): boolean;
  routerBooted(): boolean;
  /** The post laptop is on the router (powered; Wi-Fi/LAN path up) */
  laptopOnRouter(): boolean;
  /** Dish-router cable and connectors are not cutting the link */
  dishCablePathIntact(): boolean;
  /** Dish powered and finished booting */
  dishBooted(): boolean;
}

export class TerminalLink {
  private readonly reader_: TerminalLinkReader;

  constructor(reader: TerminalLinkReader) {
    this.reader_ = reader;
  }

  state(): TerminalLinkState {
    const r = this.reader_;
    if (!r.routerPowered() || !r.routerBooted() || !r.laptopOnRouter()) {
      return 'no-router';
    }

    return r.dishCablePathIntact() && r.dishBooted() ? 'connected' : 'dish-unreachable';
  }
}

export interface TerminalPartIds {
  router: string;
  laptop: string;
  dish: string;
}

export const SKYLINK_PART_IDS: TerminalPartIds = { router: 'skylink-router', laptop: 'laptop', dish: 'skylink-dish' };

/** The slice of the plant manager the link reads (structural, so tests need no plant) */
export type TerminalPlantSurface = Pick<PhysicalPlantManager, 'isPartPowered' | 'isLinkDropped' | 'getPartState'>;

export function plantLinkReader(plant: TerminalPlantSurface, ids: TerminalPartIds = SKYLINK_PART_IDS): TerminalLinkReader {
  const booted = (id: string): boolean => {
    const s = plant.getPartState(id);

    return s ? s.powered && !s.rebooting : plant.isPartPowered(id);
  };

  return {
    routerPowered: () => plant.getPartState(ids.router)?.powered ?? plant.isPartPowered(ids.router),
    routerBooted: () => booted(ids.router),
    laptopOnRouter: () => plant.isPartPowered(ids.laptop),
    dishCablePathIntact: () => !plant.isLinkDropped(ids.dish),
    dishBooted: () => booted(ids.dish),
  };
}
