import { generateUuid } from "@app/engine/utils/uuid";
import { ANTENNA_CONFIG_KEYS, AntennaCore } from "@app/equipment/antenna";
import { AntennaUIHeadless } from "@app/equipment/antenna/antenna-ui-headless";
import { RealTimeSpectrumAnalyzer } from "@app/equipment/real-time-spectrum-analyzer/real-time-spectrum-analyzer";
import { Receiver } from "@app/equipment/receiver/receiver";
import { RFFrontEndCore } from "@app/equipment/rf-front-end/rf-front-end-core";
import { createRFFrontEnd } from "@app/equipment/rf-front-end/rf-front-end-factory";
import { Transmitter } from "@app/equipment/transmitter/transmitter";
import { EventBus } from "@app/events/event-bus";
import { EventMap, Events } from "@app/events/events";
import { Logger } from "@app/logging/logger";
import { SimulationManager } from "@app/simulation/simulation-manager";
import type { GroundStationConfig, GroundStationState } from "./ground-station-state";

/**
 * GroundStation - Manages a complete ground station with all equipment
 *
 * Encapsulates antennas, RF front-ends, spectrum analyzers, transmitters, and receivers
 * Handles equipment lifecycle, wiring, and state aggregation
 */
export class GroundStation {
  readonly uuid: string;
  state: GroundStationState;

  // Equipment collections (same pattern as Equipment class)
  readonly antennas: AntennaCore[] = [];
  readonly rfFrontEnds: RFFrontEndCore[] = [];
  readonly spectrumAnalyzers: RealTimeSpectrumAnalyzer[] = [];
  readonly transmitters: Transmitter[] = [];
  readonly receivers: Receiver[] = [];

  private readonly config_: GroundStationConfig;
  lastStateString: string = '{}';

  constructor(config: GroundStationConfig) {
    this.uuid = generateUuid();
    this.config_ = config;

    // Initialize state
    this.state = {
      uuid: this.uuid,
      id: config.id,
      name: config.name,
      location: config.location,
      isOperational: config.isOperational ?? true,
      equipment: {
        antennas: [],
        rfFrontEnds: [],
        spectrumAnalyzers: [],
        transmitters: [],
        receivers: []
      }
    };

    // NOTE: Equipment creation deferred until UI containers are ready
    // Will be called by initializeEquipment() when tabs are created in Phase 4+

    // Register with EventBus for UPDATE cycle
    EventBus.getInstance().on(Events.UPDATE, this.update.bind(this));

    SimulationManager.getInstance().groundStations.push(this);

    Logger.info(`GroundStation created: ${config.name} (${config.id}) - equipment deferred`);
  }

  /**
   * Initialize equipment - creates instances and wires connections
   * Called by UI layer (tabs) once DOM containers are ready
   * @public for Phase 4+ tab integration
   */
  public initializeEquipment(): void {
    if (this.antennas.length > 0) {
      Logger.warn('Equipment already initialized, skipping');
      return;
    }

    this.createEquipment_();
    this.wireEquipment_();
    Logger.info('Equipment initialized and wired');
  }

  /**
   * Create all equipment instances using existing factories
   * @private - called by initializeEquipment()
   */
  private createEquipment_(): void {
    const config = this.config_;

    // Create antennas (headless mode for mission control)
    config.antennas.forEach((antennaConfigId, index) => {
      const initialState = config.antennasState?.[index] ?? {};
      const antenna = new AntennaUIHeadless(
        `gs-${this.uuid}-antenna${index + 1}-headless`,
        antennaConfigId as ANTENNA_CONFIG_KEYS,
        initialState,
        config.teamId || 1
      );

      this.antennas.push(antenna);
    });

    // Create RF front-ends
    config.rfFrontEnds.forEach((rfConfig, index) => {
      const rfFrontEnd = createRFFrontEnd(
        `gs-${this.uuid}-rf-front-end${index + 1}-container`,
        rfConfig,
        'standard',
      );
      this.rfFrontEnds.push(rfFrontEnd);
    });

    // Create spectrum analyzers (if configured)
    const spectrumAnalyzers = config.spectrumAnalyzers || [null, null, null, null];
    spectrumAnalyzers.forEach((specConfig, index) => {
      const antennaId = index < 2 ? 0 : 1;  // First two use antenna 1, next two use antenna 2
      const rfFrontEnd = this.rfFrontEnds[antennaId];

      if (rfFrontEnd) {
        const specA = new RealTimeSpectrumAnalyzer(
          `gs-${this.uuid}-specA${index + 1}-container`,
          rfFrontEnd,
          specConfig || {},
          config.teamId || 1
        );
        this.spectrumAnalyzers.push(specA);
      }
    });

    // Create transmitters
    const transmitterCount = config.transmitters || 4;
    for (let i = 1; i <= transmitterCount; i++) {
      const tx = new Transmitter(`gs-${this.uuid}-tx${i}-container`, config.teamId || 1);
      this.transmitters.push(tx);
    }

    // Create receivers
    const receiverCount = config.receivers || 4;
    for (let i = 1; i <= receiverCount; i++) {
      const rx = new Receiver(
        `gs-${this.uuid}-rx${i}-container`,
        this.antennas,
        config.teamId || 1
      );
      this.receivers.push(rx);
    }

    Logger.info(`Equipment created: ${this.antennas.length} antennas, ${this.rfFrontEnds.length} RF front-ends, ${this.spectrumAnalyzers.length} spectrum analyzers, ${this.transmitters.length} transmitters, ${this.receivers.length} receivers`);
  }

  /**
   * Wire equipment connections (antenna ↔ RF front-end, transmitter → RF front-end, etc.)
   */
  private wireEquipment_(): void {
    // Wire antenna ↔ RF front-end
    this.antennas.forEach((antenna, index) => {
      const rfFrontEnd = this.rfFrontEnds[index];
      if (rfFrontEnd) {
        rfFrontEnd.connectAntenna(antenna);
        antenna.attachRfFrontEnd(rfFrontEnd);
      }
    });

    // Wire transmitters to RF front-ends
    this.transmitters.forEach((tx, index) => {
      const rfIndex = index < 2 ? 0 : 1;  // First two use RF 1, next two use RF 2
      this.rfFrontEnds[rfIndex]?.connectTransmitter(tx);
    });

    // Add all transmitters to all antennas
    this.antennas.forEach((antenna) => {
      this.transmitters.forEach((tx) => {
        antenna.transmitters.push(tx);
      });
    });

    // Wire receivers to RF front-ends
    this.receivers.forEach((rx, index) => {
      const rfIndex = index < 2 ? 0 : 1;  // First two use RF 1, next two use RF 2
      rx.connectRfFrontEnd(this.rfFrontEnds[rfIndex]);
    });

    Logger.info('Equipment wiring complete');
  }

  /**
   * Update ground station state (called on Events.UPDATE)
   * Aggregates equipment states and emits GROUND_STATION_STATE_CHANGED
   */
  update(): void {
    // Equipment updates happen automatically via their own EventBus subscriptions

    // Aggregate equipment states
    this.state.equipment.antennas = this.antennas.map(a => a.state);
    this.state.equipment.rfFrontEnds = this.rfFrontEnds.map(rf => rf.state);
    this.state.equipment.spectrumAnalyzers = this.spectrumAnalyzers.map(s => s.state);
    this.state.equipment.transmitters = this.transmitters.map(t => t.state);
    this.state.equipment.receivers = this.receivers.map(r => r.state);

    // Emit ground station state changed
    if (JSON.stringify(this.state) !== this.lastStateString) {
      // Changes every update due to random noise and current

      // this.emit(Events.GROUND_STATION_STATE_CHANGED, this.state);
      this.lastStateString = JSON.stringify(this.state);
    }
  }

  /**
   * Sync ground station state from external source (called on Events.SYNC)
   * Distributes state to individual equipment modules
   */
  sync(data: Partial<GroundStationState>): void {
    if (data.uuid !== this.uuid) {
      return;
    }

    this.state = { ...this.state, ...data };

    // Sync individual equipment
    if (data.equipment?.antennas) {
      data.equipment.antennas.forEach((antennaState, i) => {
        this.antennas[i]?.sync(antennaState);
      });
    }

    if (data.equipment?.rfFrontEnds) {
      data.equipment.rfFrontEnds.forEach((rfState, i) => {
        this.rfFrontEnds[i]?.sync(rfState);
      });
    }

    if (data.equipment?.spectrumAnalyzers) {
      data.equipment.spectrumAnalyzers.forEach((specState, i) => {
        this.spectrumAnalyzers[i]?.sync(specState);
      });
    }

    if (data.equipment?.transmitters) {
      data.equipment.transmitters.forEach((txState, i) => {
        this.transmitters[i]?.sync(txState);
      });
    }

    if (data.equipment?.receivers) {
      data.equipment.receivers.forEach((rxState, i) => {
        this.receivers[i]?.sync(rxState);
      });
    }
  }

  /**
   * Helper to emit equipment events
   */
  emit<T extends Events>(event: T, ...args: EventMap[T]): void {
    EventBus.getInstance().emit(event, ...args);
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    // Clean up EventBus listeners
    EventBus.getInstance().off(Events.UPDATE, this.update.bind(this));

    // Equipment cleanup handled by their own destroy methods
    Logger.info(`GroundStation destroyed: ${this.config_.name} (${this.config_.id})`);
  }
}
