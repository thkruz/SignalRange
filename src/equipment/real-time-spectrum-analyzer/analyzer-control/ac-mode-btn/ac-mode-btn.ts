import { EventBus } from "@app/events/event-bus";
import { Events } from "@app/events/events";
import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-mode-btn.css';

export class ACModeBtn extends BaseControlButton {
  private readonly analyzerControl: AnalyzerControl;

  constructor(analyzerControl: AnalyzerControl) {
    super({
      uniqueId: `ac-mode-btn-${analyzerControl.specA.state.uuid}`,
      label: 'Mode',
      ariaLabel: 'Mode',
    });
    if (analyzerControl) {
      this.analyzerControl = analyzerControl;
    }
  }

  protected handleClick_(): void {
    this.analyzerControl.updateSubMenu('mode', this);
    this.toggleScreenMode();
  }

  toggleScreenMode(): void {
    const specA = this.analyzerControl.specA;
    const currentScreenMode = specA.state.screenMode;
    if (currentScreenMode === 'spectralDensity') {
      specA.state.screenMode = 'waterfall';
      specA.screen = specA.waterfall;
    } else if (currentScreenMode === 'waterfall') {
      specA.state.screenMode = 'both';
      specA.screen = null; // No single screen in both mode
    } else {
      specA.state.screenMode = 'spectralDensity';
      specA.screen = specA.spectralDensity;
    }

    EventBus.getInstance().emit(Events.SPEC_A_CONFIG_CHANGED, {
      uuid: specA.state.uuid,
      screenMode: specA.state.screenMode,
    });

    specA.updateScreenVisibility();
    specA.syncDomWithState();
  }
}
