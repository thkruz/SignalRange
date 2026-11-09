import type { SatelliteState, TransponderConfig } from '@app/equipment/satellite/satellite';
import { SignalOrigin } from '@app/signal-origin';
import type { dBi, dBm, Hertz, RfFrequency, RfSignal } from '@app/types';
import { geoBeaconHz, geoBeaconSignalId } from './geo-beacon';

/**
 * RF templates give a hydrated constellation member its transponders and
 * default state (Phase 3, P3-WP2, carriers in P3-WP5). Both shipped templates
 * are simple placeholders: plausible carrier plans and power levels for the
 * simulation to work with, not a model of any operator's real signal plan.
 * Override per member or per constellation via `rfTemplate`.
 */
export interface RfBandEnvelope {
  /** Lower edge of the downlink band, Hz */
  loHz: number;
  /** Upper edge of the downlink band, Hz */
  hiHz: number;
  /** Largest carrier EIRP in the band, dBm */
  maxEirpDbm: number;
  /** Occupied bandwidth of one carrier, Hz */
  carrierBwHz: number;
}

/**
 * What the RF candidate narrowing (plan 2.4) needs to know about a group
 * without hydrating any member: where its carriers are, how strong they can
 * be, and how close and how fast the members get.
 */
export interface RfEnvelope {
  bands: readonly RfBandEnvelope[];
  /** Smallest slant range a member of the group can have to any station, km */
  minRangeKm: number;
  /** Largest apparent angular rate of a member seen from the ground, deg/s */
  maxRateDegS: number;
  /**
   * Average share of a member's peak EIRP that is aimed at one ground point,
   * dB (negative or zero). Applies to the aggregate noise term only: a
   * Starlink has tens of spot beams, a GEO global beam fills its footprint.
   */
  aggregateDutyDb: number;
}

export interface RfTemplate {
  id: string;
  label: string;
  /** Band, power and geometry summary for candidate narrowing. Absent: the group is never narrowed out. */
  envelope?: RfEnvelope;
  build(ctx?: { noradId: number }): { rxSignal: RfSignal[]; beaconSignal: RfSignal[]; state: Partial<SatelliteState> };
}

export const STARLINK_KU_USER_DL = 'starlink-ku-user-dl';
export const GEO_C_KU_GENERIC = 'geo-c-ku-generic';

interface CarrierPlan {
  prefix: string;
  /** Centre frequency of the first carrier, Hz */
  firstHz: number;
  stepHz: number;
  count: number;
  bandwidthHz: number;
  eirpDbm: number;
  /** Uplink centre = downlink centre + this, Hz */
  uplinkOffsetHz: number;
  polarizations: readonly ('H' | 'V' | 'LHCP' | 'RHCP')[];
  relay: boolean;
}

/** One carrier per transponder, emitted as that transponder's beacon (unique signal ids per member). */
function carrierTransponders_(noradId: number, plan: CarrierPlan): TransponderConfig[] {
  const out: TransponderConfig[] = [];
  for (let k = 0; k < plan.count; k++) {
    const down = (plan.firstHz + k * plan.stepHz) as RfFrequency;
    const pol = plan.polarizations[k % plan.polarizations.length];
    out.push({
      id: `${plan.prefix}-${noradId}-${k}`,
      uplinkCenterFrequency: (down + plan.uplinkOffsetHz) as RfFrequency,
      bandwidth: plan.bandwidthHz as Hertz,
      frequencyOffset: plan.uplinkOffsetHz as Hertz,
      polarization: pol,
      isActive: plan.relay,
      beacon: {
        frequency: down,
        signalId: `${plan.prefix}-${noradId}-${k}`,
        serverId: 1,
        noradId,
        power: plan.eirpDbm as dBm,
        bandwidth: plan.bandwidthHz as Hertz,
        modulation: 'QPSK',
        fec: '3/4',
        polarization: pol,
        feed: '',
        isDegraded: false,
        origin: SignalOrigin.SATELLITE_TX,
        noiseFloor: null,
        gainInPath: 0 as dBi,
      } as unknown as RfSignal,
    } as TransponderConfig);
  }

  return out;
}

/** GEO beacon: 0.2 MHz CW-like carrier, V polarization, 60 dBm EIRP (traffic carriers are 80 dBm). */
const GEO_BEACON_BW_HZ = 0.2e6;
const GEO_BEACON_EIRP_DBM = 60;

/** One CW-like beacon per GEO member, at the frequency derived from its NORAD number (see geo-beacon.ts). */
function beaconTransponder_(noradId: number): TransponderConfig {
  const down = geoBeaconHz(noradId) as RfFrequency;
  const id = geoBeaconSignalId(noradId);

  return {
    id,
    uplinkCenterFrequency: (down + 2.3e9) as RfFrequency,
    bandwidth: GEO_BEACON_BW_HZ as Hertz,
    frequencyOffset: 2.3e9 as Hertz,
    polarization: 'V',
    isActive: false,
    beacon: {
      frequency: down,
      signalId: id,
      serverId: 1,
      noradId,
      power: GEO_BEACON_EIRP_DBM as dBm,
      bandwidth: GEO_BEACON_BW_HZ as Hertz,
      modulation: 'CW',
      fec: 'null',
      polarization: 'V',
      feed: '',
      isDegraded: false,
      origin: SignalOrigin.SATELLITE_TX,
      noiseFloor: null,
      gainInPath: 0 as dBi,
    } as unknown as RfSignal,
  } as TransponderConfig;
}

/**
 * Starlink-like Ku user downlink: eight 240 MHz carriers on a 250 MHz raster
 * across 10.7 to 12.7 GHz, right-hand circular, 36 dBW (66 dBm) EIRP each,
 * no bent-pipe relay. Lowest operating altitude taken as 340 km. Placeholder.
 */
const STARLINK_BAND: RfBandEnvelope = { loHz: 10.7e9, hiHz: 12.7e9, maxEirpDbm: 66, carrierBwHz: 240e6 };
const STARLINK_PLAN: Omit<CarrierPlan, 'prefix'> = {
  firstHz: 10.82e9,
  stepHz: 250e6,
  count: 8,
  bandwidthHz: 240e6,
  eirpDbm: STARLINK_BAND.maxEirpDbm,
  uplinkOffsetHz: 3.2e9,
  polarizations: ['RHCP'],
  relay: false,
};

/**
 * Generic GEO C/Ku: six 36 MHz C-band carriers (3.74 to 4.14 GHz, 38 dBW
 * EIRP, alternating H/V) and six 36 MHz Ku carriers (11.72 to 12.12 GHz,
 * 50 dBW). Bent-pipe transponders with the usual 2.225 GHz (C) and 2.3 GHz
 * (Ku) uplink offsets, plus one narrow CW beacon per satellite whose frequency
 * comes from its NORAD number (geo-beacon.ts). Placeholder.
 */
const GEO_C_BAND: RfBandEnvelope = { loHz: 3.7e9, hiHz: 4.2e9, maxEirpDbm: 68, carrierBwHz: 36e6 };
const GEO_KU_BAND: RfBandEnvelope = { loHz: 11.7e9, hiHz: 12.2e9, maxEirpDbm: 80, carrierBwHz: 36e6 };
const GEO_C_PLAN: Omit<CarrierPlan, 'prefix'> = {
  firstHz: 3.74e9,
  stepHz: 80e6,
  count: 6,
  bandwidthHz: 36e6,
  eirpDbm: GEO_C_BAND.maxEirpDbm,
  uplinkOffsetHz: 2.225e9,
  polarizations: ['H', 'V'],
  relay: true,
};
const GEO_KU_PLAN: Omit<CarrierPlan, 'prefix'> = {
  firstHz: 11.72e9,
  stepHz: 80e6,
  count: 6,
  bandwidthHz: 36e6,
  eirpDbm: GEO_KU_BAND.maxEirpDbm,
  uplinkOffsetHz: 2.3e9,
  polarizations: ['H', 'V'],
  relay: true,
};

const templates_ = new Map<string, RfTemplate>([
  [
    STARLINK_KU_USER_DL,
    {
      id: STARLINK_KU_USER_DL,
      label: 'Starlink Ku user downlink (placeholder carriers)',
      envelope: { bands: [STARLINK_BAND], minRangeKm: 340, maxRateDegS: 1.4, aggregateDutyDb: -10 },
      build: (ctx) => ({
        rxSignal: [],
        beaconSignal: [],
        state: {
          frequencyOffset: 11.7e9 as Hertz,
          ...(ctx ? { transponderConfigs: carrierTransponders_(ctx.noradId, { prefix: 'SLK', ...STARLINK_PLAN }) } : {}),
        },
      }),
    },
  ],
  [
    GEO_C_KU_GENERIC,
    {
      id: GEO_C_KU_GENERIC,
      label: 'Generic GEO C/Ku (placeholder carriers)',
      envelope: { bands: [GEO_C_BAND, GEO_KU_BAND], minRangeKm: 35_786, maxRateDegS: 0.01, aggregateDutyDb: 0 },
      build: (ctx) => ({
        rxSignal: [],
        beaconSignal: [],
        state: {
          frequencyOffset: 3.7e9 as Hertz,
          ...(ctx
            ? {
                transponderConfigs: [
                  ...carrierTransponders_(ctx.noradId, { prefix: 'GEOC', ...GEO_C_PLAN }),
                  ...carrierTransponders_(ctx.noradId, { prefix: 'GEOK', ...GEO_KU_PLAN }),
                  beaconTransponder_(ctx.noradId),
                ],
              }
            : {}),
        },
      }),
    },
  ],
]);

export function registerRfTemplate(template: RfTemplate): void {
  templates_.set(template.id, template);
}

export function getRfTemplate(id: string): RfTemplate | undefined {
  return templates_.get(id);
}

/** Template a group gets when neither the constellation nor the member names one. */
export function defaultTemplateForGroup(groupId: string): string {
  return /geo/iu.test(groupId) ? GEO_C_KU_GENERIC : STARLINK_KU_USER_DL;
}
