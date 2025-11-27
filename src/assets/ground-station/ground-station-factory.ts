import { GroundStation } from "./ground-station";
import type { GroundStationConfig } from "./ground-station-state";

/**
 * Factory function to create a GroundStation instance
 *
 * @param config - Ground station configuration
 * @returns GroundStation instance
 */
export function createGroundStation(config: GroundStationConfig): GroundStation {
  return new GroundStation(config);
}
