/**
 * @file station-physical - Hands-on actions: cabling, seating, inspecting, repairing, swapping spares, power, moving
 * @description Every function validates first and returns a refusal without touching state, so a
 * refused action never changes the station. Config-changing actions bump the revision.
 */

import type { HamConnection, HamLocationId } from '../ham-types';
import { validateConnection } from '../rf/rf-path';
import { type ActionResult, done, type FaultRuntime, refuse, type StationCore } from './station-core';
import { connectionAt, isPortable } from './station-devices';
import { endTx } from './station-tx';

export interface PortRef {
  deviceId: string;
  portId: string;
}

const KEYED_TEXT = 'Release the PTT before changing the RF wiring.';

function portOf(core: StationCore, ref: PortRef): ActionResult | null {
  const d = core.inService(ref.deviceId);
  if (!d) return refuse(`There is no ${ref.deviceId} in service.`, 'unknown-device');
  if (!(core.ports[ref.deviceId] ?? []).some((p) => p.id === ref.portId)) return refuse(`${d.label} has no ${ref.portId} port.`, 'unknown-port');

  return core.reachable(ref.deviceId);
}

export function connect(core: StationCore, a: PortRef, b: PortRef): ActionResult {
  if (core.state.keyed) return refuse(KEYED_TEXT, 'keyed');
  const bad = portOf(core, a) ?? portOf(core, b);
  if (bad) return bad;
  if (a.deviceId === b.deviceId) return refuse('A device cannot be connected to itself.', 'same-device');
  for (const r of [a, b]) {
    if (connectionAt(core.state.connections, r.deviceId, r.portId)) {
      return refuse(`${core.device(r.deviceId)?.label ?? r.deviceId} ${r.portId} already has something connected. Disconnect it first.`, 'port-busy');
    }
  }
  const pa = core.ports[a.deviceId].find((p) => p.id === a.portId);
  const pb = core.ports[b.deviceId].find((p) => p.id === b.portId);
  if (!pa || !pb) return refuse('Unknown port.', 'unknown-port');
  const check = validateConnection(pa, pb);
  if (check.ok === false) return refuse(check.reason, 'mismatch');
  const id = `${a.deviceId}.${a.portId}~${b.deviceId}.${b.portId}`;
  const c: HamConnection = { id, a: { ...a }, b: { ...b }, seated: true };
  core.state.connections.push(c);
  core.bump();
  core.event(`connect:${id}`);

  return done(`Connected ${core.device(a.deviceId)?.label} ${a.portId} to ${core.device(b.deviceId)?.label} ${b.portId}.`, { connectionId: id });
}

export function disconnect(core: StationCore, connectionId: string): ActionResult {
  if (core.state.keyed) return refuse(KEYED_TEXT, 'keyed');
  const c = core.state.connections.find((x) => x.id === connectionId);
  if (!c) return refuse('There is no such connection.', 'unknown-connection');
  const away = core.reachable(c.a.deviceId) && core.reachable(c.b.deviceId);
  if (away) return away;
  core.state.connections = core.state.connections.filter((x) => x.id !== connectionId);
  core.bump();
  core.event(`disconnect:${connectionId}`);

  return done('Disconnected.');
}

export function seat(core: StationCore, connectionId: string): ActionResult {
  const c = core.state.connections.find((x) => x.id === connectionId);
  if (!c) return refuse('There is no such connection.', 'unknown-connection');
  const away = core.reachable(c.a.deviceId) && core.reachable(c.b.deviceId);
  if (away) return away;
  if (c.seated) return done('That connector is already fully seated.');
  const live = core.cfg.seatRequiresPowerOff ? [c.a.deviceId, c.b.deviceId].find((id) => core.isPowered(id)) : undefined;
  if (live) {
    if (core.device(live)?.kind === 'sdr') return refuse('The receiver is powered from the laptop. Unplug its USB cable first, then tighten the plug.', 'powered');

    return refuse('Power the equipment down before reseating connectors.', 'powered');
  }
  c.seated = true;
  core.bump();
  core.event(`seat:${connectionId}`);

  return done('Connector pushed home and tightened.');
}

export function inspect(core: StationCore, targetId: string): ActionResult {
  const conn = core.state.connections.find((x) => x.id === targetId);
  if (!conn) {
    const away = core.reachable(targetId);
    if (away) return away;
  }
  const faults = core.state.faults.filter((f) => !f.cleared && f.target === targetId);
  core.event(`inspect:${targetId}`, { faults: faults.length });
  if (faults.length > 0) return done(faults.map((f) => f.inspectClue).join(' '), { faultIds: faults.map((f) => f.id) });
  const note = core.cfg.devices.find((d) => d.id === targetId)?.inspectNote;
  if (conn && !conn.seated) return done('The connector is not fully home: you can see thread showing.');

  return done(note ?? 'Nothing looks wrong.');
}

/** Pull, look at, or refit the inline fuse of a DC supply or battery. */
export function fuseAction(core: StationCore, deviceId: string, op: 'pull' | 'inspect' | 'refit'): ActionResult {
  const dc = core.dcSystems.get(deviceId);
  if (!dc) return refuse(`${deviceId} has no inline fuse.`, 'no-fuse');
  const away = core.reachable(deviceId);
  if (away) return away;
  if (core.state.keyed) return refuse('Release the PTT before touching the fuse.', 'keyed');
  const s = dc.state;
  if (op === 'inspect') {
    core.event(`fuse.inspect:${deviceId}`, { blown: s.fuseBlown });
    const where = s.fuseOut ? 'Out of the holder' : 'In the holder';
    const element = s.fuseBlown ? 'the element is broken' : 'the element is intact';

    return done(`${where}: a ${s.fuseRatingA} A fuse, ${element}.`, { ratingA: s.fuseRatingA, blown: s.fuseBlown, out: s.fuseOut });
  }
  if (op === 'pull') {
    if (s.fuseOut) return done('The fuse is already out.');
    dc.pullFuse();
    core.bump();
    core.event(`fuse.pull:${deviceId}`);

    return done('Fuse pulled. The radio has no power.');
  }
  if (!s.fuseOut) return done('The fuse is already in the holder.');
  dc.refitFuse();
  core.bump();
  core.event(`fuse.refit:${deviceId}`, { blown: s.fuseBlown });

  return done(s.fuseBlown ? 'Fuse back in the holder, but its element is still broken.' : 'Fuse back in the holder.');
}

function targetEnergized(core: StationCore, f: FaultRuntime): boolean {
  const dc = core.dcSystems.get(f.target);
  if (dc) return dc.isEnergized();
  const board = core.boards.get(f.target);
  if (board) return board.state.powered;

  return Boolean(core.device(f.target)?.powered);
}

export function repair(core: StationCore, faultId: string): ActionResult {
  const f = core.state.faults.find((x) => x.id === faultId);
  if (!f) return refuse('There is no such fault.', 'unknown-fault');
  if (f.cleared) return done('That is already fixed.');
  if (core.device(f.target)) {
    const away = core.reachable(f.target);
    if (away) return away;
  }
  if (f.clearedBy.action !== 'repair') {
    const how = f.clearedBy.action === 'install' ? 'Swap in a spare part.' : f.clearedBy.action === 'seat' ? 'Reseat the connector.' : 'Correct the setting that causes it.';

    return refuse(`That cannot be repaired in place. ${how}`, 'not-repairable');
  }
  if (f.deenergizeToRepair && targetEnergized(core, f)) return refuse('Switch it off and disconnect the supply before you work on it.', 'energized');
  const why = core.repairModel(f);
  if (why) return refuse(why, 'repair-refused');
  core.bump();
  core.clearFault(f, 'repair');

  return done('Repaired.');
}

export function install(core: StationCore, spareId: string, replaces: string): ActionResult {
  const spare = core.device(spareId);
  if (!spare?.spare || spare.removed) return refuse('That spare is not available.', 'no-spare');
  const target = core.inService(replaces);
  const dc = core.dcSystems.get(replaces);
  const board = core.boards.get(replaces);
  if (!target && !dc && !board) return refuse(`There is no ${replaces} to replace.`, 'unknown-device');
  const away = core.reachable(replaces);
  if (away) return away;
  const s = core.state;
  const installFaults = (kinds?: FaultRuntime['kind'][]): void => {
    for (const f of s.faults) {
      if (f.cleared || f.target !== replaces || f.clearedBy.action !== 'install') continue;
      if (kinds && !kinds.includes(f.kind)) continue;
      if (f.clearedBy.spareKind && f.clearedBy.spareKind !== spare.kind) continue;
      core.clearFault(f, 'install');
    }
  };

  if (spare.fuseRatingA !== undefined) {
    if (!board && !dc) return refuse(`${target?.label ?? replaces} has no fuse holder.`, 'no-fuse');
    if (board && board.state.powered) return refuse('Remove power from the board before changing the fuse.', 'energized');
    const r = board ? board.installFuse(spare.fuseRatingA) : (dc?.replaceFuse(spare.fuseRatingA) ?? { ok: false });
    if (!r.ok) return refuse(r.reason ?? 'That fuse does not fit.', 'wrong-fuse');
    spare.removed = true;
    core.bump();
    installFaults(['blown-fuse']);
    core.event(`install:${spareId}`, { replaces });

    return done(`Fitted a ${spare.fuseRatingA} A fuse.`);
  }

  if (!target) return refuse(`There is no ${replaces} to replace.`, 'unknown-device');
  if (s.keyed?.deviceId === replaces) return refuse('Release the PTT first.', 'keyed');
  if (spare.kind === 'battery' && target.kind !== 'battery') {
    spare.removed = true;
    core.bump();
    installFaults(['battery-unseated', 'battery-depleted']);
    core.event(`install:${spareId}`, { replaces });

    return done(`Fitted the spare battery to ${target.label}.`);
  }
  if (spare.kind !== target.kind) return refuse(`A ${spare.label} cannot replace ${target.label}.`, 'wrong-kind');
  const sparePorts = new Set((core.ports[spareId] ?? []).map((p) => p.id));
  const moved = s.connections.filter((c) => c.a.deviceId === replaces || c.b.deviceId === replaces);
  for (const c of moved) {
    for (const end of [c.a, c.b]) {
      if (end.deviceId === replaces && sparePorts.has(end.portId)) end.deviceId = spareId;
    }
  }
  s.connections = s.connections.filter((c) => c.a.deviceId !== replaces && c.b.deviceId !== replaces);
  spare.spare = false;
  spare.location = target.location;
  if (target.position) spare.position = target.position;
  target.removed = true;
  core.bump();
  installFaults();
  core.event(`install:${spareId}`, { replaces });

  return done(`${spare.label} installed in place of ${target.label}.`);
}

export function move(core: StationCore, deviceId: string, location: HamLocationId): ActionResult {
  const d = core.inService(deviceId);
  if (!d) return refuse(`There is no ${deviceId} in service.`, 'unknown-device');
  if (!core.cfg.locations.some((l) => l.id === location)) return refuse(`There is no ${location} location.`, 'unknown-location');
  const away = core.reachable(deviceId);
  if (away) return away;
  if (!isPortable(d.kind) && core.state.connections.some((c) => c.a.deviceId === deviceId || c.b.deviceId === deviceId)) {
    return refuse(`Disconnect ${d.label} before moving it.`, 'connected');
  }
  d.location = location;
  d.position = core.cfg.locations.find((l) => l.id === location)?.position;
  core.bump();
  core.event(`move:${deviceId}`, { location });

  return done(`${d.label} moved to the ${location}.`);
}

export function power(core: StationCore, deviceId: string, on: boolean): ActionResult {
  const d = core.inService(deviceId);
  if (!d) return refuse(`There is no ${deviceId} in service.`, 'unknown-device');
  const away = core.reachable(deviceId);
  if (away) return away;
  if (d.kind === 'sdr') return refuse(`${d.label} has no power switch. It runs while its USB plug is in a running laptop: unplug the USB cable to power it down.`, 'no-switch');
  const board = core.boards.get(deviceId);
  if (board) board.setPower(on);
  const dc = core.dcSystems.get(deviceId);
  if (dc) dc.setSourceConnected(on);
  d.powered = on;
  if (!on && core.state.keyed && (core.state.keyed.deviceId === deviceId || !core.energized(core.state.keyed.deviceId))) endTx(core, false);
  core.bump();
  core.event(`power:${deviceId}`, { on });

  return done(`${d.label} switched ${on ? 'on' : 'off'}.`);
}

export function boardSwitch(core: StationCore, deviceId: string, on: boolean): ActionResult {
  const board = core.boards.get(deviceId);
  if (!board) return refuse(`${deviceId} has no switch.`, 'no-switch');
  const away = core.reachable(deviceId);
  if (away) return away;
  board.setSwitch(on);
  core.bump();

  return done(`SW1 ${on ? 'closed' : 'open'}.`);
}

export function go(core: StationCore, location: HamLocationId): ActionResult {
  const loc = core.cfg.locations.find((l) => l.id === location);
  if (!loc) return refuse(`There is no ${location} location.`, 'unknown-location');
  if (core.state.keyed) return refuse('Release the PTT before walking away.', 'keyed');
  core.state.location = location;
  core.event(`go:${location}`);

  return done(`You are at the ${loc.label}.`);
}
