import { RfFrequency, RfSignal, SignalOrigin } from "@app/types";

/**
 * This represents a Satellite on orbit.
 */
export class Satellite {
  norad: number;
  rxSignal: RfSignal[];
  txSignal: RfSignal[];

  constructor(norad: number, rxSignal: RfSignal[]) {
    this.norad = norad;
    this.rxSignal = rxSignal;

    this.txSignal = rxSignal.map(signal => ({
      ...signal,
      frequency: this.getFrequencyOffset(signal.frequency),
      origin: SignalOrigin.SATELLITE_TX
    }));
  }

  update(): void {
    // Update satellite state here (e.g., position, signal status)
  }

  private getFrequencyOffset(frequency: RfFrequency): RfFrequency {
    // Example offset calculation; in a real scenario, this could be more complex
    const offset = 2e9; // 2 GHz offset for demonstration

    return (frequency + offset) as RfFrequency;
  }
}