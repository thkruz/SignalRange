/**
 * @file terminal-runtime-cache - One live runtime per (plant, terminal id) (Campaign 6, package G)
 * @description The SkyLink runtime used to be cached in a `WeakMap<plant, runtime>`: a single slot per plant, so a
 * second terminal on the same plant would have been handed the SkyLink runtime (its model, its actions, its
 * history). Keying by the terminal id as well keeps SkyLink and EuroSat apart. A runtime that was disposed is
 * never returned. The plant is the outer weak key, so a new plant (new scenario) starts empty.
 */
export interface CachedTerminalRuntime {
  readonly isDisposed: boolean;
}

export class TerminalRuntimeCache<T extends CachedTerminalRuntime> {
  private readonly byPlant_ = new WeakMap<object, Map<string, T>>();

  get(plant: object, terminalId: string): T | undefined {
    const runtime = this.byPlant_.get(plant)?.get(terminalId);

    return runtime && !runtime.isDisposed ? runtime : undefined;
  }

  set(plant: object, terminalId: string, runtime: T): void {
    const runtimes = this.byPlant_.get(plant) ?? new Map<string, T>();
    runtimes.set(terminalId, runtime);
    this.byPlant_.set(plant, runtimes);
  }
}
