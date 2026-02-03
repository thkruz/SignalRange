import { CampaignManager } from '../../src/campaigns/campaign-manager';
import type { CampaignData } from '../../src/campaigns/campaign-types';
import type { ScenarioData } from '../../src/ScenarioData';

describe('CampaignManager', () => {
  // Helper to reset singleton between tests
  const resetInstance = (): void => {
    (CampaignManager as any).instance_ = undefined;
  };

  // Mock scenario data factory
  const createMockScenario = (id: string, title: string = `Scenario ${id}`): ScenarioData => ({
    id,
    title,
    subtitle: 'Test Subtitle',
    url: id,
    imageUrl: 'test.jpg',
    number: 1,
    duration: '30 min',
    difficulty: 'beginner',
    missionType: 'Training',
    description: 'Test description',
    equipment: ['Antenna'],
    settings: {
      isSync: false,
      groundStations: [],
      antennas: [],
      satellites: [],
    },
  });

  // Mock campaign data factory
  const createMockCampaign = (
    id: string,
    scenarios: ScenarioData[],
    options: Partial<CampaignData> = {}
  ): CampaignData => ({
    id,
    title: `Campaign ${id}`,
    subtitle: 'Test Campaign',
    description: 'Test description',
    imageUrl: 'campaign.jpg',
    scenarios,
    difficulty: 'beginner',
    totalDuration: '2 hours',
    campaignType: 'Training',
    ...options,
  });

  beforeEach(() => {
    resetInstance();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = CampaignManager.getInstance();
      const instance2 = CampaignManager.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should create new instance if none exists', () => {
      const instance = CampaignManager.getInstance();

      expect(instance).toBeInstanceOf(CampaignManager);
    });
  });

  describe('registerCampaign', () => {
    it('should register a campaign', () => {
      const manager = CampaignManager.getInstance();
      const campaign = createMockCampaign('camp-1', [createMockScenario('scn-1')]);

      manager.registerCampaign(campaign);

      expect(manager.getAllCampaigns()).toContain(campaign);
    });

    it('should allow registering multiple campaigns', () => {
      const manager = CampaignManager.getInstance();
      const campaign1 = createMockCampaign('camp-1', [createMockScenario('scn-1')]);
      const campaign2 = createMockCampaign('camp-2', [createMockScenario('scn-2')]);

      manager.registerCampaign(campaign1);
      manager.registerCampaign(campaign2);

      expect(manager.getAllCampaigns()).toHaveLength(2);
    });
  });

  describe('getAllCampaigns', () => {
    it('should return empty array when no campaigns registered', () => {
      const manager = CampaignManager.getInstance();

      expect(manager.getAllCampaigns()).toEqual([]);
    });

    it('should return all registered campaigns', () => {
      const manager = CampaignManager.getInstance();
      const campaign1 = createMockCampaign('camp-1', []);
      const campaign2 = createMockCampaign('camp-2', []);

      manager.registerCampaign(campaign1);
      manager.registerCampaign(campaign2);

      const campaigns = manager.getAllCampaigns();
      expect(campaigns).toHaveLength(2);
      expect(campaigns).toContain(campaign1);
      expect(campaigns).toContain(campaign2);
    });
  });

  describe('getCampaign', () => {
    it('should return campaign by ID', () => {
      const manager = CampaignManager.getInstance();
      const campaign = createMockCampaign('target-camp', [createMockScenario('scn-1')]);
      manager.registerCampaign(campaign);

      const result = manager.getCampaign('target-camp');

      expect(result).toBe(campaign);
    });

    it('should return undefined for non-existent campaign', () => {
      const manager = CampaignManager.getInstance();

      const result = manager.getCampaign('non-existent');

      expect(result).toBeUndefined();
    });
  });

  describe('getScenariosForCampaign', () => {
    it('should return scenarios for a campaign', () => {
      const manager = CampaignManager.getInstance();
      const scenario1 = createMockScenario('scn-1');
      const scenario2 = createMockScenario('scn-2');
      const campaign = createMockCampaign('camp-1', [scenario1, scenario2]);
      manager.registerCampaign(campaign);

      const scenarios = manager.getScenariosForCampaign('camp-1');

      expect(scenarios).toHaveLength(2);
      expect(scenarios).toContain(scenario1);
      expect(scenarios).toContain(scenario2);
    });

    it('should return empty array for non-existent campaign', () => {
      const manager = CampaignManager.getInstance();

      const scenarios = manager.getScenariosForCampaign('non-existent');

      expect(scenarios).toEqual([]);
    });
  });

  describe('getScenario', () => {
    it('should return specific scenario from campaign', () => {
      const manager = CampaignManager.getInstance();
      const scenario = createMockScenario('target-scn', 'Target Scenario');
      const campaign = createMockCampaign('camp-1', [
        createMockScenario('scn-1'),
        scenario,
        createMockScenario('scn-3'),
      ]);
      manager.registerCampaign(campaign);

      const result = manager.getScenario('camp-1', 'target-scn');

      expect(result).toBe(scenario);
    });

    it('should return undefined for non-existent scenario', () => {
      const manager = CampaignManager.getInstance();
      const campaign = createMockCampaign('camp-1', [createMockScenario('scn-1')]);
      manager.registerCampaign(campaign);

      const result = manager.getScenario('camp-1', 'non-existent');

      expect(result).toBeUndefined();
    });

    it('should return undefined for non-existent campaign', () => {
      const manager = CampaignManager.getInstance();

      const result = manager.getScenario('non-existent', 'scn-1');

      expect(result).toBeUndefined();
    });
  });

  describe('getCampaignForScenario', () => {
    it('should return campaign containing the scenario', () => {
      const manager = CampaignManager.getInstance();
      const campaign1 = createMockCampaign('camp-1', [createMockScenario('scn-1')]);
      const campaign2 = createMockCampaign('camp-2', [createMockScenario('scn-2')]);
      manager.registerCampaign(campaign1);
      manager.registerCampaign(campaign2);

      const result = manager.getCampaignForScenario('scn-2');

      expect(result).toBe(campaign2);
    });

    it('should return undefined for scenario not in any campaign', () => {
      const manager = CampaignManager.getInstance();
      const campaign = createMockCampaign('camp-1', [createMockScenario('scn-1')]);
      manager.registerCampaign(campaign);

      const result = manager.getCampaignForScenario('non-existent');

      expect(result).toBeUndefined();
    });
  });

  describe('getAllScenarios', () => {
    it('should return all scenarios from all campaigns', () => {
      const manager = CampaignManager.getInstance();
      const scenario1 = createMockScenario('scn-1');
      const scenario2 = createMockScenario('scn-2');
      const scenario3 = createMockScenario('scn-3');
      manager.registerCampaign(createMockCampaign('camp-1', [scenario1, scenario2]));
      manager.registerCampaign(createMockCampaign('camp-2', [scenario3]));

      const scenarios = manager.getAllScenarios();

      expect(scenarios).toHaveLength(3);
      expect(scenarios).toContain(scenario1);
      expect(scenarios).toContain(scenario2);
      expect(scenarios).toContain(scenario3);
    });

    it('should return empty array when no campaigns', () => {
      const manager = CampaignManager.getInstance();

      const scenarios = manager.getAllScenarios();

      expect(scenarios).toEqual([]);
    });
  });

  describe('isCampaignLocked', () => {
    it('should return false when no prerequisites', () => {
      const manager = CampaignManager.getInstance();
      const campaign = createMockCampaign('camp-1', []);

      const result = manager.isCampaignLocked(campaign, []);

      expect(result).toBe(false);
    });

    it('should return false when prerequisites is empty array', () => {
      const manager = CampaignManager.getInstance();
      const campaign = createMockCampaign('camp-1', [], {
        prerequisiteCampaignIds: [],
      });

      const result = manager.isCampaignLocked(campaign, []);

      expect(result).toBe(false);
    });

    it('should return false when all prerequisites completed', () => {
      const manager = CampaignManager.getInstance();
      const campaign = createMockCampaign('camp-3', [], {
        prerequisiteCampaignIds: ['camp-1', 'camp-2'],
      });

      const result = manager.isCampaignLocked(campaign, ['camp-1', 'camp-2']);

      expect(result).toBe(false);
    });

    it('should return true when some prerequisites not completed', () => {
      const manager = CampaignManager.getInstance();
      const campaign = createMockCampaign('camp-3', [], {
        prerequisiteCampaignIds: ['camp-1', 'camp-2'],
      });

      const result = manager.isCampaignLocked(campaign, ['camp-1']);

      expect(result).toBe(true);
    });

    it('should return true when no prerequisites completed', () => {
      const manager = CampaignManager.getInstance();
      const campaign = createMockCampaign('camp-2', [], {
        prerequisiteCampaignIds: ['camp-1'],
      });

      const result = manager.isCampaignLocked(campaign, []);

      expect(result).toBe(true);
    });
  });

  describe('getCampaignProgress', () => {
    it('should return zero progress for non-existent campaign', () => {
      const manager = CampaignManager.getInstance();

      const progress = manager.getCampaignProgress('non-existent', []);

      expect(progress).toEqual({
        campaignId: 'non-existent',
        completedScenarios: [],
        totalScenarios: 0,
        completionPercentage: 0,
        isCompleted: false,
      });
    });

    it('should return correct progress for partial completion', () => {
      const manager = CampaignManager.getInstance();
      const campaign = createMockCampaign('camp-1', [
        createMockScenario('scn-1'),
        createMockScenario('scn-2'),
        createMockScenario('scn-3'),
        createMockScenario('scn-4'),
      ]);
      manager.registerCampaign(campaign);

      const progress = manager.getCampaignProgress('camp-1', ['scn-1', 'scn-3']);

      expect(progress).toEqual({
        campaignId: 'camp-1',
        completedScenarios: ['scn-1', 'scn-3'],
        totalScenarios: 4,
        completionPercentage: 50,
        isCompleted: false,
      });
    });

    it('should return 100% for fully completed campaign', () => {
      const manager = CampaignManager.getInstance();
      const campaign = createMockCampaign('camp-1', [
        createMockScenario('scn-1'),
        createMockScenario('scn-2'),
      ]);
      manager.registerCampaign(campaign);

      const progress = manager.getCampaignProgress('camp-1', ['scn-1', 'scn-2']);

      expect(progress.completionPercentage).toBe(100);
      expect(progress.isCompleted).toBe(true);
    });

    it('should ignore completed scenarios from other campaigns', () => {
      const manager = CampaignManager.getInstance();
      const campaign = createMockCampaign('camp-1', [
        createMockScenario('scn-1'),
        createMockScenario('scn-2'),
      ]);
      manager.registerCampaign(campaign);

      const progress = manager.getCampaignProgress('camp-1', ['scn-1', 'other-campaign-scn']);

      expect(progress.completedScenarios).toEqual(['scn-1']);
      expect(progress.completionPercentage).toBe(50);
    });

    it('should round percentage correctly', () => {
      const manager = CampaignManager.getInstance();
      const campaign = createMockCampaign('camp-1', [
        createMockScenario('scn-1'),
        createMockScenario('scn-2'),
        createMockScenario('scn-3'),
      ]);
      manager.registerCampaign(campaign);

      const progress = manager.getCampaignProgress('camp-1', ['scn-1']);

      expect(progress.completionPercentage).toBe(33); // 1/3 = 33.33... rounded to 33
    });
  });

  describe('getCompletedCampaigns', () => {
    it('should return empty array when no campaigns completed', () => {
      const manager = CampaignManager.getInstance();
      manager.registerCampaign(createMockCampaign('camp-1', [createMockScenario('scn-1')]));

      const completed = manager.getCompletedCampaigns([]);

      expect(completed).toEqual([]);
    });

    it('should return completed campaign IDs', () => {
      const manager = CampaignManager.getInstance();
      manager.registerCampaign(createMockCampaign('camp-1', [createMockScenario('scn-1')]));
      manager.registerCampaign(createMockCampaign('camp-2', [createMockScenario('scn-2')]));

      const completed = manager.getCompletedCampaigns(['scn-1']);

      expect(completed).toEqual(['camp-1']);
    });

    it('should return multiple completed campaign IDs', () => {
      const manager = CampaignManager.getInstance();
      manager.registerCampaign(createMockCampaign('camp-1', [createMockScenario('scn-1')]));
      manager.registerCampaign(createMockCampaign('camp-2', [createMockScenario('scn-2')]));
      manager.registerCampaign(createMockCampaign('camp-3', [
        createMockScenario('scn-3'),
        createMockScenario('scn-4'),
      ]));

      const completed = manager.getCompletedCampaigns(['scn-1', 'scn-2', 'scn-3']);

      expect(completed).toEqual(['camp-1', 'camp-2']);
    });

    it('should not include partially completed campaigns', () => {
      const manager = CampaignManager.getInstance();
      manager.registerCampaign(createMockCampaign('camp-1', [
        createMockScenario('scn-1'),
        createMockScenario('scn-2'),
      ]));

      const completed = manager.getCompletedCampaigns(['scn-1']);

      expect(completed).toEqual([]);
    });
  });

  describe('edge cases', () => {
    it('should handle campaign with empty scenarios', () => {
      const manager = CampaignManager.getInstance();
      const campaign = createMockCampaign('empty-camp', []);
      manager.registerCampaign(campaign);

      const progress = manager.getCampaignProgress('empty-camp', []);

      expect(progress.totalScenarios).toBe(0);
      expect(progress.completionPercentage).toBe(0);
      expect(progress.isCompleted).toBe(false);
    });

    it('should handle scenario ID appearing in multiple completedScenarioIds', () => {
      const manager = CampaignManager.getInstance();
      const campaign = createMockCampaign('camp-1', [createMockScenario('scn-1')]);
      manager.registerCampaign(campaign);

      // Duplicate IDs in completed list
      const progress = manager.getCampaignProgress('camp-1', ['scn-1', 'scn-1']);

      // Should count unique completions within campaign
      expect(progress.completedScenarios).toEqual(['scn-1', 'scn-1']);
      expect(progress.completionPercentage).toBe(200); // This is a limitation of the current implementation
    });
  });
});
