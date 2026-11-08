import type { Checkpoint, ScenariosProgressResponse } from './types';
import type { UserDataService } from './user-data-service';
import { getUserDataService } from './user-data-service';

type ProgressSource = Pick<UserDataService, 'getAllScenariosProgress' | 'checkpointExists'> & Partial<Pick<UserDataService, 'getCheckpoint'>>;
interface CacheEntry<T> {
  value?: T;
  pending?: Promise<T>;
  updatedAt: number;
}

/** Session-only menu data, shared by campaign previews and mission selection. */
export class SelectionProgressCache {
  private accountId_: string | null | undefined;
  private generation_ = 0;
  private progress_: CacheEntry<ScenariosProgressResponse | null> = { updatedAt: 0 };
  private readonly checkpoints_ = new Map<string, CacheEntry<boolean>>();
  private readonly savedCheckpoints_ = new Map<string, CacheEntry<Checkpoint | null>>();
  private readonly accountListeners_ = new Set<() => void>();

  constructor(
    private readonly source_: () => Promise<ProgressSource>,
    private readonly maxAgeMs_ = 30_000
  ) {}

  get isSignedOut(): boolean {
    return this.accountId_ === null;
  }

  setAccount(accountId: string | null): void {
    if (accountId === this.accountId_) return;
    this.accountId_ = accountId;
    this.invalidate();
    for (const listener of this.accountListeners_) listener();
  }

  onAccountChanged(listener: () => void): void {
    this.accountListeners_.add(listener);
  }

  invalidate(): void {
    ++this.generation_;
    this.progress_ = { updatedAt: 0 };
    this.checkpoints_.clear();
    this.savedCheckpoints_.clear();
  }

  getProgress(): Promise<ScenariosProgressResponse | null> {
    if (this.isSignedOut) return Promise.resolve(null);
    return this.read_(this.progress_, async () => (await this.source_()).getAllScenariosProgress());
  }

  getCheckpoint(scenarioId: string): Promise<boolean> {
    if (this.isSignedOut) return Promise.resolve(false);
    let entry = this.checkpoints_.get(scenarioId);
    if (!entry) {
      entry = { updatedAt: 0 };
      this.checkpoints_.set(scenarioId, entry);
    }
    return this.read_(entry, async () => (await this.source_()).checkpointExists(scenarioId));
  }

  async prefetch(scenarioIds: string[]): Promise<void> {
    await Promise.all([this.getProgress(), ...scenarioIds.map((id) => this.getCheckpoint(id))]);
  }

  /** Continue details and mission restoration share the same downloaded state. */
  getSavedCheckpoint(scenarioId: string): Promise<Checkpoint | null> {
    if (this.isSignedOut) return Promise.resolve(null);
    let entry = this.savedCheckpoints_.get(scenarioId);
    if (!entry) {
      entry = { updatedAt: 0 };
      this.savedCheckpoints_.set(scenarioId, entry);
    }
    return this.read_(entry, async () => {
      const source = await this.source_();
      if (!source.getCheckpoint) throw new Error('Checkpoint loading is unavailable.');
      return source.getCheckpoint(scenarioId);
    });
  }

  private read_<T>(entry: CacheEntry<T>, fetchValue: () => Promise<T>): Promise<T> {
    const refresh = (): Promise<T> => {
      if (entry.pending) return entry.pending;
      const generation = this.generation_;
      entry.pending = fetchValue()
        .then((value) => {
          if (generation !== this.generation_) throw new Error('Progress changed while loading. Please retry.');
          entry.value = value;
          entry.updatedAt = Date.now();
          return value;
        })
        .finally(() => {
          entry.pending = undefined;
        });
      return entry.pending;
    };
    if (entry.value !== undefined) {
      // Revalidation updates the cache for the next visit, never the menu being browsed.
      if (Date.now() - entry.updatedAt >= this.maxAgeMs_) void refresh().catch(() => {});
      return Promise.resolve(entry.value);
    }
    return refresh();
  }
}

export const selectionProgressCache = new SelectionProgressCache(async () => getUserDataService());
