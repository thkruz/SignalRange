import { html } from "../../engine/utils/development/formatter";
import { Component } from '../component';
import './Footer.css';

/**
 * Footer Component
 * Application footer with copyright and license information
 */
export class Footer extends Component {
  protected readonly html = html`
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
      <a href="https://raw.githubusercontent.com/thkruz/iris/dev/LICENSE.md" target="_blank" rel="noopener noreferrer">LICENSE</a>
    `;
  }
}