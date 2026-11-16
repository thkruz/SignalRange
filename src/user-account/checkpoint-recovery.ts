import type { Checkpoint } from './types';

interface RecoveryEntry {
  checkpoint: Checkpoint;
  pending: boolean;
}
const key = (account: string, mission: string): string => `signalrange.checkpoint.v1:${encodeURIComponent(account)}:${encodeURIComponent(mission)}`;

/** Account-scoped recovery copies. Never store credentials or create guest progress. */
export const checkpointRecovery = {
  read(account: string | null | undefined, mission: string): RecoveryEntry | null {
    if (!account) return null;
    try {
      const entry = JSON.parse(localStorage.getItem(key(account, mission)) ?? 'null') as RecoveryEntry | null;
      if (
        !entry ||
        entry.checkpoint?.userId !== account ||
        entry.checkpoint.scenarioId !== mission ||
        !entry.checkpoint.state ||
        !Number.isFinite(Date.parse(entry.checkpoint.savedAt))
      )
        return null;
      return entry;
    } catch {
      return null;
    }
  },
  write(checkpoint: Checkpoint, pending = true): boolean {
    try {
      const existing = this.read(checkpoint.userId, checkpoint.scenarioId);
      if (existing && Date.parse(existing.checkpoint.savedAt) > Date.parse(checkpoint.savedAt)) return true;
      localStorage.setItem(key(checkpoint.userId, checkpoint.scenarioId), JSON.stringify({ checkpoint, pending }));
      return true;
    } catch {
      return false;
    }
  },
  acknowledge(checkpoint: Checkpoint): void {
    const current = this.read(checkpoint.userId, checkpoint.scenarioId);
    if (current?.checkpoint.savedAt === checkpoint.savedAt) this.write(current.checkpoint, false);
  },
  clear(account: string | null | undefined, mission: string): void {
    if (!account) return;
    try {
      localStorage.removeItem(key(account, mission));
    } catch {
      /* Storage may be unavailable. */
    }
  },
  clearAccount(account: string | null | undefined): void {
    if (!account) return;
    try {
      const prefixes = [`signalrange.checkpoint.v1:${encodeURIComponent(account)}:`, `signalrange.records.v1:${encodeURIComponent(account)}:`];
      const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index));
      for (const item of keys) if (item && prefixes.some((prefix) => item.startsWith(prefix))) localStorage.removeItem(item);
    } catch {
      /* Storage may be unavailable. */
    }
  },
  newer(local: Checkpoint | undefined, remote: Checkpoint | null): Checkpoint | null {
    return local && (!remote || Date.parse(local.savedAt) >= Date.parse(remote.savedAt)) ? local : remote;
  },
};
