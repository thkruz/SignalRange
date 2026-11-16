/**
 * @file signal-path - One-line description of how a radio is cabled (antenna to radio to audio)
 * @description Shown in the bench close-up of a radio; it replaces the signal path diagram of the
 * retired connections panel. Reads the manager only.
 */

import type { HamStationManager } from '../../ham-station-manager';

/** Text diagram: antenna -> coax -> ... -> radio -> audio destination */
export function signalPath(m: HamStationManager, radioId: string): string {
  const radio = m.device(radioId);
  if (!radio) return '';
  const chain: string[] = [];
  let devId = radioId;
  const seen = new Set<string>();
  let out = m.ports(radioId).find((p) => p.role === 'rf')?.id ?? '';
  while (out && !seen.has(devId)) {
    seen.add(devId);
    const c = m.connectionAt(devId, out);
    if (!c) {
      chain.push('(open port)');
      break;
    }
    const other = c.a.deviceId === devId && c.a.portId === out ? c.b : c.a;
    chain.push(`${m.device(other.deviceId)?.label ?? other.deviceId}${c.seated ? '' : ' [loose]'}`);
    devId = other.deviceId;
    const enter = other.portId;
    out = m.ports(devId).find((p) => p.role === 'rf' && p.id !== enter)?.id ?? '';
  }
  const audio = m.ports(radioId).find((p) => p.role === 'usb-device');
  let dest = `${radio.label} speaker`;
  if (audio) {
    const c = m.connectionAt(radioId, audio.id);
    const other = c ? (c.a.deviceId === radioId ? c.b : c.a) : null;
    dest = other ? `${m.device(other.deviceId)?.label ?? other.deviceId} (USB audio)` : 'no audio destination (USB unplugged)';
  }

  return [...chain.reverse(), radio.label, dest].join(' -> ');
}
