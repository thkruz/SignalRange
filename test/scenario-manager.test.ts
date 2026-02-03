import { vi } from 'vitest';
import { ScenarioData } from '../src/ScenarioData';
import {
  getNextPrerequisiteScenario,
  getPrerequisiteScenarioNames,
  isScenarioLocked,
  ScenarioManager,
  SCENARIOS,
} from '../src/scenario-manager';

// Mock all scenario data imports
vi.mock('../src/campaigns/nats/scenario1', () => ({
  scenario1Data: {
    id: 'scenario-1',
    number: 1,
    title: 'Scenario 1',
    subtitle: 'First scenario',
    url: '/scenario/1',
    imageUrl: '/images/s1.png',
    duration: '30 min',
    difficulty: 'beginner',
    missionType: 'Training',
    description: 'Test scenario 1',
    equipment: [],
    settings: { isSync: false, groundStations: [], satellites: [] },
  },
}));

vi.mock('../src/campaigns/nats/scenario2', () => ({
  scenario2Data: {
    id: 'scenario-2',
    number: 2,
    title: 'Scenario 2',
    prerequisiteScenarioIds: ['scenario-1'],
    url: '/scenario/2',
    imageUrl: '/images/s2.png',
    duration: '45 min',
    difficulty: 'intermediate',
    missionType: 'Operation',
    description: 'Test scenario 2',
    equipment: [],
    settings: { isSync: false, groundStations: [], satellites: [] },
  },
}));

vi.mock('../src/campaigns/nats/scenario3', () => ({
  scenario3Data: {
    id: 'scenario-3',
    number: 3,
    title: 'Scenario 3',
    prerequisiteScenarioIds: ['scenario-2'],
    url: '/scenario/3',
    imageUrl: '/images/s3.png',
    duration: '60 min',
    difficulty: 'advanced',
    missionType: 'Mission',
    description: 'Test scenario 3',
    equipment: [],
    settings: { isSync: false, groundStations: [], satellites: [] },
  },
}));

vi.mock('../src/campaigns/nats/scenario4', () => ({
  scenario4Data: {
    id: 'scenario-4',
    number: 4,
    title: 'Scenario 4',
    prerequisiteScenarioIds: ['scenario-2', 'scenario-3'],
    url: '/scenario/4',
    imageUrl: '/images/s4.png',
    duration: '90 min',
    difficulty: 'advanced',
    missionType: 'Mission',
    description: 'Test scenario 4',
    equipment: [],
    settings: { isSync: false, groundStations: [], satellites: [] },
  },
}));

vi.mock('../src/campaigns/nats/scenario5', () => ({
  scenario5Data: {
    id: 'scenario-5',
    number: 5,
    title: 'Scenario 5',
    url: '/scenario/5',
    imageUrl: '/images/s5.png',
    duration: '45 min',
    difficulty: 'beginner',
    missionType: 'Training',
    description: 'Test scenario 5',
    equipment: [],
    settings: { isSync: false, groundStations: [], satellites: [] },
  },
}));

vi.mock('../src/campaigns/nats/scenario6', () => ({
  scenario6Data: {
    id: 'scenario-6',
    number: 6,
    title: 'Scenario 6',
    url: '/scenario/6',
    imageUrl: '/images/s6.png',
    duration: '45 min',
    difficulty: 'intermediate',
    missionType: 'Training',
    description: 'Test scenario 6',
    equipment: [],
    settings: { isSync: false, groundStations: [], satellites: [] },
  },
}));

vi.mock('../src/campaigns/nats/scenario7', () => ({
  scenario7Data: {
    id: 'scenario-7',
    number: 7,
    title: 'Scenario 7',
    url: '/scenario/7',
    imageUrl: '/images/s7.png',
    duration: '45 min',
    difficulty: 'advanced',
    missionType: 'Training',
    description: 'Test scenario 7',
    equipment: [],
    settings: { isSync: false, groundStations: [], satellites: [] },
  },
}));

vi.mock('../src/campaigns/nats/scenario8', () => ({
  scenario8Data: {
    id: 'scenario-8',
    number: 8,
    title: 'Scenario 8',
    url: '/scenario/8',
    imageUrl: '/images/s8.png',
    duration: '45 min',
    difficulty: 'advanced',
    missionType: 'Training',
    description: 'Test scenario 8',
    equipment: [],
    settings: { isSync: false, groundStations: [], satellites: [] },
  },
}));

vi.mock('../src/scenarios/sandbox', () => ({
  sandboxData: {
    id: 'sandbox',
    number: 0,
    title: 'Sandbox',
    url: '/sandbox',
    imageUrl: '/images/sandbox.png',
    duration: 'Unlimited',
    difficulty: 'beginner',
    missionType: 'Sandbox',
    description: 'Free play mode',
    equipment: [],
    settings: { isSync: false, groundStations: [], satellites: [] },
  },
}));

// Mock equipment modules
vi.mock('../src/equipment/rf-front-end/buc-module', () => ({
  BUCModuleCore: { getDefaultState: () => ({}) },
}));

vi.mock('../src/equipment/rf-front-end/hpa-module', () => ({
  HPAModuleCore: { getDefaultState: () => ({}) },
}));

vi.mock('../src/equipment/rf-front-end/filter-module', () => ({
  IfFilterBankModuleCore: { getDefaultState: () => ({}) },
}));

vi.mock('../src/equipment/rf-front-end/lnb-module', () => ({
  LNBModuleCore: { getDefaultState: () => ({}) },
}));

vi.mock('../src/equipment/rf-front-end/omt-module/omt-module', () => ({
  OMTModule: { getDefaultState: () => ({}) },
}));

vi.mock('../src/equipment/rf-front-end/coupler-module/coupler-module', () => ({
  CouplerModule: { getDefaultState: () => ({}) },
}));

vi.mock('../src/equipment/rf-front-end/gpsdo-module/gpsdo-state', () => ({
  defaultGpsdoState: {},
}));

vi.mock('../src/equipment/real-time-spectrum-analyzer/defaultSpectrumAnalyzerState', () => ({
  defaultSpectrumAnalyzerState: {},
}));

vi.mock('../src/equipment/transmitter/transmitter', () => ({
  Transmitter: { getDefaultState: () => ({}) },
}));

vi.mock('../src/equipment/receiver/receiver', () => ({
  Receiver: { getDefaultState: () => ({}) },
}));

vi.mock('../src/equipment/antenna/antenna-config-keys', () => ({
  ANTENNA_CONFIG_KEYS: {
    C_BAND_3M_ANTESTAR: 'c-band-3m',
    KU_BAND_3M_ANTESTAR: 'ku-band-3m',
  },
}));

describe('ScenarioManager', () => {
  beforeEach(() => {
    // Reset singleton
    (ScenarioManager as any).instance_ = null;
    // Reset developer mode
    window.DEVELOPER_MODE = false;
  });

  afterEach(() => {
    (ScenarioManager as any).instance_ = null;
    window.DEVELOPER_MODE = false;
    vi.clearAllMocks();
  });

  describe('Singleton Pattern', () => {
    it('should return singleton instance', () => {
      const instance1 = ScenarioManager.getInstance();
      const instance2 = ScenarioManager.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('Default Settings', () => {
    it('should provide default settings', () => {
      const defaults = ScenarioManager.getDefaultSettings();

      expect(defaults.isSync).toBe(false);
      expect(defaults.groundStations).toEqual([]);
      expect(defaults.antennas).toBeDefined();
      expect(defaults.rfFrontEnds).toBeDefined();
      expect(defaults.satellites).toEqual([]);
    });

    it('should initialize with default settings', () => {
      const manager = ScenarioManager.getInstance();
      const settings = manager.getScenario();

      expect(settings).toBeDefined();
      expect(settings.isSync).toBe(false);
    });
  });

  describe('Scenario Selection', () => {
    it('should set scenario by ID', () => {
      const manager = ScenarioManager.getInstance();
      manager.scenario = 'scenario-1';

      expect(manager.data.id).toBe('scenario-1');
      expect(manager.data.title).toBe('Scenario 1');
    });

    it('should throw error for unknown scenario', () => {
      const manager = ScenarioManager.getInstance();

      expect(() => {
        manager.scenario = 'non-existent';
      }).toThrow('Scenario non-existent not found');
    });
  });
});

describe('isScenarioLocked', () => {
  beforeEach(() => {
    window.DEVELOPER_MODE = false;
  });

  afterEach(() => {
    window.DEVELOPER_MODE = false;
  });

  const createTestScenario = (
    id: string,
    prereqs?: string[]
  ): ScenarioData => ({
    id,
    number: 1,
    title: `Scenario ${id}`,
    subtitle: 'Test',
    url: `/scenario/${id}`,
    imageUrl: `/images/${id}.png`,
    duration: '30 min',
    difficulty: 'beginner',
    missionType: 'Test',
    description: 'Test scenario',
    equipment: [],
    settings: { isSync: false, groundStations: [], satellites: [] },
    prerequisiteScenarioIds: prereqs,
  });

  it('should return false for scenario without prerequisites', () => {
    const scenario = createTestScenario('s1');

    expect(isScenarioLocked(scenario, [])).toBe(false);
  });

  it('should return false when all prerequisites completed', () => {
    const scenario = createTestScenario('s3', ['s1', 's2']);

    expect(isScenarioLocked(scenario, ['s1', 's2'])).toBe(false);
  });

  it('should return true when prerequisites not completed', () => {
    const scenario = createTestScenario('s2', ['s1']);

    expect(isScenarioLocked(scenario, [])).toBe(true);
  });

  it('should return true when only some prerequisites completed', () => {
    const scenario = createTestScenario('s4', ['s1', 's2', 's3']);

    expect(isScenarioLocked(scenario, ['s1', 's3'])).toBe(true);
  });

  it('should return false in developer mode regardless of prerequisites', () => {
    window.DEVELOPER_MODE = true;
    const scenario = createTestScenario('s3', ['s1', 's2']);

    expect(isScenarioLocked(scenario, [])).toBe(false);
  });

  it('should handle empty prerequisiteScenarioIds array', () => {
    const scenario = createTestScenario('s1', []);

    expect(isScenarioLocked(scenario, [])).toBe(false);
  });
});

describe('getNextPrerequisiteScenario', () => {
  const createTestScenario = (
    id: string,
    prereqs?: string[]
  ): ScenarioData => ({
    id,
    number: parseInt(id.replace('scenario-', '')),
    title: `Scenario ${id}`,
    subtitle: 'Test',
    url: `/scenario/${id}`,
    imageUrl: `/images/${id}.png`,
    duration: '30 min',
    difficulty: 'beginner',
    missionType: 'Test',
    description: 'Test scenario',
    equipment: [],
    settings: { isSync: false, groundStations: [], satellites: [] },
    prerequisiteScenarioIds: prereqs,
  });

  it('should return null for scenario without prerequisites', () => {
    const scenario = createTestScenario('scenario-1');

    const result = getNextPrerequisiteScenario(scenario, []);

    expect(result).toBeNull();
  });

  it('should return null when all prerequisites are completed', () => {
    const scenario = createTestScenario('scenario-2', ['scenario-1']);

    const result = getNextPrerequisiteScenario(scenario, ['scenario-1']);

    expect(result).toBeNull();
  });

  it('should return the first incomplete prerequisite', () => {
    const scenario = createTestScenario('scenario-2', ['scenario-1']);

    const result = getNextPrerequisiteScenario(scenario, []);

    expect(result).not.toBeNull();
    expect(result?.id).toBe('scenario-1');
  });

  it('should skip completed prerequisites and return next incomplete', () => {
    const scenario = createTestScenario('scenario-4', ['scenario-2', 'scenario-3']);

    const result = getNextPrerequisiteScenario(scenario, ['scenario-2']);

    expect(result).not.toBeNull();
    expect(result?.id).toBe('scenario-3');
  });

  it('should return null if prerequisite scenario not found in SCENARIOS', () => {
    const scenario = createTestScenario('test', ['non-existent-scenario']);

    const result = getNextPrerequisiteScenario(scenario, []);

    expect(result).toBeNull();
  });
});

describe('getPrerequisiteScenarioNames', () => {
  const createTestScenario = (prereqs?: string[]): ScenarioData => ({
    id: 'test',
    number: 1,
    title: 'Test Scenario',
    subtitle: 'Test',
    url: '/test',
    imageUrl: '/images/test.png',
    duration: '30 min',
    difficulty: 'beginner',
    missionType: 'Test',
    description: 'Test',
    equipment: [],
    settings: { isSync: false, groundStations: [], satellites: [] },
    prerequisiteScenarioIds: prereqs,
  });

  it('should return empty array for scenario without prerequisites', () => {
    const scenario = createTestScenario();

    const names = getPrerequisiteScenarioNames(scenario);

    expect(names).toEqual([]);
  });

  it('should return empty array for empty prerequisites', () => {
    const scenario = createTestScenario([]);

    const names = getPrerequisiteScenarioNames(scenario);

    expect(names).toEqual([]);
  });

  it('should return scenario titles for valid prerequisites', () => {
    const scenario = createTestScenario(['scenario-1', 'scenario-2']);

    const names = getPrerequisiteScenarioNames(scenario);

    expect(names).toContain('Scenario 1');
    expect(names).toContain('Scenario 2');
  });

  it('should return ID for unknown prerequisite scenarios', () => {
    const scenario = createTestScenario(['unknown-scenario']);

    const names = getPrerequisiteScenarioNames(scenario);

    // Should return the ID since scenario not found
    expect(names).toEqual(['unknown-scenario']);
  });
});

describe('SCENARIOS constant', () => {
  it('should be an array of scenario data', () => {
    expect(Array.isArray(SCENARIOS)).toBe(true);
    expect(SCENARIOS.length).toBeGreaterThan(0);
  });

  it('should include sandbox scenario', () => {
    const sandbox = SCENARIOS.find(s => s.id === 'sandbox');
    expect(sandbox).toBeDefined();
  });
});
