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
      Copyright © 2022-2025
      <a href="https://github.com/thkruz/" target="_blank" rel="noopener noreferrer">
        Theodore Kruczek
      </a>.
      All rights reserved. Source Code licensed under
      <a href="https://raw.githubusercontent.com/thkruz/iris/dev/LICENSE.md" target="_blank" rel="noopener noreferrer">
        AGPLv3
      </a>.
    `;
  }
}