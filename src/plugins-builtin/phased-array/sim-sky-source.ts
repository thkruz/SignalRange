/**
 * SkySource backed by the running simulation: the tier scheduler's warm set
 * (worker samples, no main-thread propagation), the hydrated satellites
 * through the antenna's own `viewOf`, and `sampleAt` for look-ahead.
 */
import type { Satellite } from '@app/equipment/satellite/satellite';
import type { PropagationSample } from '@app/simulation/propagation/propagation-service';
import { gmstRad } from '@app/simulation/rf-narrowing';
import { getSimulatedNowMs } from '@app/simulation/sim-time';
import { SimulationManager } from '@app/simulation/simulation-manager';
import type { SkyObject, SkySource } from './beam-scheduler';
import { enuToAzEl } from './scan-geometry';

const D2R = Math.PI / 180;
const WGS84_A_KM = 6378.137;
const WGS84_E2 = 0.00669437999014;
/** A hydrated satellite is read through viewOf when the requested time is this close to now, sim ms */
const NOW_WINDOW_MS = 2000;

export interface SimSkyHost {
  location(): { latitude: number; longitude: number; elevationM: number } | null;
  viewOf(sat: Satellite): { az: number; el: number };
}

interface Frame {
  x: number;
  y: number;
  z: number;
  east: [number, number, number];
  north: [number, number, number];
  up: [number, number, number];
}

function frameAt(latDeg: number, lonDeg: number, altKm: number, ms: number): Frame {
  const lat = latDeg * D2R;
  const lon = lonDeg * D2R + gmstRad(ms);
  const sl = Math.sin(lat);
  const cl = Math.cos(lat);
  const n = WGS84_A_KM / Math.sqrt(1 - WGS84_E2 * sl * sl);
  const so = Math.sin(lon);
  const co = Math.cos(lon);

  return {
    x: (n + altKm) * cl * co,
    y: (n + altKm) * cl * so,
    z: (n * (1 - WGS84_E2) + altKm) * sl,
    east: [-so, co, 0],
    north: [-sl * co, -sl * so, cl],
    up: [cl * co, cl * so, sl],
  };
}

export class SimSkySource implements SkySource {
  private readonly sample_: PropagationSample | null;

  constructor(private readonly host_: SimSkyHost) {
    this.sample_ = SimulationManager.getInstance().scheduler?.service?.newSample() ?? null;
  }

  list(simMs: number, max: number): SkyObject[] {
    const sim = SimulationManager.getInstance();
    const sch = sim.scheduler;
    const out: SkyObject[] = [];

    if (!sch) {
      for (const sat of sim.satellites) {
        const v = this.host_.viewOf(sat);

        if (v.el > 0) {
          out.push({ norad: sat.noradId, name: sat.name, az: v.az, el: v.el });
        }
      }

      return SimSkySource.cap_(out, max);
    }

    const registry = sch.registry;

    for (const sat of registry.hydrated) {
      const v = this.host_.viewOf(sat);

      if (v.el > 0) {
        out.push({ norad: sat.noradId, name: sat.name, az: v.az, el: v.el });
      }
    }

    const loc = this.host_.location();
    const stationIndex = loc ? sch.stationIndexOf(loc.latitude, loc.longitude) : -1;

    if (loc && stationIndex >= 0 && this.sample_ && sch.isTiered) {
      const frame = frameAt(loc.latitude, loc.longitude, loc.elevationM / 1000, simMs);

      for (const norad of sch.warmFor(stationIndex)) {
        if (registry.isHydrated(norad)) {
          continue;
        }
        const p = this.warmPosition_(norad, simMs, frame);

        if (p && p.el > 0) {
          const idx = registry.memberIndexOf(norad);

          out.push({ norad, name: idx >= 0 ? registry.memberName(idx) : `NORAD ${norad}`, az: p.az, el: p.el });
        }
      }
    }

    return SimSkySource.cap_(out, max);
  }

  positionOf(norad: number, simMs: number): { az: number; el: number } | null {
    const sch = SimulationManager.getInstance().scheduler;
    const sat = sch ? sch.registry.peek(norad) : SimulationManager.getInstance().getSatByNoradId(norad);

    if (sat && Math.abs(simMs - getSimulatedNowMs()) <= NOW_WINDOW_MS) {
      const v = this.host_.viewOf(sat);

      return { az: v.az, el: v.el };
    }
    const loc = this.host_.location();

    if (sch && loc && this.sample_ && sch.isTiered) {
      const stationIndex = sch.stationIndexOf(loc.latitude, loc.longitude);

      if (stationIndex >= 0) {
        const p = this.warmPosition_(norad, simMs, frameAt(loc.latitude, loc.longitude, loc.elevationM / 1000, simMs));

        if (p) {
          return p;
        }
      }
    }
    if (sat) {
      // Authored satellite looking ahead: no ephemeris here, assume it holds its slot
      const v = this.host_.viewOf(sat);

      return { az: v.az, el: v.el };
    }

    return null;
  }

  touch(norad: number): void {
    SimulationManager.getInstance().scheduler?.registry.get(norad);
  }

  private warmPosition_(norad: number, simMs: number, frame: Frame): { az: number; el: number } | null {
    const sch = SimulationManager.getInstance().scheduler;
    const s = this.sample_;

    if (!sch || !s || !sch.sampleAt(norad, simMs, s)) {
      return null;
    }
    const dx = s.x - frame.x;
    const dy = s.y - frame.y;
    const dz = s.z - frame.z;
    const east = dx * frame.east[0] + dy * frame.east[1] + dz * frame.east[2];
    const north = dx * frame.north[0] + dy * frame.north[1] + dz * frame.north[2];
    const up = dx * frame.up[0] + dy * frame.up[1] + dz * frame.up[2];
    const p = enuToAzEl(east, north, up);

    return { az: p.az, el: p.el };
  }

  private static cap_(list: SkyObject[], max: number): SkyObject[] {
    if (list.length <= max) {
      return list;
    }
    list.sort((a, b) => b.el - a.el);

    return list.slice(0, max);
  }
}
