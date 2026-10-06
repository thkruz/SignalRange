/**
 * Disturbances imposed on a station's timing reference from outside the
 * GPSDO (Phase 19.6). A GNSS spoofer that walks the receiver's time solution
 * drags the disciplined oscillator with it: while the GPSDO still trusts GNSS
 * its time error is the spoofer's offset and its frequency error is the rate
 * of that walk. GnssThreatManager registers the provider; the GPSDO reads it.
 * A small registry rather than an import keeps equipment free of the
 * scenario layer.
 */

export interface ReferenceDisturbance {
  /** Time error forced on the reference, µs */
  timeOffsetUs: number;
  /** Fractional frequency error forced on the reference (dimensionless) */
  fractionalFrequencyError: number;
}

type DisturbanceProvider = (groundStationId: string | null) => ReferenceDisturbance | null;

let provider_: DisturbanceProvider | null = null;

export const ReferenceDisturbances = {
  register(provider: DisturbanceProvider): void {
    provider_ = provider;
  },

  clear(): void {
    provider_ = null;
  },

  /** The disturbance on a station's GNSS-disciplined reference, or null */
  forStation(groundStationId: string | null): ReferenceDisturbance | null {
    return provider_ ? provider_(groundStationId) : null;
  },
};
