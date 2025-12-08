import { BaseElement } from '@app/components/base-element';
import { config, isProduction } from '@app/config/env';
import { html } from '@app/engine/utils/development/formatter';
import './environment-badge.css';

/**
 * Environment Badge Component
 * 
 * Displays a badge showing the current environment (UAT, Local, etc.)
 * Only visible when not in production.
 */
export class EnvironmentBadge extends BaseElement {
  private static instance_: EnvironmentBadge | null = null;

  private constructor() {
    super();
  }

  static create(parentElementId: string): EnvironmentBadge | null {
    // Only create badge if not in production
    if (isProduction()) {
      return null;
    }

    if (EnvironmentBadge.instance_) {
      return EnvironmentBadge.instance_;
    }

    EnvironmentBadge.instance_ = new EnvironmentBadge();
    EnvironmentBadge.instance_.init_(parentElementId, 'add');

    return EnvironmentBadge.instance_;
  }

  static getInstance(): EnvironmentBadge | null {
    return EnvironmentBadge.instance_;
  }

  protected readonly html_ = html`
    <div class="environment-badge environment-badge--${config.environment}">
      <span class="environment-badge__label">${config.environment.toUpperCase()}</span>
    </div>
  `;

  protected addEventListeners_(): void {
    // No event listeners needed
  }
}

