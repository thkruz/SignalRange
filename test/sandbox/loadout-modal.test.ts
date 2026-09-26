import { vi } from 'vitest';
import { ANTENNA_CONFIG_KEYS } from '../../src/equipment/antenna/antenna-config-keys';
import { ANTENNA_CONFIGS } from '../../src/equipment/antenna/antenna-configs';
import { AntennaRegistry } from '../../src/equipment/antenna/antenna-registry';
import { LoadoutModal } from '../../src/sandbox/loadout-modal';
import { SandboxLoadoutService } from '../../src/sandbox/sandbox-loadout';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  clearPersistedStore: vi.fn(async () => undefined),
  scenarioData: {
    id: 'nats-sandbox',
    missionType: 'Sandbox',
    settings: {
      groundStations: [
        { id: 'VT-01', name: 'Vermont', antennas: ['C_BAND_9M_VORTEK'] },
        { id: 'ME-02', name: 'Maine', antennas: ['C_BAND_9M_VORTEK'], antennaConfigKey: 'KU_BAND_9M_LIMIT' },
      ],
    },
  },
}));

vi.mock('../../src/router', () => ({
  Router: {
    getInstance: () => ({ navigate: mocks.navigate, getCurrentPath: () => '/campaigns/nats/scenarios/nats-sandbox' }),
  },
}));

vi.mock('../../src/sync/storage', () => ({
  clearPersistedStore: () => mocks.clearPersistedStore(),
}));

vi.mock('../../src/scenario-manager', () => ({
  ScenarioManager: {
    getInstance: () => ({ data: mocks.scenarioData }),
  },
}));

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('LoadoutModal', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    localStorage.clear();
    AntennaRegistry.destroy();
    SandboxLoadoutService.destroy();
    LoadoutModal.destroy();
    mocks.navigate.mockClear();
    mocks.clearPersistedStore.mockClear();
  });

  afterEach(() => {
    LoadoutModal.destroy();
    AntennaRegistry.destroy();
    SandboxLoadoutService.destroy();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  const builtinCount = Object.keys(ANTENNA_CONFIGS).length;

  it('renders one select per authored station with the scenario default first', () => {
    LoadoutModal.getInstance().show();

    const box = document.getElementById(LoadoutModal.BOX_ID);
    const selects = box?.querySelectorAll<HTMLSelectElement>('select[data-station-index]') ?? [];

    expect(box?.style.display).not.toBe('none');
    expect(selects).toHaveLength(2);

    const first = selects[0];

    expect(first.options[0].value).toBe('');
    expect(first.options[0].textContent).toContain(ANTENNA_CONFIGS[ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK].name);
    expect(first.options[0].textContent).toContain('scenario default');
    // Every other built-in is offered, the default is not listed twice.
    expect(first.querySelectorAll('optgroup[label="Built-in"] option')).toHaveLength(builtinCount - 1);
    expect(first.querySelector('optgroup[label="Plugins"]')).toBeNull();
    // antennaConfigKey wins over antennas[0] as the authored default.
    expect(selects[1].options[0].textContent).toContain(ANTENNA_CONFIGS[ANTENNA_CONFIG_KEYS.KU_BAND_9M_LIMIT].name);
  });

  it('lists plugin antennas in their own group with the plugin named', () => {
    AntennaRegistry.getInstance().register('PLUGIN_KA', { ...ANTENNA_CONFIGS[ANTENNA_CONFIG_KEYS.KA_BAND_1M8], name: 'Plugin Ka' }, { source: 'plugin:ExamplePlugin' });
    LoadoutModal.getInstance().show();

    const option = document.querySelector<HTMLOptionElement>('#loadout-modal optgroup[label="Plugins"] option');

    expect(option?.value).toBe('PLUGIN_KA');
    expect(option?.textContent).toContain('Plugin Ka');
    expect(option?.textContent).toContain('plugin: ExamplePlugin');
  });

  it('applies the selection, wipes persisted equipment state, and restarts the route', async () => {
    LoadoutModal.getInstance().show();

    const box = document.getElementById(LoadoutModal.BOX_ID) as HTMLElement;
    const first = box.querySelector<HTMLSelectElement>('select[data-station-index="0"]') as HTMLSelectElement;

    first.value = 'KU_BAND_3M_ANTESTAR';
    (box.querySelector('#loadout-apply') as HTMLButtonElement).click();
    await flush();

    expect(SandboxLoadoutService.getInstance().get('nats-sandbox')).toEqual({ stations: { 0: { antenna: 'KU_BAND_3M_ANTESTAR' } } });
    expect(mocks.clearPersistedStore).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).toHaveBeenCalledWith('/campaigns/nats/scenarios/nats-sandbox', { forceReplay: true });
    expect(box.style.display).toBe('none');
  });

  it('clears the stored loadout when every station is back on its default', async () => {
    SandboxLoadoutService.getInstance().set('nats-sandbox', { stations: { 0: { antenna: 'KU_BAND_3M_ANTESTAR' } } });
    LoadoutModal.getInstance().show();

    const box = document.getElementById(LoadoutModal.BOX_ID) as HTMLElement;
    const first = box.querySelector<HTMLSelectElement>('select[data-station-index="0"]') as HTMLSelectElement;

    expect(first.value).toBe('KU_BAND_3M_ANTESTAR');

    first.value = '';
    (box.querySelector('#loadout-apply') as HTMLButtonElement).click();
    await flush();

    expect(SandboxLoadoutService.getInstance().get('nats-sandbox')).toBeNull();
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
  });

  it('reset clears the stored loadout and restarts', async () => {
    SandboxLoadoutService.getInstance().set('nats-sandbox', { stations: { 1: { antenna: 'KU_BAND_3M_ANTESTAR' } } });
    LoadoutModal.getInstance().show();
    (document.querySelector('#loadout-modal #loadout-reset') as HTMLButtonElement).click();
    await flush();

    expect(SandboxLoadoutService.getInstance().get('nats-sandbox')).toBeNull();
    expect(mocks.clearPersistedStore).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).toHaveBeenCalledWith('/campaigns/nats/scenarios/nats-sandbox', { forceReplay: true });
  });

  it('cancel closes without touching storage or navigating', () => {
    LoadoutModal.getInstance().show();
    (document.querySelector('#loadout-modal #loadout-cancel') as HTMLButtonElement).click();

    expect((document.getElementById(LoadoutModal.BOX_ID) as HTMLElement).style.display).toBe('none');
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  });

  it('rebuilds its content on every show()', () => {
    const modal = LoadoutModal.getInstance();

    modal.show();
    modal.close();
    AntennaRegistry.getInstance().register('LATE_PLUGIN', { ...ANTENNA_CONFIGS[ANTENNA_CONFIG_KEYS.KA_BAND_1M8], name: 'Late' }, { source: 'plugin:Late' });
    modal.show();

    expect(document.querySelector('#loadout-modal option[value="LATE_PLUGIN"]')).not.toBeNull();
    expect(document.querySelectorAll(`#${LoadoutModal.BOX_ID}`)).toHaveLength(1);
  });
});
