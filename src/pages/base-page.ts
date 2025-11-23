import { BaseElement } from "@app/components/base-element";

export abstract class BasePage extends BaseElement {
  abstract id: string;

  show(): void {
    if (!this.dom_) return;
    this.dom_.style.display = 'flex';
  }

  hide(): void {
    if (!this.dom_) return;
    this.dom_.style.display = 'none';
  }
}