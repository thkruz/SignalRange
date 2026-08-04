import { html } from '@app/engine/utils/development/formatter';
import type { CampaignData, ReleaseStage } from './campaign-types';

/**
 * Release-stage disclaimers for campaigns that are not finished yet.
 *
 * Campaigns ship on very different footings - Campaign 1 is done, Campaign 2 is
 * feature-complete but still under test, and Campaigns 3-5 are being actively
 * built and can break saved progress from one build to the next. All five are
 * registered and playable, so the only thing telling a player which is which is
 * the copy in here. Every string a player reads about beta/alpha status is
 * authored once in this module and rendered by both the campaign grid and the
 * per-campaign scenario list.
 */

/** Feedback form on the marketing site (SignalRange domain, KeepTrack mailroom). */
export const FEEDBACK_CONTACT_URL = 'https://signalrange.space/contact-us';

/** Community Discord - same invite the app header links to. */
export const FEEDBACK_DISCORD_URL = 'https://discord.gg/hr6jUHEgPB';

/** Campaigns we point players at when they want something finished. */
const POLISHED_CAMPAIGN_TEXT = '<strong>North Atlantic Teleport Services</strong> (Campaign 1)';

/**
 * A campaign with no explicit stage is treated as finished, so Campaign 1 needs
 * no annotation and any future campaign has to opt in to a warning.
 */
export function getReleaseStage(campaign: CampaignData): ReleaseStage {
  return campaign.releaseStage ?? 'stable';
}

/**
 * Short badge shown beside difficulty/duration on a campaign card.
 * Returns an empty string for stable campaigns so the badge row is unchanged.
 */
export function renderReleaseBadge(stage: ReleaseStage): string {
  switch (stage) {
    case 'beta':
      return html`<span class="badge release-beta">Public Beta</span>`;
    case 'alpha':
      return html`<span class="badge release-alpha">Alpha</span>`;
    default:
      return '';
  }
}

/**
 * One-line warning strip inside a campaign card.
 *
 * Deliberately link-free: the whole card is a click target that navigates to
 * the campaign, so an anchor here would fire both the link and the navigation.
 * The reporting links live in the callout on the scenario list instead.
 */
export function renderReleaseCardNotice(stage: ReleaseStage): string {
  switch (stage) {
    case 'beta':
      return html`
        <div class="release-notice release-notice-beta">
          <span class="release-notice-icon">&#9888;</span>
          <span>
            <strong>Public beta.</strong> Playable start to finish, but still under test - you may
            hit errors. Bug reports welcome.
          </span>
        </div>
      `;
    case 'alpha':
      return html`
        <div class="release-notice release-notice-alpha">
          <span class="release-notice-icon">&#9888;</span>
          <span>
            <strong>Alpha build, in active development.</strong> Expect missing content and errors.
            Future changes are likely to invalidate saved progress.
          </span>
        </div>
      `;
    default:
      return '';
  }
}

/**
 * Full disclaimer shown under the campaign title on its scenario list - the last
 * screen before a player commits to a scenario, and the place the reporting
 * links can safely live.
 */
export function renderReleaseCallout(stage: ReleaseStage): string {
  if (stage === 'stable') {
    return '';
  }

  const links = html`
    <div class="release-callout-actions">
      <a href="${FEEDBACK_CONTACT_URL}" target="_blank" rel="noopener noreferrer">Report a problem</a>
      <a href="${FEEDBACK_DISCORD_URL}" target="_blank" rel="noopener noreferrer">Join the Discord</a>
    </div>
  `;

  if (stage === 'beta') {
    return html`
      <div class="release-callout release-callout-beta">
        <div class="release-callout-title">
          <span class="release-callout-icon">&#9888;</span> Public Beta
        </div>
        <p class="release-callout-body">
          This campaign is complete and playable from start to finish, but it is still under public
          test and some things are still wrong. If a scenario stalls, an objective refuses to
          complete, or a reading looks impossible, that is a bug and we want to hear about it.
          Saved progress is expected to carry forward.
        </p>
        ${links}
      </div>
    `;
  }

  return html`
    <div class="release-callout release-callout-alpha">
      <div class="release-callout-title">
        <span class="release-callout-icon">&#9888;</span> Alpha Build - Active Development
      </div>
      <p class="release-callout-body">
        This campaign is still being built. It is incomplete, it contains known errors, and it is
        likely to change - including changes that invalidate saved progress, so treat anything you
        complete here as temporary. You are very welcome to explore what is coming and tell us what
        you find. If you want a more polished experience, we recommend ${POLISHED_CAMPAIGN_TEXT} or
        <strong>North Atlantic Teleport Services EU</strong> (Campaign 2) for now.
      </p>
      ${links}
    </div>
  `;
}
