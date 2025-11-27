import { BaseElement } from "@app/components/base-element";
import { qs } from "@app/engine/utils/query-selector";
import { ANTENNA_CONFIG_KEYS, AntennaCore, AntennaUIBasic } from "@app/equipment/antenna";
import { AntennaUIModern } from "@app/equipment/antenna/antenna-ui-modern";
import { RFFrontEndCore } from "@app/equipment/rf-front-end/rf-front-end-core";
import { createRFFrontEnd } from "@app/equipment/rf-front-end/rf-front-end-factory";
import { EventBus } from "@app/events/event-bus";
import { Events } from "@app/events/events";
import { DialogHistoryBox } from "@app/modal/dialog-history-box";
import { DraggableHtmlBox } from "@app/modal/draggable-html-box";
import { ObjectivesManager } from "@app/objectives";
import { ScenarioManager, SimulationSettings } from "@app/scenario-manager";
import { SimulationManager } from "@app/simulation/simulation-manager";
import { html } from "../../engine/utils/development/formatter";
import { RealTimeSpectrumAnalyzer } from '../../equipment/real-time-spectrum-analyzer/real-time-spectrum-analyzer';
import { Receiver } from '../../equipment/receiver/receiver';
import { Transmitter } from '../../equipment/transmitter/transmitter';
import { SandboxPage } from "../sandbox-page";
import './equipment.css';

/**
 * StudentEquipment - Orchestrates all equipment on student page
 * Creates the layout and instantiates all equipment classes
 */
export class Equipment extends BaseElement {
  /** Debug flag for full equipment suite */
  readonly isFullEquipmentSuite: boolean = false;

  readonly spectrumAnalyzers: RealTimeSpectrumAnalyzer[] = [];
  readonly antennas: AntennaCore[] = [];
  readonly rfFrontEnds: RFFrontEndCore[] = [];
  readonly transmitters: Transmitter[] = [];
  readonly receivers: Receiver[] = [];
  private checklistRefreshIntervalId_: number | null = null;
  private lastChecklistHtml_: string | null = null;

  protected html_ = html`
    <div class="student-equipment">
      <div class="paired-equipment-container">
        <div id="antenna1-container" class="antenna-container"></div>
        <div id="specA1-container" class="spec-a-container"></div>
      </div>
      <div id="rf-front-end1-container" class="paired-equipment-container"></div>
      <div class="paired-equipment-container">
        <div id="antenna2-container" class="antenna-container"></div>
        <div id="specA2-container" class="spec-a-container"></div>
      </div>
      <div id="rf-front-end2-container" class="paired-equipment-container"></div>
      <div class="paired-equipment-container">
        <div id="tx1-container" class="tx-container"></div>
        <div id="tx2-container" class="tx-container"></div>
      </div>
      <div class="paired-equipment-container">
        <div id="tx3-container" class="tx-container"></div>
        <div id="tx4-container" class="tx-container"></div>
      </div>
      <div class="paired-equipment-container">
        <div id="rx1-container" class="rx-container"></div>
        <div id="rx2-container" class="rx-container"></div>
      </div>
      <div class="paired-equipment-container">
        <div id="rx3-container" class="rx-container"></div>
        <div id="rx4-container" class="rx-container"></div>
      </div>
    </div>
    `;

  constructor(settings: SimulationSettings) {
    super();
    this.html_ = settings.layout ? settings.layout : this.html_;
    this.init_(SandboxPage.containerId, 'replace');
    this.initEquipment_(settings);

    EventBus.getInstance().on(Events.ROUTE_CHANGED, () => {
      this.stopChecklistRefreshTimer_();
    });
  }

  protected addEventListeners_(): void {

    const missionBriefUrl = ScenarioManager.getInstance().settings.missionBriefUrl;
    if (missionBriefUrl) {
      this.addMissionBriefListener_(missionBriefUrl);
      this.addChecklistListener_();
      this.addDialogHistoryListener_();
    }
  }

  private addMissionBriefListener_(missionBriefUrl: string): void {
    qs('.mission-brief-icon').addEventListener('click', () => {
      SimulationManager.getInstance().missionBriefBox ??= new DraggableHtmlBox('Mission Brief', 'mission-brief', missionBriefUrl);
      SimulationManager.getInstance().missionBriefBox.open();
    });
  }

  private addChecklistListener_(): void {
    qs('.checklist-icon').addEventListener('click', () => {
      SimulationManager.getInstance().checklistBox ??= new DraggableHtmlBox('Checklist', 'checklist', '');
      const objectivesManager = ObjectivesManager.getInstance();
      objectivesManager.syncCollapsedStatesFromDOM();
      this.lastChecklistHtml_ = objectivesManager.generateHtmlChecklist();
      SimulationManager.getInstance().checklistBox.updateContent(this.lastChecklistHtml_);
      SimulationManager.getInstance().checklistBox.open();
      this.startChecklistRefreshTimer_(SimulationManager.getInstance().checklistBox);
    });

    EventBus.getInstance().on(Events.OBJECTIVE_ACTIVATED, () => {
      // Can't update it until they open it for the first time
      if (!SimulationManager.getInstance().checklistBox) {
        return;
      }

      const objectivesManager = ObjectivesManager.getInstance();
      this.lastChecklistHtml_ = objectivesManager.generateHtmlChecklist();
      SimulationManager.getInstance().checklistBox.updateContent(this.lastChecklistHtml_);
    });
  }

  private addDialogHistoryListener_(): void {
    qs('.dialog-icon').addEventListener('click', () => {
      SimulationManager.getInstance().dialogHistoryBox ??= new DialogHistoryBox();
      SimulationManager.getInstance().dialogHistoryBox.open();
    });
  }

  private startChecklistRefreshTimer_(draggableBox: DraggableHtmlBox): void {
    this.stopChecklistRefreshTimer_();

    const refreshChecklist = () => {
      if (!draggableBox.isOpen) {
        this.stopChecklistRefreshTimer_();
        return;
      }

      const objectivesManager = ObjectivesManager.getInstance();
      objectivesManager.syncCollapsedStatesFromDOM();
      const nextChecklistHtml = objectivesManager.generateHtmlChecklist();
      if (nextChecklistHtml !== this.lastChecklistHtml_) {
        this.lastChecklistHtml_ = nextChecklistHtml;
        draggableBox.updateContent(nextChecklistHtml);
      }
    };

    draggableBox.onClose = () => this.stopChecklistRefreshTimer_();
    this.checklistRefreshIntervalId_ = window.setInterval(refreshChecklist, 1000);
  }

  private stopChecklistRefreshTimer_(): void {
    if (this.checklistRefreshIntervalId_ !== null) {
      window.clearInterval(this.checklistRefreshIntervalId_);
      this.checklistRefreshIntervalId_ = null;
    }
    this.lastChecklistHtml_ = null;
  }

  private initEquipment_(settings: SimulationSettings): void {
    // Initialize antennas
    for (let i = 1; i <= (settings.antennas.length); i++) {
      const antennaConfigId = settings.antennas[i - 1];
      let antenna: AntennaCore;

      switch (antennaConfigId) {
        case ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK:
        case ANTENNA_CONFIG_KEYS.KU_BAND_9M_LIMIT:
          antenna = new AntennaUIModern(`antenna${i}-container`, antennaConfigId, settings.antennasState?.[i - 1]);
          break;
        default:
          antenna = new AntennaUIBasic(`antenna${i}-container`, antennaConfigId, settings.antennasState?.[i - 1]);
          break;
      }
      this.antennas.push(antenna);

      const rfFrontEnd = createRFFrontEnd(`rf-front-end${i}-container`, settings.rfFrontEnds[i - 1], 'standard');
      this.rfFrontEnds.push(rfFrontEnd);
      rfFrontEnd.connectAntenna(antenna);
      antenna.attachRfFrontEnd(rfFrontEnd);
    }

    // Initialize 4 spectrum analyzers
    // First two use antenna 1, next two use antenna 2
    for (let i = 1; i <= settings.spectrumAnalyzers.length; i++) {
      const antennaId = i <= 2 ? 1 : 2;
      const specA = new RealTimeSpectrumAnalyzer(`specA${i}-container`, settings.spectrumAnalyzers[i - 1], this.rfFrontEnds[antennaId - 1]);
      this.spectrumAnalyzers.push(specA);
    }

    // Initialize 4 transmitter cases (each with 4 modems)
    for (let i = 1; i <= settings.transmitters; i++) {
      const tx = new Transmitter(`tx${i}-container`);
      this.transmitters.push(tx);

      if (i <= 2) {
        this.rfFrontEnds[0].connectTransmitter(tx);
      } else {
        this.rfFrontEnds[1].connectTransmitter(tx);
      }
    }

    if (settings.transmitters <= 2) {
      const tx3ContainerElement = document.getElementById('tx3-container');
      if (tx3ContainerElement) {
        tx3ContainerElement.parentElement.style.display = 'none';
      }
    }
    if (settings.receivers <= 2) {
      const rx3ContainerElement = document.getElementById('rx3-container');
      if (rx3ContainerElement) {
        rx3ContainerElement.parentElement.style.display = 'none';
      }
    }

    // Add all transmitters to all antennas
    this.antennas.forEach((antenna) => {
      this.transmitters.forEach((tx) => {
        antenna.transmitters.push(tx);
      });
    });

    // Initialize receivers
    for (let i = 1; i <= settings.receivers; i++) {
      const rx = new Receiver(`rx${i}-container`, this.antennas);
      this.receivers.push(rx);

      if (i <= 2) {
        rx.connectRfFrontEnd(this.rfFrontEnds[0]);
      } else {
        rx.connectRfFrontEnd(this.rfFrontEnds[1]);
      }
    }
  }
}
