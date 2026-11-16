import type { PlantConfig } from '@app/physical/physical-plant-types';

/**
 * The Frontline training post's physical plant (Phase 38.1 sandbox kit).
 *
 * One post, two internet paths. The SkyLink path is a status model (dish ->
 * 25 m power+data cable -> router, all fed from the power station). The VSAT
 * path is the real RF chain toward EuroSat 9E: the feed connector sits ahead
 * of the LNA (it costs C/N), the 30 m coax IFL carries the LNB's DC and the IF
 * back to the modem (damage there is post-LNA loss or an unpowered LNB).
 *
 * The LNB is its own part, powered by the modem over the IFL, so a crushed IFL
 * cuts the LNB while the antenna drive (fed from the power station) keeps
 * power. No faults are authored: the trainer injects them. Spares are the
 * defaults (one of each cable type, one power brick, one connector kit, one
 * fuel can). Reused by the trainer panel and the site tab.
 */
export const FRONTLINE_STATION_ID = 'FL-01';

export const frontlinePlantConfig: PlantConfig = {
  stationId: FRONTLINE_STATION_ID,
  parts: [
    { id: 'generator', kind: 'generator', label: 'Petrol generator', ratedW: 2000, running: true, fuelL: 6, tankL: 7, burnLPerHour: 1.5, nominalV: 230 },
    { id: 'power-station', kind: 'battery', label: 'Power station', poweredBy: 'generator', capacityWh: 1000, socWh: 900, maxOutputW: 600, nominalV: 12, loadW: 10 },
    { id: 'power-strip', kind: 'strip', label: 'Power strip', poweredBy: 'power-station', loadW: 0, nominalV: 12 },
    { id: 'skylink-router', kind: 'router', label: 'SkyLink router', poweredBy: 'power-strip', loadW: 20, nominalV: 12 },
    { id: 'skylink-dish', kind: 'terminal', label: 'SkyLink dish', poweredBy: 'skylink-router', viaCable: 'skylink-cable', loadW: 50, nominalV: 48 },
    { id: 'vsat-modem', kind: 'modem', label: 'VSAT modem', poweredBy: 'power-strip', loadW: 30, nominalV: 12 },
    { id: 'vsat-dish', kind: 'dish', label: 'VSAT dish', poweredBy: 'power-station', loadW: 15, nominalV: 12 },
    { id: 'vsat-lnb', kind: 'dish', label: 'VSAT LNB', poweredBy: 'vsat-modem', viaCable: 'vsat-ifl', loadW: 5, nominalV: 18 },
    { id: 'laptop', kind: 'client', label: 'Laptop', poweredBy: 'power-station', loadW: 45, nominalV: 12 },
  ],
  cables: [
    {
      id: 'skylink-cable',
      label: 'SkyLink power and data cable',
      lengthM: 25,
      cableType: 'power-data',
      carries: ['power', 'data'],
      from: 'skylink-router',
      to: 'skylink-dish',
    },
    {
      id: 'vsat-ifl',
      label: 'VSAT IFL coax cable',
      lengthM: 30,
      cableType: 'coax',
      carries: ['rf', 'power'],
      from: 'vsat-modem',
      to: 'vsat-lnb',
      role: 'post-lna',
      stationId: FRONTLINE_STATION_ID,
    },
  ],
  connectors: [
    { id: 'skylink-cable:dish', label: 'SkyLink cable, dish end', cableId: 'skylink-cable', partId: 'skylink-dish' },
    { id: 'skylink-cable:router', label: 'SkyLink cable, router end', cableId: 'skylink-cable', partId: 'skylink-router' },
    { id: 'vsat-feed', label: 'VSAT dish feed connection', partId: 'vsat-dish', role: 'pre-lna', stationId: FRONTLINE_STATION_ID },
    { id: 'vsat-ifl:lnb', label: 'VSAT IFL coax, LNB end', cableId: 'vsat-ifl', partId: 'vsat-lnb', role: 'post-lna', stationId: FRONTLINE_STATION_ID },
    { id: 'vsat-ifl:modem', label: 'VSAT IFL coax, modem end', cableId: 'vsat-ifl', partId: 'vsat-modem', role: 'post-lna', stationId: FRONTLINE_STATION_ID },
    { id: 'generator:out', label: 'Generator output plug', partId: 'generator', feeds: 'power-station' },
    { id: 'ps:in', label: 'Power station input plug', partId: 'power-station', feeds: 'power-station' },
    { id: 'ps:ac-out', label: 'Power station output sockets', partId: 'power-station', feeds: 'power-strip' },
    { id: 'ps:dc-out', label: 'Power station DC output', partId: 'power-station', feeds: 'vsat-dish' },
    { id: 'strip:in', label: 'Power strip input plug', partId: 'power-strip', feeds: 'power-strip' },
    { id: 'strip:router', label: 'Power strip to router plug', partId: 'power-strip', feeds: 'skylink-router' },
    { id: 'strip:modem', label: 'Power strip to modem plug', partId: 'power-strip', feeds: 'vsat-modem' },
    { id: 'router:dc', label: 'Router DC input', partId: 'skylink-router', feeds: 'skylink-router' },
    { id: 'modem:dc', label: 'Modem DC input', partId: 'vsat-modem', feeds: 'vsat-modem' },
  ],
  engineMap: { antenna: 'vsat-dish', lnb: 'vsat-lnb', modem: 'vsat-modem' },
};
