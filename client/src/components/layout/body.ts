import { Component } from '../component';
import './Body.css';

/**
 * Body Component
 * Main content area container
 */
export class Body extends Component {
  public render(): HTMLElement {
    const body = this.createElement('main', {
      className: 'body'
    });

    body.innerHTML = `
    <div class="body-content">
    </div>
    `;

    this.element = body;
    return body;
  }
}