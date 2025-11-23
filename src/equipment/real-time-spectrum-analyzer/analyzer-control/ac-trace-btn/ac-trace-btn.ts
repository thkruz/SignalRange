import { Logger } from "@app/logging/logger";
import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-trace-btn.css';

export type TraceMode = 'clearwrite' | 'hold' | 'maxhold' | 'minhold' | 'average';

export class ACTraceBtn extends BaseControlButton {
  private subMenuSelected: 'traceselect' | 'clearwrite' | 'hold' | 'maxhold' | 'minhold' | 'average' | null = null;

  constructor(analyzerControl: AnalyzerControl) {
    super({
      uniqueId: `ac-trace-btn-${analyzerControl.specA.state.uuid}`,
      label: 'Trace',
      ariaLabel: 'Trace',
      analyzerControl,
    });
  }

  protected handleClick_(): void {
    this.analyzerControl.updateSubMenu('trace', this);

    this.analyzerControl.domCache['label-cell-1'].textContent = 'Trace Select';
    this.analyzerControl.domCache['label-cell-2'].textContent = 'Clear/Write';
    this.analyzerControl.domCache['label-cell-3'].textContent = 'Hold';
    this.analyzerControl.domCache['label-cell-4'].textContent = 'Max Hold';
    this.analyzerControl.domCache['label-cell-5'].textContent = 'Min Hold';
    this.analyzerControl.domCache['label-cell-6'].textContent = 'Average';
    this.analyzerControl.domCache['label-cell-7'].textContent = '';
    this.analyzerControl.domCache['label-cell-8'].textContent = '';

    this.analyzerControl.domCache['label-select-button-1']?.addEventListener('click', () => {
      this.handleTraceSelectClick_();
    });
    this.analyzerControl.domCache['label-select-button-2']?.addEventListener('click', () => {
      this.handleClearWriteClick_();
    });
    this.analyzerControl.domCache['label-select-button-3']?.addEventListener('click', () => {
      this.handleHoldClick_();
    });
    this.analyzerControl.domCache['label-select-button-4']?.addEventListener('click', () => {
      this.handleMaxHoldClick_();
    });
    this.analyzerControl.domCache['label-select-button-5']?.addEventListener('click', () => {
      this.handleMinHoldClick_();
    });
    this.analyzerControl.domCache['label-select-button-6']?.addEventListener('click', () => {
      this.handleAverageClick_();
    });
  }

  private handleTraceSelectClick_(): void {
    this.subMenuSelected = 'traceselect';

    // Update the display with current trace selection
    this.analyzerControl.specA.state.inputValue = this.analyzerControl.specA.state.selectedTrace.toString();
    this.analyzerControl.specA.state.inputUnit = 'MHz'; // Using MHz as placeholder unit

    this.analyzerControl.specA.syncDomWithState();

    this.notifyStateChange_();
    this.playSound();
  }

  private handleClearWriteClick_(): void {
    const traceIndex = this.analyzerControl.specA.state.selectedTrace - 1;
    const trace = this.analyzerControl.specA.state.traces[traceIndex];

    // Toggle visibility and set mode to clearwrite
    trace.isVisible = !trace.isVisible;
    trace.mode = 'clearwrite';
    trace.isUpdating = true;

    // Update global state if trace 1
    if (this.analyzerControl.specA.state.selectedTrace === 1) {
      this.analyzerControl.specA.state.isMaxHold = false;
      this.analyzerControl.specA.state.isMinHold = false;
    }

    Logger.info(`Trace ${this.analyzerControl.specA.state.selectedTrace}: Clear/Write mode ${trace.isVisible ? 'enabled' : 'disabled'}`);

    this.notifyStateChange_();
    this.playSound();
  }

  private handleHoldClick_(): void {
    const traceIndex = this.analyzerControl.specA.state.selectedTrace - 1;
    const trace = this.analyzerControl.specA.state.traces[traceIndex];

    // Set mode to hold and disable updating
    trace.mode = 'hold';
    trace.isUpdating = false;

    // Update global state if trace 1
    if (this.analyzerControl.specA.state.selectedTrace === 1) {
      this.analyzerControl.specA.state.isMaxHold = false;
      this.analyzerControl.specA.state.isMinHold = false;
    }

    Logger.info(`Trace ${this.analyzerControl.specA.state.selectedTrace}: Hold mode enabled`);

    this.notifyStateChange_();
    this.playSound();
  }

  private handleMaxHoldClick_(): void {
    const traceIndex = this.analyzerControl.specA.state.selectedTrace - 1;
    const trace = this.analyzerControl.specA.state.traces[traceIndex];

    // Set mode to maxhold
    trace.mode = 'maxhold';
    trace.isUpdating = true;

    // Update global state if trace 1 (for backward compatibility with existing drawing logic)
    if (this.analyzerControl.specA.state.selectedTrace === 1) {
      this.analyzerControl.specA.state.isMaxHold = true;
      this.analyzerControl.specA.state.isMinHold = false;
      this.analyzerControl.specA.resetMaxHoldData();
    }

    Logger.info(`Trace ${this.analyzerControl.specA.state.selectedTrace}: Max Hold mode enabled`);

    this.notifyStateChange_();
    this.playSound();
  }

  private handleMinHoldClick_(): void {
    const traceIndex = this.analyzerControl.specA.state.selectedTrace - 1;
    const trace = this.analyzerControl.specA.state.traces[traceIndex];

    // Set mode to minhold
    trace.mode = 'minhold';
    trace.isUpdating = true;

    // Update global state if trace 1 (for backward compatibility with existing drawing logic)
    if (this.analyzerControl.specA.state.selectedTrace === 1) {
      this.analyzerControl.specA.state.isMaxHold = false;
      this.analyzerControl.specA.state.isMinHold = true;
      this.analyzerControl.specA.resetMinHoldData();
    }

    Logger.info(`Trace ${this.analyzerControl.specA.state.selectedTrace}: Min Hold mode enabled`);

    this.notifyStateChange_();
    this.playSound();
  }

  private handleAverageClick_(): void {
    const traceIndex = this.analyzerControl.specA.state.selectedTrace - 1;
    const trace = this.analyzerControl.specA.state.traces[traceIndex];

    // Set mode to average
    trace.mode = 'average';
    trace.isUpdating = true;

    // Update global state if trace 1
    if (this.analyzerControl.specA.state.selectedTrace === 1) {
      this.analyzerControl.specA.state.isMaxHold = false;
      this.analyzerControl.specA.state.isMinHold = false;
    }

    Logger.info(`Trace ${this.analyzerControl.specA.state.selectedTrace}: Average mode enabled`);

    this.notifyStateChange_();
    this.playSound();
  }

  onMajorTickChange(value: number): void {
    if (this.subMenuSelected !== 'traceselect') {
      return;
    }

    Logger.info(`Adjusting trace selection by major tick: ${value}`);
    this.adjustTraceSelection(-value);
  }

  onMinorTickChange(value: number): void {
    if (this.subMenuSelected !== 'traceselect') {
      return;
    }

    Logger.info(`Adjusting trace selection by minor tick: ${value}`);
    this.adjustTraceSelection(-value);
  }

  private adjustTraceSelection(delta: number): void {
    const newTrace = this.analyzerControl.specA.state.selectedTrace + delta;

    // Validate trace is in range 1-3
    if (newTrace < 1 || newTrace > 3) {
      window.alert(`Error: Trace ${newTrace} does not exist. Valid traces are 1-3.`);
      this.playSound();
      return;
    }

    this.analyzerControl.specA.state.selectedTrace = newTrace;

    // Update display
    this.analyzerControl.specA.state.inputValue = this.analyzerControl.specA.state.selectedTrace.toString();
    this.analyzerControl.specA.syncDomWithState();

    Logger.info(`Selected trace: ${this.analyzerControl.specA.state.selectedTrace}`);
    this.notifyStateChange_();
  }

  onEnterPressed(): void {
    if (this.subMenuSelected !== 'traceselect') {
      return;
    }

    Logger.info(`Processing trace selection input.`);

    const analyzerState = this.analyzerControl.specA.state;
    const inputValue = parseInt(analyzerState.inputValue, 10);

    if (isNaN(inputValue)) {
      window.alert('Error: Invalid trace number. Please enter 1, 2, or 3.');
      this.playSound();
      return;
    }

    // Validate trace is in range 1-3
    if (inputValue < 1 || inputValue > 3) {
      window.alert(`Error: Trace ${inputValue} does not exist. Valid traces are 1-3.`);
      this.playSound();
      return;
    }

    this.analyzerControl.specA.state.selectedTrace = inputValue;
    Logger.info(`Selected trace: ${this.analyzerControl.specA.state.selectedTrace}`);

    this.notifyStateChange_();
    this.playSound();
  }

  /**
   * Get the current state for a specific trace (1-3)
   */
  getTraceState(traceNumber: number): { isVisible: boolean; isUpdating: boolean; mode: TraceMode } | null {
    if (traceNumber < 1 || traceNumber > 3) {
      return null;
    }
    return this.analyzerControl.specA.state.traces[traceNumber - 1];
  }

  /**
   * Get the currently selected trace number
   */
  getSelectedTrace(): number {
    return this.analyzerControl.specA.state.selectedTrace;
  }
}
