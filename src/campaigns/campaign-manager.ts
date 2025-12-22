import { ScenarioData } from '@app/ScenarioData';
import { CampaignData, CampaignProgress } from './campaign-types';

/**
 * CampaignManager - Singleton class for managing campaigns and their scenarios
 */
export class CampaignManager {
  private static instance_: CampaignManager;
  private readonly campaigns_: CampaignData[] = [];

  private constructor() {
    // Private constructor to enforce singleton pattern
  }

  static getInstance(): CampaignManager {
    this.instance_ ??= new CampaignManager();
    return this.instance_;
  }

  /**
   * Register a campaign with the manager
   */
  registerCampaign(campaign: CampaignData): void {
    this.campaigns_.push(campaign);
  }

  /**
   * Get all registered campaigns
   */
  getAllCampaigns(): CampaignData[] {
    return this.campaigns_;
  }

  /**
   * Get a specific campaign by ID
   */
  getCampaign(campaignId: string): CampaignData | undefined {
    return this.campaigns_.find(c => c.id === campaignId);
  }

  /**
   * Get all scenarios for a specific campaign
   */
  getScenariosForCampaign(campaignId: string): ScenarioData[] {
    const campaign = this.getCampaign(campaignId);
    return campaign?.scenarios || [];
  }

  /**
   * Get a specific scenario by campaign ID and scenario ID
   */
  getScenario(campaignId: string, scenarioId: string): ScenarioData | undefined {
    const campaign = this.getCampaign(campaignId);
    return campaign?.scenarios.find(s => s.id === scenarioId);
  }

  /**
   * Find which campaign contains a specific scenario
   */
  getCampaignForScenario(scenarioId: string): CampaignData | undefined {
    return this.campaigns_.find(campaign =>
      campaign.scenarios.some(s => s.id === scenarioId)
    );
  }

  /**
   * Get all scenarios across all campaigns (flat list)
   */
  getAllScenarios(): ScenarioData[] {
    return this.campaigns_.flatMap(campaign => campaign.scenarios);
  }

  /**
   * Check if a campaign is locked based on prerequisites
   */
  isCampaignLocked(campaign: CampaignData, completedCampaignIds: string[]): boolean {
    if (!campaign.prerequisiteCampaignIds || campaign.prerequisiteCampaignIds.length === 0) {
      return false;
    }

    return !campaign.prerequisiteCampaignIds.every(prereqId =>
      completedCampaignIds.includes(prereqId)
    );
  }

  /**
   * Calculate campaign progress for a user
   */
  getCampaignProgress(campaignId: string, completedScenarioIds: string[]): CampaignProgress {
    const campaign = this.getCampaign(campaignId);
    if (!campaign) {
      return {
        campaignId,
        completedScenarios: [],
        totalScenarios: 0,
        completionPercentage: 0,
        isCompleted: false,
      };
    }

    const campaignScenarioIds = campaign.scenarios.map(s => s.id);
    const completedInCampaign = completedScenarioIds.filter(id =>
      campaignScenarioIds.includes(id)
    );

    const totalScenarios = campaign.scenarios.length;
    const completionPercentage = totalScenarios > 0
      ? Math.round((completedInCampaign.length / totalScenarios) * 100)
      : 0;

    return {
      campaignId,
      completedScenarios: completedInCampaign,
      totalScenarios,
      completionPercentage,
      isCompleted: completedInCampaign.length === totalScenarios && totalScenarios > 0,
    };
  }

  /**
   * Get list of completed campaign IDs
   */
  getCompletedCampaigns(completedScenarioIds: string[]): string[] {
    return this.campaigns_
      .filter(campaign => {
        const progress = this.getCampaignProgress(campaign.id, completedScenarioIds);
        return progress.isCompleted;
      })
      .map(campaign => campaign.id);
  }
}
