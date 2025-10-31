import { Component } from '../Component';
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

    const contentArea = this.createElement('div', {
      className: 'body-content'
    });

    body.appendChild(contentArea);
    this.element = body;

    return body;
  }
}