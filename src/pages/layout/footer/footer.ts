import { BaseElement } from "@app/components/base-element";
import { html } from "../../../engine/utils/development/formatter";
import './footer.css';

/**
 * Footer Component
 * Application footer with copyright and license information
 */
export class Footer extends BaseElement {
  private static instance_: Footer;

  private constructor(rootElementId?: string) {
    super();
    this.init_(rootElementId, 'add');
  }

  public static create(rootElementId?: string): Footer {
    if (Footer.instance_) {
      throw new Error("Footer instance already exists.");
    }

    Footer.instance_ = new Footer(rootElementId);

    return Footer.instance_;
  }

  public static getInstance(): Footer {
    if (!Footer.instance_) {
      throw new Error("Footer instance does not exist.");
    }

    return Footer.instance_;
  }

  protected readonly html_ = html`
    <footer class="footer">
      <div class="footer-toolbar">
        <div class="footer-text">
          <p>${this.generateCopyrightInfo()}</p>
        </div>
      </div>
    </footer>
  `;

  private generateCopyrightInfo(): any {
    return `
      © 2025 Kruczek Labs LLC. All rights reserved. SignalRange&#8482; is a trademark.<br>
      Licensed under GNU AGPL v3.0. Attribution and this notice required.
      <a href="https://raw.githubusercontent.com/thkruz/SignalRange/dev/LICENSE.md" target="_blank" rel="noopener noreferrer">LICENSE</a>
    `;
  }

  protected addEventListeners_(): void {
    // No event listeners for now
  }
}