/**
 * @file station-tag.ts - Which ground station an equipment event belongs to
 * @description Every equipment Ops Log entry carries the station's id, so
 * lines from two sites can be told apart (nats-r3-s11-F1) and a single-station
 * log reads like the alarm lines that already name it (nats-r6-s15-F1).
 *
 * The stations are read from window.signalRange.simulationManager rather than
 * by importing SimulationManager, which itself imports the ops log.
 */

import type { GroundStation } from '@app/assets/ground-station/ground-station';
import type { RFFrontEndCore } from '@app/equipment/rf-front-end/rf-front-end-core';

interface WindowWithSimulation {
  signalRange?: {
    simulationManager?: {
      groundStations?: GroundStation[];
    };
  };
}

/** The scenario's ground stations (empty outside a running scenario) */
export function scenarioGroundStations(): GroundStation[] {
  const w = globalThis as unknown as WindowWithSimulation;

  return w.signalRange?.simulationManager?.groundStations ?? [];
}

/**
 * Station id for an Ops Log tag: the first station matching the predicate,
 * single-station scenarios included (nats-r6-s15-F1), or undefined when none
 * matches.
 */
export function stationTagFor(predicate: (gs: GroundStation) => boolean): string | undefined {
  try {
    return scenarioGroundStations().find(predicate)?.state?.id;
  } catch {
    return undefined;
  }
}

/** The only station's id when the scenario has exactly one: any RF event is its */
function soleStationTag_(): string | undefined {
  const stations = scenarioGroundStations();

  return stations.length === 1 ? stations[0].state?.id : undefined;
}

/** Every module state object of an RF front end */
function rfModuleStates_(rf: RFFrontEndCore): unknown[] {
  return [
    rf.omtModule?.state,
    rf.bucModule?.state,
    rf.hpaModule?.state,
    rf.agcModule?.state,
    rf.notchFilterModule?.state,
    rf.filterModule?.state,
    rf.lnbModule?.state,
    rf.couplerModule?.state,
    rf.gpsdoModule?.state,
  ];
}

/**
 * Station owning an RF front-end module whose state object is `state`. A
 * module's sync() replaces its state object, so an event carrying an older one
 * falls back to the front end's uuid (a whole RFFrontEndState) and, in a
 * single-station scenario, to the only station.
 */
export function stationTagForRfState(state: unknown): string | undefined {
  if (state === undefined || state === null) return soleStationTag_();
  const uuid = typeof state === 'object' && 'uuid' in state && typeof state.uuid === 'string' ? state.uuid : undefined;

  return stationTagFor((gs) => (gs.rfFrontEnds ?? []).some((rf) => rfModuleStates_(rf).includes(state) || (uuid !== undefined && rf.state?.uuid === uuid))) ?? soleStationTag_();
}

/** Station owning an RF front-end module (the module object itself) */
export function stationTagForRfModule(module: unknown): string | undefined {
  const tag = stationTagFor((gs) =>
    (gs.rfFrontEnds ?? []).some(
      (rf) =>
        rf.omtModule === module ||
        rf.bucModule === module ||
        rf.hpaModule === module ||
        rf.agcModule === module ||
        rf.notchFilterModule === module ||
        rf.filterModule === module ||
        rf.lnbModule === module ||
        rf.couplerModule === module ||
        rf.gpsdoModule === module
    )
  );

  return tag ?? (module ? soleStationTag_() : undefined);
}

/** Station owning the antenna whose state object (or uuid) is given */
export function stationTagForAntennaState(state: { uuid?: string } | undefined): string | undefined {
  if (!state) return undefined;

  return stationTagFor((gs) => (gs.antennas ?? []).some((a) => a.state === state || (state.uuid !== undefined && a.state?.uuid === state.uuid)));
}

/**
 * Station owning the transmitter or receiver with this equipment uuid, or
 * (TX events) holding this modem object
 */
export function stationTagForModemUuid(uuid: string | undefined, modem?: unknown): string | undefined {
  if (!uuid && modem === undefined) return undefined;

  return stationTagFor(
    (gs) =>
      (gs.transmitters ?? []).some((t) => (modem !== undefined && t.state?.modems?.includes(modem as never)) || (uuid !== undefined && t.state?.uuid === uuid)) ||
      (gs.receivers ?? []).some((r) => uuid !== undefined && (r.state?.uuid === uuid || ownUuid_(r) === uuid))
  );
}

/**
 * The equipment object's own uuid (BaseEquipment.uuid), which Receiver events
 * carry even when its state was authored with another uuid (Phase 33 D9,
 * nats-r7-s03-F1). Read structurally: the field is protected.
 */
function ownUuid_(equipment: unknown): string | undefined {
  const uuid = (equipment as { uuid?: unknown } | null)?.uuid;
  return typeof uuid === 'string' ? uuid : undefined;
}

/** Ops Log source label: "VT-01 TX", or "TX" when no station matched (outside a scenario) */
export function stationSource(system: string, stationId: string | undefined): string {
  return stationId ? `${stationId} ${system}` : system;
}
