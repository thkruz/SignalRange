/** M17 diagram wires on the real camp (frontline S1/S2) plant: every wire is a real connection, none is paired by row. */

import { applyCampField, applyS2Power, CAMP_SERVICES, CAMP_VSAT_SERVICE, OLA_CHECK_CARD, SKYLINK_SERVICE } from '@app/campaigns/frontline/camp-field-config';
import { frontlinePlantConfig } from '@app/campaigns/frontline/plant-config';
import { buildServicePathDiagram } from '@app/physical/service-path-diagram';
import { describe, expect, it } from 'vitest';

function campDiagram() {
  const plant = structuredClone(frontlinePlantConfig);
  applyS2Power(applyCampField(plant, [OLA_CHECK_CARD], []));

  return buildServicePathDiagram(plant);
}

const key = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

describe('M17 camp diagram wires', () => {
  const diagram = campDiagram();
  const wires = (id: string) => new Set(diagram.lanes.find((l) => l.serviceId === id)?.edges.map(([a, b]) => key(a, b)));

  it('has both camp lanes', () => {
    expect(CAMP_SERVICES).toEqual([SKYLINK_SERVICE, CAMP_VSAT_SERVICE]);
    expect(diagram.lanes.map((l) => l.serviceId)).toEqual(CAMP_SERVICES);
  });

  it('SkyLink lane wires exactly the real connections', () => {
    expect(wires(SKYLINK_SERVICE)).toEqual(
      new Set(
        [
          ['skylink-router', 'skylink-cable:router'],
          ['skylink-cable:router', 'skylink-cable'],
          ['skylink-cable', 'skylink-cable:dish'],
          ['skylink-cable:dish', 'skylink-dish'],
          ['power-strip', 'skylink-router'],
          ['power-station', 'power-strip'],
          ['generator', 'power-station'],
          ['power-station', 'laptop'],
          ['skylink-dish', 'account:camp-skylink'],
          ['account:camp-skylink', 'provider:skylink-net'],
        ].map(([a, b]) => key(a, b))
      )
    );
  });

  it('never wires the laptop to the SkyLink cable or its plugs', () => {
    const w = wires(SKYLINK_SERVICE);
    for (const id of ['skylink-cable', 'skylink-cable:dish', 'skylink-cable:router', 'skylink-dish']) expect(w.has(key('laptop', id))).toBe(false);
  });

  it('VSAT lane wires the IFL cable through its plugs and the laptop only to its supply', () => {
    const w = wires(CAMP_VSAT_SERVICE);
    expect(w.has(key('vsat-ifl', 'vsat-ifl:modem'))).toBe(true);
    expect(w.has(key('vsat-ifl:modem', 'vsat-modem'))).toBe(true);
    expect(w.has(key('vsat-ifl', 'vsat-ifl:lnb'))).toBe(true);
    expect([...w].filter((k) => k.includes('laptop'))).toEqual([key('laptop', 'power-station')]);
    expect(w.has(key('vsat-modem', 'account:camp-eurosat'))).toBe(true);
  });
});
