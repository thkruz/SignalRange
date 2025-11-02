import { html } from "../../engine/ui/utils/development/formatter";
import { Component } from '../component';
import './Body.css';

/**
 * Body Component
 * Main content area container
 */
export class Body extends Component {
  protected readonly html = html`
      <main class="body">
        <div class="body-content">
        </div>
      </main>
    `;
}