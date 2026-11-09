// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { PhysicalPlantManager } from '../../../src/physical/physical-plant-manager';
import type { PlantConfig, PlantEnvironment } from '../../../src/physical/physical-plant-types';
import {
  CHECK_DURATION_S,
  ObstructionAccumulator,
  type ObstructionBlockage,
  type ObstructionReader,
  treeLineFor,
  wedgeContains,
} from '../../../src/plugins-builtin/terminal-app/obstruction-map';
import { createObstructionsScreen } from '../../../src/plugins-builtin/terminal-app/screens/obstructions-screen';
import type { TerminalScreenContext } from '../../../src/plugins-builtin/terminal-app/screens/terminal-screen';
import { TerminalAppModel } from '../../../src/plugins-builtin/terminal-app/terminal-app-model';
import { TerminalLink } from '../../../src/plugins-builtin/terminal-app/terminal-link';
import { SKYLINK_SKIN } from '../../../src/plugins-builtin/terminal-app/terminal-skin';
import { fnv1a, RngStream } from '../../../src/simulation/rng';

interface World {
  t: number;
  beam: { az: number; el: number } | null;
  observing: boolean;
  serving: boolean;
  blockage: ObstructionBlockage;
}

function world(): { w: World; reader: ObstructionReader } {
  const w: World = { t: 0, beam: { az: 0, el: 60 }, observing: true, serving: true, blockage: { wholeSky: false, partialIds: [] } };

  return { w, reader: { nowS: () => w.t, beam: () => w.beam, observing: () => w.observing, serving: () => w.serving, blockage: () => w.blockage } };
}

/** Sweep the beam over the sky for a while */
function sweep(acc: ObstructionAccumulator, w: World, seconds: number): void {
  for (let i = 0; i < seconds; i++) {
    w.t += 1;
    w.beam = { az: (i * 7) % 360, el: 30 + ((i * 11) % 60) };
    acc.update();
  }
}

describe('ObstructionAccumulator (E4)', () => {
  it('starts unseen and fills with served sky', () => {
    const { w, reader } = world();
    const acc = new ObstructionAccumulator(reader);
    expect(acc.summary().coverage).toBe(0);
    sweep(acc, w, 1500);
    const s = acc.summary();

    expect(s.coverage).toBeGreaterThan(0.5);
    expect(s.obstructionFraction).toBe(0);
  });

  it('snow reads as the whole sky blocked', () => {
    const { w, reader } = world();
    const acc = new ObstructionAccumulator(reader);
    w.blockage = { wholeSky: true, partialIds: [] };
    w.serving = false;
    sweep(acc, w, 1500);

    expect(acc.summary().coverage).toBeGreaterThan(0.5);
    expect(acc.obstructionFraction()).toBe(1);
  });

  it('a tree line reads as a wedge: blocked cells sit inside it, clear cells outside', () => {
    const { w, reader } = world();
    const acc = new ObstructionAccumulator(reader);
    w.blockage = { wholeSky: false, partialIds: ['tree'] };
    sweep(acc, w, 3000);
    const wedge = treeLineFor('tree');
    let blockedInside = 0;
    let blockedOutside = 0;
    let clearInside = 0;
    for (const c of acc.grid().cells) {
      const inside = wedgeContains(wedge, (c.azLoDeg + c.azHiDeg) / 2, (c.elLoDeg + c.elHiDeg) / 2);
      if (c.state === 'blocked') {
        inside ? blockedInside++ : blockedOutside++;
      } else if (c.state === 'served' && inside) {
        clearInside++;
      }
    }

    expect(blockedInside).toBeGreaterThan(0);
    expect(blockedOutside).toBe(0);
    expect(clearInside).toBe(0);
    expect(acc.obstructionFraction()).toBeGreaterThan(0);
    expect(acc.obstructionFraction()).toBeLessThan(0.6);
  });

  it('marks nothing while not serving, not observing, or below the mask', () => {
    const { w, reader } = world();
    const acc = new ObstructionAccumulator(reader);
    w.serving = false;
    sweep(acc, w, 300);
    w.serving = true;
    w.observing = false;
    sweep(acc, w, 300);
    w.observing = true;
    w.beam = { az: 10, el: 5 };
    w.t += 1;
    acc.update();

    expect(acc.summary().coverage).toBe(0);
  });

  it('a clock skip credits at most one capped step', () => {
    const { w, reader } = world();
    const acc = new ObstructionAccumulator(reader);
    acc.update();
    w.t += 5000;
    acc.update();
    const max = Math.max(...acc.grid().cells.map((c) => c.servedS));

    expect(max).toBeLessThanOrEqual(31);
  });

  it('survives a state round trip and clears on reset', () => {
    const { w, reader } = world();
    const acc = new ObstructionAccumulator(reader);
    sweep(acc, w, 800);
    acc.startCheck();
    const state = JSON.parse(JSON.stringify(acc.getState()));
    const other = new ObstructionAccumulator(reader);
    other.restoreState(state);

    expect(other.summary().coverage).toBe(acc.summary().coverage);
    expect(other.checkElapsedS()).toBe(0);
    other.reset();
    expect(other.summary().coverage).toBe(0);
    expect(other.checkElapsedS()).toBeNull();
  });

  it('the check finishes after its sim time', () => {
    const { w, reader } = world();
    const acc = new ObstructionAccumulator(reader);
    acc.startCheck();
    expect(acc.checkDone()).toBe(false);
    w.t += CHECK_DURATION_S;
    expect(acc.checkDone()).toBe(true);
  });
});

describe('Obstructions screen', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  function setup(withAcc = true) {
    const { w, reader } = world();
    const obstruction = withAcc ? new ObstructionAccumulator(reader) : null;
    const model = new TerminalAppModel({
      skin: SKYLINK_SKIN,
      plant: { nowS: () => w.t, dishStatus: () => 'online', powerDrawW: () => 55 },
      link: new TerminalLink({ routerPowered: () => true, routerBooted: () => true, laptopOnRouter: () => true, dishCablePathIntact: () => true, dishBooted: () => true }),
      obstruction,
    });
    model.update();
    let answer = true;
    const ctx = { skin: SKYLINK_SKIN, model, confirm: () => Promise.resolve(answer), refresh: () => undefined } as unknown as TerminalScreenContext;
    const host = document.createElement('div');
    document.body.appendChild(host);
    const screen = createObstructionsScreen(ctx);
    screen.mount(host);
    screen.sync(model.view());

    return { w, obstruction, model, screen, host, setAnswer: (a: boolean) => (answer = a) };
  }

  it('draws the map and the empty hint, then the check flow tells the player to let time run', () => {
    const { host, obstruction, screen, model } = setup();
    expect(host.querySelectorAll('svg path').length).toBeGreaterThan(100);
    expect(host.querySelector('#obs-empty')?.textContent).toContain('needs time');
    (host.querySelector('#obs-check') as HTMLButtonElement).click();
    screen.sync(model.view());

    expect(obstruction?.checkElapsedS()).toBe(0);
    expect(host.querySelector('#obs-check-text')?.textContent).toContain('Let time run');
    expect(host.querySelector('#obs-stop')?.classList.contains('d-none')).toBe(false);
  });

  it('colours cells after the map fills and reset clears it after confirm', async () => {
    const { host, obstruction, screen, model, w, setAnswer } = setup();
    w.blockage = { wholeSky: true, partialIds: [] };
    sweep(obstruction as ObstructionAccumulator, w, 1500);
    screen.sync(model.view());
    expect(host.querySelector('#obs-blocked')?.textContent).toBe('100%');
    setAnswer(false);
    (host.querySelector('#obs-reset') as HTMLButtonElement).click();
    await Promise.resolve();
    await Promise.resolve();
    expect(obstruction?.summary().coverage).toBeGreaterThan(0);
    setAnswer(true);
    (host.querySelector('#obs-reset') as HTMLButtonElement).click();
    await Promise.resolve();
    await Promise.resolve();
    expect(obstruction?.summary().coverage).toBe(0);
  });

  it('says so when the terminal has no map', () => {
    const { host } = setup(false);
    expect(host.querySelector('#obs-unavailable')?.classList.contains('d-none')).toBe(false);
    expect(host.querySelector('#obs-body')?.classList.contains('d-none')).toBe(true);
  });
});

describe('post-boot searching (D13)', () => {
  function plantWorld() {
    let t = 100;
    const env: PlantEnvironment = { windMps: 0, rainMmH: 0, ambientC: 15 };
    const streams = new Map<string, RngStream>();
    const config: PlantConfig = {
      stationId: 'gs1',
      parts: [
        { id: 'generator', kind: 'generator', ratedW: 1000, fuelL: 5, nominalV: 230 },
        { id: 'power-station', kind: 'battery', poweredBy: 'generator', maxOutputW: 500, socWh: 0, nominalV: 12, loadW: 20 },
        { id: 'skylink-router', kind: 'router', poweredBy: 'power-station', loadW: 15 },
        { id: 'skylink-dish', kind: 'terminal', poweredBy: 'skylink-router', viaCable: 'skylink-cable', loadW: 60 },
      ],
      cables: [{ id: 'skylink-cable', lengthM: 25, cableType: 'power-data', carries: ['power', 'data'], from: 'skylink-router', to: 'skylink-dish' }],
      connectors: [{ id: 'skylink-cable:dish', cableId: 'skylink-cable' }],
    };
    const plant: PhysicalPlantManager = new PhysicalPlantManager(config, {
      now: () => t,
      skip: (s) => {
        for (let i = 0; i < s; i++) {
          t += 1;
          plant.update(1);
        }
      },
      env: () => env,
      rng: (name) => {
        let s = streams.get(name);
        if (!s) {
          s = new RngStream(fnv1a(name));
          streams.set(name, s);
        }

        return s;
      },
    });

    const advance = (n: number): void => {
      for (let i = 0; i < n; i++) {
        t += 1;
        plant.update(1);
      }
    };

    return { plant, advance };
  }

  it('boot plus acquisition ends inside the skin range, searching with no service in between', () => {
    const { plant, advance } = plantWorld();
    plant.reboot();
    let bootEnd = -1;
    let searchEnd = -1;
    const start = plant.getTimeSeconds() - 10;
    for (let i = 0; i < 400; i++) {
      advance(1);
      const status = plant.skylinkStatus();
      if (status !== 'booting' && bootEnd < 0) {
        bootEnd = plant.getTimeSeconds();
      }
      if (status === 'online' && searchEnd < 0) {
        searchEnd = plant.getTimeSeconds();
        break;
      }
      if (status === 'searching') {
        expect(plant.isPartPowered('skylink-dish')).toBe(true);
      }
    }
    const total = searchEnd - start;

    expect(searchEnd).toBeGreaterThan(0);
    expect(total).toBeGreaterThanOrEqual(SKYLINK_SKIN.bootAcquisitionS.minS);
    expect(total).toBeLessThanOrEqual(SKYLINK_SKIN.bootAcquisitionS.maxS + 2);
    expect(searchEnd).toBeGreaterThan(bootEnd);
  });
});
