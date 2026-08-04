import { CampaignManager } from '@app/campaigns/campaign-manager';
import { ChromeVariant } from '@app/campaigns/campaign-types';
import { ScenarioManager } from '@app/scenario-manager';

/**
 * Chrome variant of the campaign that owns the running scenario.
 *
 * Most of the variant lands as CSS through the `chrome-<variant>` body class
 * the Router applies. This is for the handful of places where the difference is
 * *content* rather than style - the command bar's clock format and timer labels
 * - and cannot be expressed in a stylesheet.
 *
 * Falls back to 'standard' when there is no scenario (menus, sandbox boot),
 * matching how the command bar already resolves its header identity.
 */
export function activeChromeVariant(): ChromeVariant {
  try {
    const scenarioId = ScenarioManager.getInstance().data.id;

    return CampaignManager.getInstance().getCampaignForScenario(scenarioId)?.chromeVariant ?? 'standard';
  } catch {
    return 'standard';
  }
}
