import type { RFFrontEndState } from '@app/equipment/rf-front-end/rf-front-end-core';

/**
 * Recursively makes all properties optional.
 * Allows deep partial overrides for nested state objects.
 */
export type DeepPartial<T> = T extends object ? {
  [P in keyof T]?: DeepPartial<T[P]>;
} : T;

/**
 * RF Front End state without runtime-assigned properties.
 * These are assigned by the GroundStation class at instantiation.
 */
export type RfFrontEndConfig = Omit<RFFrontEndState, 'uuid' | 'teamId' | 'serverId'>;

/**
 * Deep merges source into target, creating a new object.
 * Arrays are replaced entirely (not merged).
 *
 * @param target - Base object with default values
 * @param source - Partial object with overrides
 * @returns New object with merged values
 */
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    const sourceValue = source[key];
    const targetValue = target[key];

    if (sourceValue !== undefined) {
      if (
        typeof sourceValue === 'object' &&
        sourceValue !== null &&
        !Array.isArray(sourceValue) &&
        typeof targetValue === 'object' &&
        targetValue !== null &&
        !Array.isArray(targetValue)
      ) {
        // Recursively merge nested objects
        result[key] = deepMerge(
          targetValue as Record<string, unknown>,
          sourceValue as Record<string, unknown>
        );
      } else {
        // Replace primitives, arrays, and null values
        result[key] = sourceValue;
      }
    }
  }

  return result;
}

/**
 * Creates an RF Front End configuration by merging overrides onto a base configuration.
 *
 * @param base - Base configuration with all required properties
 * @param overrides - Partial state to override defaults
 * @returns Complete RF Front End state ready for scenario configuration
 *
 * @example
 * // Scenario 2: Enable HPA for transmission
 * createRfFrontEnd(vermontGroundStation.rfFrontEnds[0], {
 *   hpa: { isHpaSwitchEnabled: true, isHpaEnabled: true }
 * })
 *
 * @example
 * // Scenario with cold-start LNB
 * createRfFrontEnd(vermontGroundStation.rfFrontEnds[0], {
 *   lnb: { isPowered: false, loFrequency: 0 as MHz, gain: 0 as dB },
 *   filter: { bandwidthIndex: 0 }
 * })
 */
export function createRfFrontEnd(
  base: Partial<RFFrontEndState>,
  overrides: DeepPartial<RfFrontEndConfig> = {}
): Partial<RFFrontEndState> {
  return deepMerge(base as RfFrontEndConfig, overrides);
}
