import { BaseElement } from "@app/components/base-element";

export abstract class BasePage extends BaseElement {
  abstract id: string;

  show(): void {
    this.dom_.style.display = 'flex';
  }

  hide(): void {
    this.dom_.style.display = 'none';
  }
}