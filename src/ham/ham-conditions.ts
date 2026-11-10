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

/** The emitter is visible above the noise at a receiver right now (waterfall evidence, independent of audio) */
export function signalVisible(emitterId: string, deviceId: string, minSnrDb: number, description = `See ${emitterId} in the waterfall`): Condition {
  const blocking = ['off-frequency', 'mode-mismatch', 'no-antenna', 'usb-disconnected', 'no-power'];

  return make(`signalVisible:${emitterId}:${deviceId}:${minSnrDb}`, description, (m) =>
    m
      .liveReception(deviceId)
      .some((r) => (r.emissionId === emitterId || r.emissionId.startsWith(`${emitterId}#`)) && r.snrDb >= minSnrDb && !r.impairments.some((i) => blocking.includes(i)))
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

/** A two-way contact with this remote (still open or closed) has exchanged all the items */
export function contactItems(remoteOrCallsign: string, items: string[], description = `Exchange ${items.join(', ')} with ${remoteOrCallsign}`): Condition {
  return make(`contactItems:${remoteOrCallsign}:${items.join(',')}`, description, (m) =>
    m
      .contacts()
      .some(
        (c) =>
          (c.remoteId === remoteOrCallsign || c.remoteCallsign === remoteOrCallsign) && c.remoteHeardPlayer && c.playerHeardRemote && items.every((i) => c.exchanged.includes(i))
      )
  );
}

/** No transmitter is keyed right now */
export function keyReleased(description = 'Release the PTT'): Condition {
  return make('keyReleased', description, (m) => !m.keyed());
}

/** The player monitored the channel for at least minS (simulated seconds) before their first call */
export function listenedBeforeFirstCall(minS = 10, description = `Listen for ${minS} s before the first call`): Condition {
  return make(`listenedBeforeFirstCall:${minS}`, description, (m) => m.listenedBeforeFirstCall(minS));
}

/** A powered radio has monitored this frequency for at least minS (simulated seconds, paused quizzes excluded) */
export function monitoredChannel(freqMHz: number, minS = 10, description = `Monitor ${freqMHz.toFixed(3)} MHz for ${minS} s`): Condition {
  return make(`monitoredChannel:${freqMHz}:${minS}`, description, (m) => m.monitoredFor(freqMHz) >= minS);
}

/** A powered radio monitored this frequency for minS simulated seconds while no authored traffic was on it */
export function monitoredChannelClear(freqMHz: number, minS = 10, description = `Listen ${minS} s with the channel clear`): Condition {
  return make(`monitoredChannelClear:${freqMHz}:${minS}`, description, (m) => m.clearMonitoredFor(freqMHz) >= minS);
}

/** The remote reported this audio problem on a voice test transmission */
export function audioReported(verdict: 'clean' | 'overdrive' | 'feedback' | 'both', description = `Test report: ${verdict}`): Condition {
  return make(`audioReported:${verdict}`, description, (m) => m.audioReports().some((r) => r.verdict === verdict));
}

export function repeaterAccess(code: RepeaterAccessCode = 'relayed', opts: { afterEvent?: string } = {}, description = `Repeater access: ${code}`): Condition {
  return make(`repeaterAccess:${code}:${opts.afterEvent ?? ''}`, description, (m) => eventsAfter(m, `repeater:${code}`, opts.afterEvent).length > 0);
}

/** The repeater access log holds this code (includes wrong-frequency, which is not logged as an event) */
export function repeaterLogged(code: RepeaterAccessCode, description = `Repeater log: ${code}`): Condition {
  return make(`repeaterLogged:${code}`, description, (m) => m.repeaterLog().some((r) => r.code === code));
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

/** The packet identity is set as given (case-insensitive call signs, exact digipeater path) */
export function packetStationIs(spec: { mycall: string; destination: string; path: string[] }, description = 'Station identity set'): Condition {
  return make(`packetStationIs:${spec.mycall}:${spec.destination}:${spec.path.join(',')}`, description, (m) => {
    const st = m.packetState()?.station;

    return (
      !!st &&
      st.mycall.toUpperCase() === spec.mycall.toUpperCase() &&
      st.destination.toUpperCase() === spec.destination.toUpperCase() &&
      st.path.length === spec.path.length &&
      st.path.every((p, i) => p.toUpperCase() === spec.path[i].toUpperCase())
    );
  });
}

/**
 * A clean modulated frame went out with the interface as output, a transmit level in the target
 * range and no stray system-sound chime since (the chime is logged by the manager on every send
 * while system sounds are routed to the interface).
 */
export function packetTxClean(levelRange: [number, number] = [4, 6], description = 'Send a clean test frame'): Condition {
  return make(`packetTxClean:${levelRange.join('-')}`, description, (m) => {
    const p = m.packetState();
    if (!p || p.audio.outputDevice !== 'interface' || p.audio.systemSoundsToInterface) return false;
    if (p.audio.txLevel < levelRange[0] || p.audio.txLevel > levelRange[1]) return false;
    const chimes = m.events('packet:chime');
    const lastChime = chimes.length > 0 ? chimes[chimes.length - 1].tS : -1;

    return (p.txLog ?? []).some((t) => t.fcsOk && t.tS > lastChime);
  });
}

export function packetDecoded(description = 'Decode a frame from the node'): Condition {
  return make('packetDecoded', description, (m) => m.packetState()?.rxLog.some((r) => r.ok) === true);
}

export function satContact(spec: ContactSpec = {}, description = 'Complete a satellite contact'): Condition {
  const c = contactComplete('satellite', spec, description);

  return { ...c, id: `c3:satContact:${JSON.stringify(spec)}` };
}

/** The satellite's own downlink beacon was heard clearly (receive-only acquisition) */
export function satBeaconHeard(description = 'Hear the satellite downlink beacon'): Condition {
  return make('satBeaconHeard', description, (m) => m.satelliteState()?.beaconHeard === true);
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

export function netMessageExact(description = 'Relay the message word for word', opts: { onFallback?: boolean } = {}): Condition {
  return make(`netMessageExact${opts.onFallback ? ':fallback' : ''}`, description, (m) => m.netAttempts().some((a) => a.exact && (!opts.onFallback || a.fallback === true)));
}

/** Net control announced the planned repeater outage and its start time has passed */
export function repeaterOutageStarted(description = 'The repeater is off the air'): Condition {
  return make('repeaterOutageStarted', description, (m) => {
    const out = m.config.net?.outage;
    const net = m.netState();
    if (!out || net?.outageAnnounced !== true || m.nowS < out.startsAtS) return false;
    if (!out.afterEvent) return true;

    return net.outageArmedAtS !== undefined && m.nowS >= net.outageArmedAtS;
  });
}

/** The net closed: message delivered exactly and the player identified afterwards */
export function netClosed(description = 'Close out the net with your call sign'): Condition {
  return make('netClosed', description, (m) => m.netState()?.stage === 'closed');
}

/** The device is powered off right now */
export function devicePoweredOff(deviceId: string, description = `Power off ${deviceId}`): Condition {
  return make(`poweredOff:${deviceId}`, description, (m) => m.device(deviceId)?.powered === false);
}

// ---- compare, locate, decide (S5, S6, S8) ----

export interface ContrastSpec {
  quantity: string;
  /** Context values the better reading must carry (e.g. { orientation: 'vertical' }) */
  better: Record<string, string | number | boolean>;
  worse: Record<string, string | number | boolean>;
  /** Context keys that must be identical in both readings (same conditions) */
  same: string[];
  minDelta: number;
  /** Which direction is the improvement (default higher) */
  improvesBy?: 'higher' | 'lower';
  /** The newest reading of this quantity must be a `better` one (the fix is still in place) */
  endsOn?: boolean;
  afterEvent?: string;
}

const ctxMatches = (x: HamMeasurement, want: Record<string, string | number | boolean>): boolean => Object.entries(want).every(([k, v]) => x.context?.[k] === v);

/** Two receiver readings under the same conditions differ in the wanted direction by at least minDelta */
export function measuredContrast(spec: ContrastSpec, description = `Compare two ${spec.quantity} readings`): Condition {
  return make(`measuredContrast:${JSON.stringify(spec)}`, description, (m) => {
    const all = m.measurements({ instrument: 'receiver', quantity: spec.quantity, afterEvent: spec.afterEvent });
    const dir = spec.improvesBy === 'lower' ? -1 : 1;
    const goods = all.filter((x) => ctxMatches(x, spec.better));
    const bads = all.filter((x) => ctxMatches(x, spec.worse));

    if (spec.endsOn && (all.length === 0 || !ctxMatches(all[all.length - 1], spec.better))) return false;

    return goods.some((g) => bads.some((b) => spec.same.every((k) => g.context?.[k] === b.context?.[k]) && dir * (g.value - b.value) >= spec.minDelta));
  });
}

/** The strongest noise reading of a bearing sweep points at the expected bearing (within tolDeg) */
export function bearingFound(
  expectedDeg: number,
  tolDeg: number,
  opts: { minReadings?: number; afterEvent?: string; require?: Record<string, string | number | boolean> } = {},
  description = 'Find the strongest direction'
): Condition {
  return make(`bearingFound:${expectedDeg}:${tolDeg}:${JSON.stringify(opts)}`, description, (m) => {
    const rs = m.measurements({ instrument: 'receiver', quantity: 'noise-rise', afterEvent: opts.afterEvent }).filter((x) => ctxMatches(x, opts.require ?? {}));
    const byAz = new Map<number, number>();
    for (const r of rs) {
      const az = Number(r.context?.azDeg ?? 0);
      byAz.set(az, Math.max(byAz.get(az) ?? -Infinity, r.value));
    }
    if (byAz.size < (opts.minReadings ?? 4)) return false;
    const [bestAz] = [...byAz.entries()].reduce((a, b) => (b[1] > a[1] ? b : a));
    const diff = Math.abs(((bestAz - expectedDeg + 540) % 360) - 180);

    return diff <= tolDeg;
  });
}

/** A recorded decision made with the given choice */
export function decisionMade(id: string, choice: string, description = `Decide: ${id}`): Condition {
  return make(`decision:${id}:${choice}`, description, (m) => m.events(`decision:${id}`).some((e) => e.data?.choice === choice));
}

/** A successful transmission on deviceId with its transmit frequency inside [loMHz, hiMHz] (after afterEvent) */
export function txOkWithin(
  deviceId: string,
  loMHz: number,
  hiMHz: number,
  opts: { afterEvent?: string } = {},
  description = `Transmit between ${loMHz} and ${hiMHz} MHz`
): Condition {
  return make(`txOkWithin:${deviceId}:${loMHz}:${hiMHz}:${opts.afterEvent ?? ''}`, description, (m) =>
    eventsAfter(m, `txOk:${deviceId}`, opts.afterEvent).some((e) => {
      const f = Number(e.data?.freqMHz);

      return f >= loMHz && f <= hiMHz;
    })
  );
}

/** A brownout reset logged with the radio terminals at or below maxRadioV while the source stayed at or above minSourceV */
export function brownoutSeen(
  dcId: string,
  spec: { maxRadioV: number; minSourceV?: number; afterEvent?: string },
  description = 'See the voltage collapse at the radio'
): Condition {
  return make(`brownoutSeen:${dcId}:${JSON.stringify(spec)}`, description, (m) =>
    eventsAfter(m, 'brownout', spec.afterEvent).some(
      (e) =>
        e.data?.dcId === dcId &&
        typeof e.data?.vRadio === 'number' &&
        e.data.vRadio <= spec.maxRadioV &&
        (spec.minSourceV === undefined || (typeof e.data?.vSource === 'number' && e.data.vSource >= spec.minSourceV))
    )
  );
}

/**
 * Satellite uplinks relayed while the player was within maxOffsetHz of the satellite receiver, at least `count` of them
 * separated by at least `minGapS` (proves the player followed the Doppler shift rather than getting one lucky key-up)
 */
export function satRelayedCorrected(
  spec: { maxOffsetHz: number; count: number; minGapS: number; afterEvent?: string },
  description = 'Follow the Doppler shift on the uplink'
): Condition {
  return make(`satRelayedCorrected:${JSON.stringify(spec)}`, description, (m) => {
    const good = eventsAfter(m, 'sat:relayed', spec.afterEvent).filter((e) => typeof e.data?.offsetHz === 'number' && Math.abs(e.data.offsetHz) <= spec.maxOffsetHz);
    let picked = 0;
    let last = Number.NEGATIVE_INFINITY;
    for (const e of good) {
      if (e.tS - last >= spec.minGapS) {
        picked += 1;
        last = e.tS;
      }
    }

    return picked >= spec.count;
  });
}
