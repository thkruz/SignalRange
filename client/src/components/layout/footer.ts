import { html } from '../../utils';
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
      This instance is licensed under the GNU AGPL v3.0. Attribution, source access, and this notice must remain visible.<br>
      Unauthorized use, rebranding, or removal of attribution may violate trademark and open source license terms.<br>
      © 2025 Kruczek Labs LLC. All rights reserved. See <a href="https://raw.githubusercontent.com/thkruz/iris/dev/LICENSE.md" target="_blank" rel="noopener noreferrer">LICENSE</a> for full terms.
    `;
  }
}