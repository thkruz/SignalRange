import { isReportFiled, markReportFiled, type ReportFormResult, type ReportFormSpec, registerReportForm } from '@app/objectives/report-form-registry';
import { geoBeaconHz } from '@app/simulation/geo-beacon';

/**
 * GEO Belt Survey: identify a satellite by its beacon.
 *
 * Objective 1 asks for modem 1 to be tuned onto a satellite beacon with a usable
 * C/N. Objective 2 asks the player to file the NORAD number of the satellite
 * whose beacon that is. The beacon plan lookup in the form turns a NORAD number
 * into a beacon frequency and a frequency into the NORAD numbers using it.
 */

export const BEACON_REPORT_ID = 'geo-beacon-report';
/** C/N the modem must read on the beacon, dB */
export const BEACON_MIN_CN_DB = 10;
const LO_MHZ = 13_100;

interface RegistryLike {
  memberNoradIds(): Int32Array;
  memberIndexOf(norad: number): number;
  memberName(index: number): string;
}
interface ModemLike {
  isPowered: boolean;
  modemNumber: number;
}
interface ReceiverLike {
  state: { modems: ModemLike[] };
  getSignalsInBandwidth(modem: ModemLike): { hasCarrier: boolean; targetSignalId?: string; cnRatio_dB: number };
}
interface SimLike {
  registry?: RegistryLike;
  groundStations?: Array<{ receivers?: ReceiverLike[] }>;
}

const sim_ = (): SimLike | undefined => (globalThis as unknown as { signalRange?: { simulationManager?: SimLike } }).signalRange?.simulationManager;

const BEACON_ID = /^GEOB-(\d+)$/u;

/** NORAD number of the beacon modem 1 is measuring with at least `minCn` dB C/N, or null. */
export function tunedBeaconNorad(minCn = BEACON_MIN_CN_DB): number | null {
  const rx = sim_()?.groundStations?.[0]?.receivers?.[0];
  const modem = rx?.state.modems.find((m) => m.modemNumber === 1);

  if (!rx || !modem?.isPowered) return null;
  const info = rx.getSignalsInBandwidth(modem);
  const m = info.hasCarrier && info.cnRatio_dB >= minCn ? BEACON_ID.exec(info.targetSignalId ?? '') : null;

  return m ? Number(m[1]) : null;
}

/** Objective condition: modem 1 is tuned on a GEO beacon. */
export const beaconTuned = (): boolean => tunedBeaconNorad() !== null;

/** The report check: the NORAD the player named is the satellite whose beacon modem 1 is measuring. */
export function evaluateBeaconReport(values: Record<string, string>, tuned: number | null): ReportFormResult {
  const norad = Number(values.norad);

  if (!Number.isInteger(norad) || norad <= 0) return { ok: false, message: 'Enter the NORAD number as digits only.' };
  if (tuned === null) return { ok: false, message: 'Modem 1 is not on a beacon with enough C/N. Tune it first.' };
  if (norad !== tuned) return { ok: false, message: 'That is not the satellite whose beacon modem 1 is measuring.' };

  return { ok: true, message: `Confirmed: this beacon belongs to NORAD ${norad}.` };
}

/** Beacon plan lookup: a NORAD number gives its beacon, a frequency in MHz gives the numbers using it. */
export function beaconLookup(input: string, registry: RegistryLike | undefined): string {
  const v = Number(input);

  if (input === '' || !Number.isFinite(v) || v <= 0) return '';
  if (!input.includes('.')) {
    // A whole number is a NORAD number
    const f = geoBeaconHz(Math.round(v)) / 1e6;

    return `NORAD ${Math.round(v)}: beacon ${f.toFixed(1)} MHz, modem IF ${(LO_MHZ - f).toFixed(1)} MHz`;
  }
  if (!registry) return '';
  // A number with a decimal point is a frequency: RF in MHz, or IF in MHz (below the LNB LO)
  const rf = v < 5000 ? LO_MHZ - v : v;
  const hits: string[] = [];

  for (const norad of registry.memberNoradIds()) {
    if (Math.abs(geoBeaconHz(norad) / 1e6 - rf) < 0.26) hits.push(`${norad} ${registry.memberName(registry.memberIndexOf(norad))}`);
    if (hits.length >= 8) break;
  }

  return hits.length ? `Beacon ${rf.toFixed(1)} MHz: ${hits.join('; ')}` : `No satellite in the set uses ${rf.toFixed(1)} MHz`;
}

export const beaconReportForm: ReportFormSpec = {
  id: BEACON_REPORT_ID,
  title: 'Beacon ID',
  intro:
    'Every satellite sends one beacon whose frequency comes from its NORAD number. Tune modem 1 onto a beacon, then name the satellite. Lookup: type a NORAD number for its beacon, or a beacon frequency with a decimal point, such as 11450.5 (RF or IF, MHz), for the satellites that use it.',
  fields: [{ key: 'norad', label: 'NORAD number of the beacon', placeholder: '5 digits' }],
  submitLabel: 'Confirm',
  submit(values) {
    const res = evaluateBeaconReport(values, tunedBeaconNorad());

    if (res.ok) markReportFiled(BEACON_REPORT_ID, sim_()?.registry);

    return res;
  },
  lookup: { label: 'Beacon plan lookup', placeholder: 'NORAD, or MHz like 11450.5', run: (input) => beaconLookup(input, sim_()?.registry) },
};

registerReportForm(beaconReportForm);

/** Objective condition: the beacon ID was confirmed in this run. */
export const beaconReportFiled = (): boolean => isReportFiled(BEACON_REPORT_ID, sim_()?.registry);
