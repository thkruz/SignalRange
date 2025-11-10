import { BaseElement } from "@app/components/base-element";
import { html } from "../../../engine/utils/development/formatter";
import './body.css';

/**
 * Body Component
 * Main content area container
 */
export class Body extends BaseElement {
  static readonly containerId = 'body-content-container';
  private static instance_: Body;

  private constructor(rootElementId: string) {
    super();
    this.init_(rootElementId, 'add');
  }

  public static create(rootElementId: string): Body {
    if (Body.instance_) {
      throw new Error("Body instance already exists.");
    }

    Body.instance_ = new Body(rootElementId);

    return Body.instance_;
  }

  public static getInstance(): Body {
    if (!Body.instance_) {
      throw new Error("Body instance does not exist.");
    }

    return Body.instance_;
  }

  protected readonly html_ = html`
      <main class="body">
        <div class="body-content" id="${Body.containerId}">
        </div>
      </main>
    `;

  protected addEventListeners_(): void {
    // No event listeners for now
  }
}