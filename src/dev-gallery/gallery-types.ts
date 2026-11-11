/** One named state of one immersive object. Add entries to `entries-*.ts` and list them in `gallery-registry.ts`. */
export interface GalleryEntry {
  /** URL segment: the object (`laptop`, `radio`, `clipboard`...) */
  entry: string;
  /** URL segment: the state (`desktop`, `ch1-idle`...) */
  state: string;
  title: string;
  /** Set when the object needs live singletons; the entry is listed but not mounted until checkpoint loading exists */
  needsCheckpoint?: string;
  /** Build the object and hold it fullscreen; returns the cleanup */
  mount: () => Promise<() => void> | (() => void);
}

export const galleryId = (e: Pick<GalleryEntry, 'entry' | 'state'>): string => `${e.entry}-${e.state}`;
