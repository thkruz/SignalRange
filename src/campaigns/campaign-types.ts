import { ScenarioData } from '@app/ScenarioData';

/**
 * Campaign Data Interface
 * Represents a collection of related scenarios grouped into a campaign
 */
export interface CampaignData {
  /** Unique identifier for the campaign */
  id: string;

  /** Display title for the campaign */
  title: string;

  /** Subtitle/tagline for the campaign */
  subtitle: string;

  /** Full HTML description of the campaign */
  description: string;

  /** URL to campaign card image */
  imageUrl: string;

  /** Scenarios belonging to this campaign */
  scenarios: ScenarioData[];

  /** Campaign difficulty range (derived from scenarios) */
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'mixed';

  /** Estimated total duration for all scenarios */
  totalDuration: string;

  /** Campaign category/type */
  campaignType: string;

  /** Whether this campaign is locked (requires prerequisite campaigns) */
  isLocked?: boolean;

  /** IDs of campaigns that must be completed before this one unlocks */
  prerequisiteCampaignIds?: string[];

  /** Whether this campaign is coming soon (disabled) */
  isDisabled?: boolean;
}

/**
 * Campaign Progress Interface
 * Tracks user progress within a campaign
 */
export interface CampaignProgress {
  /** Campaign ID */
  campaignId: string;

  /** Completed scenario IDs within this campaign */
  completedScenarios: string[];

  /** Total scenarios in campaign */
  totalScenarios: number;

  /** Completion percentage (0-100) */
  completionPercentage: number;

  /** Whether all scenarios in campaign are completed */
  isCompleted: boolean;
}
