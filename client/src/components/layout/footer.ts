import { Component } from '../Component';
import './Footer.css';

/**
 * Footer Component
 * Application footer with copyright and license information
 */
export class Footer extends Component {
  public render(): HTMLElement {
    const footer = this.createElement('footer', {
      className: 'footer'
    });

    const toolbar = this.createElement('div', {
      className: 'footer-toolbar'
    });

    const copyrightText = this.createElement('div', {
      className: 'footer-text'
    });

    copyrightText.innerHTML = `
      Copyright © 2022-2025
      <a href="https://github.com/thkruz/" target="_blank" rel="noopener noreferrer">
        Theodore Kruczek
      </a>.
      All rights reserved. Source Code licensed under
      <a href="https://raw.githubusercontent.com/thkruz/iris/dev/LICENSE.md" target="_blank" rel="noopener noreferrer">
        AGPLv3
      </a>.
    `;

    toolbar.appendChild(copyrightText);
    footer.appendChild(toolbar);
    this.element = footer;

    return footer;
  }
}