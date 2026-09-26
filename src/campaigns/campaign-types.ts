import { ScenarioData } from '@app/ScenarioData';

/**
 * Identity shown in the Mission Control command bar (top left).
 *
 * The bar used to hardcode "ORBITALOPS" plus a globe icon for every campaign,
 * which is wrong for stations that are not an ops floor at all - Campaign 3 is
 * a backyard. The name is rendered in two parts so the second can carry the
 * campaign accent color, matching the original ORBITAL + OPS treatment.
 */
export interface CampaignHeaderIdentity {
  /** First half of the wordmark, rendered in plain text (e.g. 'ORBITAL') */
  name: string;

  /** Second half, rendered in the campaign accent color (e.g. 'OPS') */
  nameAccent: string;

  /** Font Awesome classes for the leading icon (e.g. 'fa-solid fa-satellite-dish') */
  icon: string;
}

/**
 * Which chrome the Mission Control shell wears.
 *
 * Sits between the shared CSS and the per-campaign accent: layout, typography
 * and relief are authored once per variant, hue stays per campaign. That is
 * what lets two campaigns read as the same system (C1/C2, C4/C5) without
 * duplicating rules, and what keeps 'standard' free - it is defined as the
 * rules already in the stylesheet, so its block is empty.
 *
 * - `standard` - the commercial teleport look (Campaigns 1 and 2)
 * - `sdr`      - the consumer SDR application look (Campaign 3)
 * - `tactical` - a green-army EW workstation look (available, currently unworn)
 * - `astro`    - the Space Force console look, after the Astro UXDS design
 *                system the SSC reference apps use (Campaigns 4 and 5)
 */
export type ChromeVariant = 'standard' | 'sdr' | 'tactical' | 'astro';

/**
 * How finished a campaign is, and therefore what we promise the player.
 *
 * Every campaign is registered and playable, so this is the only thing that
 * tells someone whether they are starting a finished experience or a work in
 * progress. The copy for each stage lives in `release-stage.ts`.
 *
 * - `stable` - finished and supported; the default when a campaign omits it
 * - `beta`   - content complete, still under public test, saved progress holds
 * - `alpha`  - actively being built; incomplete, buggy, and future changes are
 *              expected to invalidate saved progress
 */
export type ReleaseStage = 'stable' | 'beta' | 'alpha';

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

  /**
   * Wordmark and icon for the Mission Control command bar. Optional - the bar
   * falls back to the historic ORBITAL/OPS globe when a campaign omits it.
   */
  headerIdentity?: CampaignHeaderIdentity;

  /**
   * Chrome the Mission Control shell wears for this campaign. Optional - the
   * Router falls back to 'standard', which is the historic layout, so a
   * campaign that omits it is unchanged.
   */
  chromeVariant?: ChromeVariant;

  /**
   * How finished this campaign is. Optional - a campaign that omits it is
   * treated as `stable` and shows no disclaimer, so warnings are opt-in.
   */
  releaseStage?: ReleaseStage;

  /** Whether this campaign is locked (requires prerequisite campaigns) */
  isLocked?: boolean;

  /** Text to display on campaign card when the campaign is locked */
  lockedText?: string;

  /** IDs of campaigns that must be completed before this one unlocks */
  prerequisiteCampaignIds?: string[];

  /**
   * IDs of individual scenarios that must be completed before this campaign
   * unlocks. Separate from `prerequisiteCampaignIds` because a campaign usually
   * follows on from a story beat rather than a 100% clear - Campaign 2 opens on
   * the Campaign 1 graduation shift (S8), not after all 24 NATS scenarios.
   *
   * Keep this in step with the `prerequisiteScenarioIds` on the campaign's own
   * first scenario, or the card unlocks onto a locked scenario list.
   */
  prerequisiteScenarioIds?: string[];

  /** Whether this campaign is coming soon (disabled) */
  isDisabled?: boolean;

  /** Optional coming soon text to display on campaign card */
  disabledText?: string;
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
