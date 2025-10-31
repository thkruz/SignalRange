import { Component } from '../Component';
import './Header.css';

/**
 * Header Component
 * Main application header with logo and navigation
 */
export class Header extends Component {
  public render(): HTMLElement {
    const header = this.createElement('header', {
      className: 'header'
    });

    const toolbar = this.createElement('div', {
      className: 'header-toolbar'
    });

    // Logo section
    const logoSection = this.createElement('div', {
      className: 'header-logo-section'
    });

    const logoButton = this.createElement('button', {
      className: 'header-logo-button'
    });

    const logoImg = this.createElement('img', {
      attributes: {
        src: './patch.png',
        alt: 'IRIS Logo',
        height: '80'
      }
    });

    logoButton.appendChild(logoImg);
    logoButton.addEventListener('click', () => {
      window.location.href = '/';
    });

    logoSection.appendChild(logoButton);

    // Title section
    const titleSection = this.createElement('div', {
      className: 'header-title-section'
    });

    const mainTitle = this.createElement('div', {
      className: 'header-main-title',
      textContent: 'IRIS'
    });

    const subtitle = this.createElement('div', {
      className: 'header-subtitle',
      textContent: 'Space Electronic Warfare Sandbox'
    });

    titleSection.appendChild(mainTitle);
    titleSection.appendChild(subtitle);

    // Actions section
    const actionsSection = this.createElement('div', {
      className: 'header-actions'
    });

    const githubBtn = this.createIconButton(
      'View Code on Github',
      '⚙',
      () => window.open('http://github.com/thkruz/iris', '_blank')
    );

    const helpBtn = this.createIconButton(
      'Help',
      '?',
      () => this.showHelpModal()
    );

    actionsSection.appendChild(githubBtn);
    actionsSection.appendChild(helpBtn);

    // Assemble toolbar
    toolbar.appendChild(logoSection);
    toolbar.appendChild(titleSection);
    toolbar.appendChild(actionsSection);

    header.appendChild(toolbar);
    this.element = header;

    return header;
  }

  private createIconButton(title: string, icon: string, onClick: () => void): HTMLElement {
    const button = this.createElement('button', {
      className: 'header-icon-button',
      attributes: { title }
    });

    const iconSpan = this.createElement('span', {
      textContent: icon,
      className: 'icon'
    });

    button.appendChild(iconSpan);
    button.addEventListener('click', onClick);

    return button;
  }

  private showHelpModal(): void {
    // TODO: Implement help modal
    console.log('Show help modal');
  }
}