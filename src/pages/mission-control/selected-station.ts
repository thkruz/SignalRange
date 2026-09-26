import { type OrbitalObserver, observerFromLocation } from '@app/equipment/satellite/orbital-satellite';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { SimulationManager } from '@app/simulation/simulation-manager';

/**
 * Which station a pass surface predicts from.
 *
 * A LEO rises and sets on each site's own horizon, so the Pass Schedule tab and
 * the contact timeline deck must predict from the station the operator is
 * looking at, not from the satellite's canonical observer. Follows the asset
 * tree selection and falls back to the first station in the scenario, which is
 * exactly the old behaviour for every single-station campaign.
 *
 * Owners call `destroy()` when they unmount.
 */
export class SelectedStation {
  private stationId_: string | null = null;
  private readonly boundHandler_ = this.handleSelected_.bind(this);

  constructor() {
    EventBus.getInstance().on(Events.ASSET_SELECTED, this.boundHandler_);
  }

  /** Id of the station currently predicted from, or null when there is none. */
  get stationId(): string | null {
    return this.station_()?.state.id ?? null;
  }

  /** Observer for that station, or undefined when the scenario has no stations. */
  get observer(): OrbitalObserver | undefined {
    const station = this.station_();
    return station ? observerFromLocation(station.state.location, station.state.id) : undefined;
  }

  destroy(): void {
    EventBus.getInstance().off(Events.ASSET_SELECTED, this.boundHandler_);
  }

  private handleSelected_(data: { type: string; id: string }): void {
    if (data.type === 'ground-station') {
      this.stationId_ = data.id;
    }
  }

  private station_() {
    const stations = SimulationManager.getInstance().groundStations ?? [];
    return stations.find((gs) => gs.state.id === this.stationId_) ?? stations[0];
  }
}
