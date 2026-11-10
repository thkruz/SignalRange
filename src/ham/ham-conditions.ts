/**
 * @file ham-conditions - Condition factory for Campaign 3 (ham-sdr)
 * @description Every factory returns a `custom` Condition (`id: 'c3:<name>'`) whose evaluator
 * reads only the HamStationManager singleton. With no manager every evaluator is false, so a
 * scenario outside C3 can never complete one by accident. Evidence-based checks take an optional
 * `afterEvent` so only evidence logged after that event counts.
 */

import type { Condition } from '@app/objectives/objective-types';
import { HamStationManager } from './ham-station-manager';
import type { HamContactRecord, HamMeasurement, RadioSettings } from './ham-types';
import type { DmrAccessCode } from './ops/dmr';
import type { RepeaterAccessCode } from './ops/repeater';

const mgr = (): HamStationManager | null => (HamStationManager.isInitialized() ? HamStationManager.getInstance() : null);

function make(name: string, description: string, evaluator: (m: HamStationManager) => boolean): Condition {
  return {
    id: `c3:${name}`,
    type: 'custom',
    description,
    params: {
      evaluator: () => {
        const m = mgr();
        return m ? evaluator(m) : false;
      },
    },
    mustMaintain: false,
  };
}

/** Evaluate a condition built here against a specific manager (headless tests) */
export function evaluateWith(c: Condition, m: HamStationManager): boolean {
  const eval_ = c.params?.evaluator;
  if (!eval_) return false;
  const prev = HamStationManager.isInitialized() ? HamStationManager.getInstance() : null;
  (HamStationManager as unknown as { instance_: HamStationManager | null }).instance_ = m;
  try {
    return eval_();
  } finally {
    (HamStationManager as unknown as { instance_: HamStationManager | null }).instance_ = prev;
  }
}

const after = (m: HamStationManager, afterEvent?: string): number | null => m.afterSeq(afterEvent);
const eventsAfter = (m: HamStationManager, name: string, afterEvent?: string) => {
  const a = after(m, afterEvent);

  return a === null ? [] : m.events(name).filter((e) => e.seq > a);
};

// ---- receiving ----

export function heard(
  emitterId: string,
  minIntelligibility: number,
  opts: { deviceId?: string; afterEvent?: string; sinceRevision?: number } = {},
  description = `Hear ${emitterId}`
): Condition {
  return make(
    `heard:${emitterId}:${minIntelligibility}:${opts.deviceId ?? ''}:${opts.afterEvent ?? ''}`,
    description,
    (m) => m.bestIntelligibility(emitterId, opts) >= minIntelligibility
  );
}

// ---- measuring ----

export interface MeasuredSpec {
  instrument: HamMeasurement['instrument'];
  quantity: string;
  placement?: Record<string, string>;
  min?: number;
  max?: number;
  underLoad?: boolean;
  afterEvent?: string;
  /** Only readings taken under the current station configuration count (default true) */
  current?: boolean;
}

export function measured(spec: MeasuredSpec, description = `Measure ${spec.quantity}`): Condition {
  return make(`measured:${JSON.stringify(spec)}`, description, (m) =>
    m
      .measurements({ instrument: spec.instrument, quantity: spec.quantity, placement: spec.placement, underLoad: spec.underLoad, afterEvent: spec.afterEvent })
      .some((x) => (spec.current === false || m.isCurrent(x)) && (spec.min === undefined || x.value >= spec.min) && (spec.max === undefined || x.value <= spec.max))
  );
}

export function sweepMinSwrNear(fMHz: number, tolMHz: number, opts: { afterEvent?: string; maxSwr?: number } = {}, description = `Analyzer dip near ${fMHz} MHz`): Condition {
  return make(`sweepMinSwrNear:${fMHz}:${tolMHz}:${opts.afterEvent ?? ''}:${opts.maxSwr ?? ''}`, description, (m) =>
    m
      .measurements({ instrument: 'analyzer', quantity: 'sweep', afterEvent: opts.afterEvent })
      .some(
        (x) =>
          m.isCurrent(x) && x.context?.uncalibrated !== true && Math.abs(x.value - fMHz) <= tolMHz && (opts.maxSwr === undefined || Number(x.context?.minSwr ?? 99) <= opts.maxSwr)
      )
  );
}

export interface SwrFilter {
  min?: number;
  max?: number;
  /** Path termination at the time of the reading ('antenna', 'dummy-load' ...) */
  termination?: string;
  terminationDeviceId?: string;
  afterEvent?: string;
  current?: boolean;
}

export function swrReading(filter: SwrFilter, description = 'Read the SWR'): Condition {
  return make(`swrReading:${JSON.stringify(filter)}`, description, (m) =>
    m
      .measurements({ instrument: 'swr-meter', quantity: 'swr', afterEvent: filter.afterEvent })
      .some(
        (x) =>
          (filter.current === false || m.isCurrent(x)) &&
          (filter.min === undefined || x.value >= filter.min) &&
          (filter.max === undefined || x.value <= filter.max) &&
          (!filter.termination || x.context?.termination === filter.termination) &&
          (!filter.terminationDeviceId || x.context?.terminationDeviceId === filter.terminationDeviceId)
      )
  );
}

/** A voltage reading on a DC system, under transmit load, at or below maxV */
export function brownoutCaptured(dcId: string, maxV: number, opts: { afterEvent?: string } = {}, description = 'Capture the voltage sag under load'): Condition {
  return make(`brownoutCaptured:${dcId}:${maxV}:${opts.afterEvent ?? ''}`, description, (m) =>
    m.measurements({ instrument: 'multimeter', quantity: 'voltage', underLoad: true, placement: { target: dcId }, afterEvent: opts.afterEvent }).some((x) => x.value <= maxV)
  );
}

// ---- events and bench work ----

export function eventHappened(name: string, opts: { afterEvent?: string } = {}, description = name): Condition {
  return make(`event:${name}:${opts.afterEvent ?? ''}`, description, (m) => eventsAfter(m, name, opts.afterEvent).length > 0);
}

export function worksheetCorrect(id: string, description = `Complete worksheet ${id}`): Condition {
  return make(`worksheet:${id}`, description, (m) => m.worksheet(id)?.correct === true);
}

export function connectionSeated(connectionId: string, description = 'Seat the connector'): Condition {
  return make(`seated:${connectionId}`, description, (m) => m.connection(connectionId)?.seated === true);
}

export function faultCleared(faultId: string, description = `Clear ${faultId}`): Condition {
  return make(`faultCleared:${faultId}`, description, (m) => m.faultCleared(faultId));
}

export function txRefused(code: string, opts: { afterEvent?: string } = {}, description = `Transmit refused (${code})`): Condition {
  return make(`txRefused:${code}:${opts.afterEvent ?? ''}`, description, (m) => eventsAfter(m, `txRefused:${code}`, opts.afterEvent).length > 0);
}

export function dummyLoadUsed(opts: { radioId?: string; afterEvent?: string } = {}, description = 'Transmit into the dummy load'): Condition {
  return make(`dummyLoadUsed:${opts.radioId ?? ''}:${opts.afterEvent ?? ''}`, description, (m) => {
    const a = after(m, opts.afterEvent);
    if (a === null) return false;

    return m.eventsWithPrefix('txOk:').some((e) => e.seq > a && e.data?.termination === 'dummy-load' && (!opts.radioId || e.name === `txOk:${opts.radioId}`));
  });
}

/** A transmission of at least durationS after afterEvent ended without a radio reset */
export function noResetDuringTx(afterEvent: string, durationS: number, opts: { radioId?: string } = {}, description = 'Hold a transmission without a reset'): Condition {
  return make(`noResetDuringTx:${afterEvent}:${durationS}:${opts.radioId ?? ''}`, description, (m) => {
    const a = after(m, afterEvent);
    if (a === null) return false;

    return m
      .eventsWithPrefix('txEnd:')
      .some((e) => e.seq > a && (!opts.radioId || e.name === `txEnd:${opts.radioId}`) && e.data?.reset === false && Number(e.data?.durationS ?? 0) >= durationS);
  });
}

export function radioSetting(deviceId: string, predicate: (s: Readonly<RadioSettings>) => boolean, label: string, description = label): Condition {
  return make(`radioSetting:${deviceId}:${label}`, description, (m) => {
    const r = m.radio(deviceId);
    return r ? predicate(r) : false;
  });
}

export function energyReserveOk(description = 'Keep the battery reserve'): Condition {
  return make('energyReserveOk', description, (m) => m.energy()?.satisfied === true);
}

// ---- operating ----

export interface ContactSpec {
  items?: string[];
  identified?: boolean;
  /** Require the owning module's full validity rule (default true) */
  valid?: boolean;
}

const PATHS: readonly HamContactRecord['path'][] = ['simplex', 'repeater', 'dmr', 'packet', 'hf', 'satellite', 'net'];

/** A completed contact with a remote station id/call sign, or on any contact of a path */
export function contactComplete(remoteOrPath: string, spec: ContactSpec = {}, description = `Complete a contact (${remoteOrPath})`): Condition {
  const byPath = (PATHS as readonly string[]).includes(remoteOrPath);

  return make(`contact:${remoteOrPath}:${JSON.stringify(spec)}`, description, (m) =>
    m
      .contacts()
      .filter((c) => (byPath ? c.path === remoteOrPath : c.remoteId === remoteOrPath || c.remoteCallsign === remoteOrPath))
      .some(
        (c) =>
          (spec.valid === false ? c.closed : m.isValidContact(c)) &&
          (spec.items ?? []).every((i) => c.exchanged.includes(i)) &&
          (spec.identified === undefined || c.identified === spec.identified)
      )
  );
}

export function repeaterAccess(code: RepeaterAccessCode = 'relayed', opts: { afterEvent?: string } = {}, description = `Repeater access: ${code}`): Condition {
  return make(`repeaterAccess:${code}:${opts.afterEvent ?? ''}`, description, (m) => eventsAfter(m, `repeater:${code}`, opts.afterEvent).length > 0);
}

/** The player heard the repeater's relay of their own transmission */
export function relayHeard(minIntelligibility = 0.5, description = 'Hear yourself through the repeater'): Condition {
  return make(`relayHeard:${minIntelligibility}`, description, (m) => {
    const id = m.config.repeater?.id;
    return id ? m.bestIntelligibility(id, { afterEvent: 'repeater:relayed', minIntelligibility }) >= minIntelligibility : false;
  });
}

export function dmrResponse(description = 'Hear the talkgroup answer'): Condition {
  return make('dmrResponse', description, (m) => m.dmrState()?.heardReply === true);
}

export function dmrFailureSeen(code: DmrAccessCode, description = `DMR: ${code}`): Condition {
  return make(`dmrFailure:${code}`, description, (m) => m.dmrLog().some((l) => l.code === code));
}

export function packetAcked(opts: { retried?: boolean } = {}, description = 'Message acknowledged by the node'): Condition {
  return make(`packetAcked:${opts.retried ?? ''}`, description, (m) => {
    const p = m.packetState();
    return !!p && p.delivered.length > 0 && (opts.retried === undefined || p.retryCount > 0 === opts.retried);
  });
}

export function packetDecoded(description = 'Decode a frame from the node'): Condition {
  return make('packetDecoded', description, (m) => m.packetState()?.rxLog.some((r) => r.ok) === true);
}

export function satContact(spec: ContactSpec = {}, description = 'Complete a satellite contact'): Condition {
  const c = contactComplete('satellite', spec, description);

  return { ...c, id: `c3:satContact:${JSON.stringify(spec)}` };
}

export function satDownlinkHeard(description = 'Hear your own downlink'): Condition {
  return make('satDownlinkHeard', description, (m) => m.satelliteState()?.selfHeard === true);
}

/** The latest isolation check after afterEvent was clean (no desense) */
export function desenseFree(opts: { afterEvent?: string } = {}, description = 'Uplink without desensing the receiver'): Condition {
  return make(`desenseFree:${opts.afterEvent ?? ''}`, description, (m) => {
    const a = after(m, opts.afterEvent);
    if (a === null) return false;
    const last = m
      .eventsWithPrefix('isolation:')
      .filter((e) => e.seq > a)
      .at(-1);
    return last?.name === 'isolation:ok';
  });
}

export function hfContact(spec: ContactSpec = {}, description = 'Complete an HF contact'): Condition {
  const c = contactComplete('hf', spec, description);

  return { ...c, id: `c3:hfContact:${JSON.stringify(spec)}` };
}

export function netCheckedIn(description = 'Check in to the net'): Condition {
  return make('netCheckedIn', description, (m) => m.netState()?.checkedIn === true);
}

/** Heard the assignment and read back (sent) a message */
export function netReadback(description = 'Read back the assignment'): Condition {
  return make('netReadback', description, (m) => {
    const n = m.netState();
    return !!n && n.heardAssignment && n.attempts.length > 0;
  });
}

export function netMessageExact(description = 'Relay the message word for word'): Condition {
  return make('netMessageExact', description, (m) => m.netAttempts().some((a) => a.exact));
}
