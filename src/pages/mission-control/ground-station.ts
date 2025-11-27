import { GroundStationConfig, GroundStationState } from "@app/assets/ground-station/ground-station-state";
import { html } from "@app/engine/utils/development/formatter";
import { createAntenna } from "@app/equipment/antenna/antenna-factory";
import { AntennaUIModern } from "@app/equipment/antenna/antenna-ui-modern";
import { RealTimeSpectrumAnalyzer } from "@app/equipment/real-time-spectrum-analyzer/real-time-spectrum-analyzer";
import { Receiver } from "@app/equipment/receiver/receiver";
import { RFFrontEndCore } from "@app/equipment/rf-front-end/rf-front-end-core";
import { createRFFrontEnd } from "@app/equipment/rf-front-end/rf-front-end-factory";
import { Transmitter } from "@app/equipment/transmitter/transmitter";
import { EventBus } from "@app/events/event-bus";
import { Events } from "@app/events/events";
import { v4 as uuidv4 } from 'uuid';

/**
 * Manages a collection of ground station equipment.
 * Encapsulates equipment lifecycle, wiring, and state management.
 */
export class GroundStation {
  id: string = `ground-station-${uuidv4()}`;
  containerId: string = `ground-station-container-${uuidv4()}`;
  readonly antennas: (AntennaUIModern)[] = [];
  readonly rfFrontEnds: RFFrontEndCore[] = [];
  readonly spectrumAnalyzers: RealTimeSpectrumAnalyzer[] = [];
  readonly transmitters: Transmitter[] = [];
  readonly receivers: Receiver[] = [];

  state: GroundStationState;

  constructor(config: GroundStationConfig) {
    this.state = {
      uuid: uuidv4(),
      id: config.id,
      name: config.name,
      location: config.location,
      isOperational: true,
      equipment: {}
    };

    this.createEquipment_();
    this.wireEquipment_();
    this.registerWithEventBus_();
  }

  protected html_ = html`
        <div id="${this.id}" class="sandbox-page-container">
          <div id="${this.containerId}"></div>
        </div>
      `;

  private createEquipment_(): void {
    const modernAntenna = createAntenna(this.id, 'modern') as AntennaUIModern;
    // Create one of each for now, mirroring `sandbox/equipment.ts`
    this.antennas.push(modernAntenna);
    this.rfFrontEnds.push(createRFFrontEnd(this.id));
    this.spectrumAnalyzers.push(new RealTimeSpectrumAnalyzer(this.id, this.rfFrontEnds[0], {}));
    this.transmitters.push(new Transmitter(this.id));
    this.receivers.push(new Receiver(this.id, [modernAntenna]));
  }

  private wireEquipment_(): void {
    // Wire up equipment connections as per standard configuration
    const antenna = this.antennas[0];
    const rfFrontEnd = this.rfFrontEnds[0];
    const transmitter = this.transmitters[0];
    const receiver = this.receivers[0];

    if (antenna && rfFrontEnd) {
      rfFrontEnd.connectAntenna(antenna);
    }

    if (transmitter && rfFrontEnd) {
      rfFrontEnd.connectTransmitter(transmitter);
    }

    if (receiver && rfFrontEnd) {
      receiver.connectRfFrontEnd(rfFrontEnd);
    }
  }

  private registerWithEventBus_(): void {
    const bus = EventBus.getInstance();
    bus.on(Events.UPDATE, this.update.bind(this));
    bus.on(Events.SYNC, this.syncDomWithState.bind(this));
  }

  update(): void {
    this.antennas.forEach(e => e.update());
    this.rfFrontEnds.forEach(e => e.update());
    this.spectrumAnalyzers.forEach(e => e.update());
    this.transmitters.forEach(e => e.update());
    this.receivers.forEach(e => e.update());

    this.aggregateEquipmentStates_();

    EventBus.getInstance().emit(Events.GROUND_STATION_STATE_CHANGED, this.state as Partial<GroundStationState>);
  }

  private aggregateEquipmentStates_(): void {
    this.state.equipment.antennas = this.antennas.map(e => e.state);
    this.state.equipment.rfFrontEnds = this.rfFrontEnds.map(e => e.state);
    this.state.equipment.spectrumAnalyzers = this.spectrumAnalyzers.map(e => e.state);
    this.state.equipment.transmitters = this.transmitters.map(e => e.state);
    this.state.equipment.receivers = this.receivers.map(e => e.state);
  }

  sync(data: Partial<GroundStationState>): void {
    if (data.isOperational !== undefined) {
      this.state.isOperational = data.isOperational;
    }

    if (data.equipment) {
      data.equipment.antennas?.forEach((s, i) => this.antennas[i]?.sync(s));
      data.equipment.rfFrontEnds?.forEach((s, i) => this.rfFrontEnds[i]?.sync(s));
      data.equipment.spectrumAnalyzers?.forEach((s, i) => this.spectrumAnalyzers[i]?.sync(s));
      data.equipment.transmitters?.forEach((s, i) => this.transmitters[i]?.sync(s));
      data.equipment.receivers?.forEach((s, i) => this.receivers[i]?.sync(s));
    }
  }

  syncDomWithState(): void {
    this.antennas.forEach(e => e.syncDomWithState());
    this.rfFrontEnds.forEach(e => e.syncDomWithState());
    this.spectrumAnalyzers.forEach(e => e.syncDomWithState());
    this.transmitters.forEach(e => e.syncDomWithState());
    this.receivers.forEach(e => e.syncDomWithState());
  }
}