import { BaseElement } from "@app/components/base-element";

export abstract class BasePage extends BaseElement {
  abstract id: string;

  show(): void {
    this.dom_.style.display = 'block';
  }

  hide(): void {
    this.dom_.style.display = 'none';
  }
}