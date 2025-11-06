import { Logger } from "@app/logging/logger";
import { Hertz } from "@app/types";
import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-span-btn.css';

export class ACSpanBtn extends BaseControlButton {
  private static instance_: ACSpanBtn;
  private readonly analyzerControl: AnalyzerControl;
  private subMenuSelected: 'set-span' | null = null;

  private constructor(analyzerControl: AnalyzerControl) {
    super({
      uniqueId: 'ac-span-btn',
      label: 'Span',
      ariaLabel: 'Span',
    });
    if (analyzerControl) {
      this.analyzerControl = analyzerControl;
    }
  }

  static create(analyzerControl: AnalyzerControl): ACSpanBtn {
    this.instance_ = new ACSpanBtn(analyzerControl);
    return this.instance_;
  }

  static getInstance(): ACSpanBtn {
    return this.instance_;
  }

  protected handleClick_(): void {
    this.analyzerControl.controlSelection = this;

    this.analyzerControl.domCache['label-cell-1'].textContent = 'Set Span';
    this.analyzerControl.domCache['label-cell-2'].textContent = '';
    this.analyzerControl.domCache['label-cell-3'].textContent = '';
    this.analyzerControl.domCache['label-cell-4'].textContent = '';
    this.analyzerControl.domCache['label-cell-5'].textContent = '';
    this.analyzerControl.domCache['label-cell-6'].textContent = '';
    this.analyzerControl.domCache['label-cell-7'].textContent = '';
    this.analyzerControl.domCache['label-cell-8'].textContent = '';

    this.analyzerControl.domCache['label-select-button-1']?.addEventListener('click', this.handleSetSpanClick.bind(this));
  }

  private handleSetSpanClick(): void {
    this.subMenuSelected = 'set-span';

    // Update the display with current span
    this.analyzerControl.specA.state.inputValue = (this.analyzerControl.specA.state.span / 1e6).toString();
    this.analyzerControl.specA.state.inputUnit = 'MHz';

    this.analyzerControl.specA.syncDomWithState();
    this.playSound();
  }

  onEnterPressed(): void {
    Logger.info(`Processing frequency input for ${this.subMenuSelected} frequency.`);

    const inputValue = parseFloat(this.analyzerControl.specA.state.inputValue);
    const inputUnit = this.analyzerControl.specA.state.inputUnit;
    let frequencyInHz: number;

    // Convert input value to Hz based on selected unit
    switch (inputUnit) {
      case 'GHz':
        frequencyInHz = inputValue * 1e9;
        break;
      case 'MHz':
        frequencyInHz = inputValue * 1e6;
        break;
      case 'kHz':
        frequencyInHz = inputValue * 1e3;
        break;
      case 'Hz':
        break;
      default:
        throw new Error('Invalid frequency unit');
    }

    this.analyzerControl.specA.state.span = frequencyInHz as Hertz;
    this.analyzerControl.specA.state.lockedControl = 'span';

    this.playSound();
  }
}
