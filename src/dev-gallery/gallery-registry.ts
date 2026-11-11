import { FIELD_ENTRIES } from './entries-field';
import { HAM_ENTRIES } from './entries-ham';
import { type GalleryEntry, galleryId } from './gallery-types';

/** Every gallery entry, in index order. Add a new entries-*.ts array here. */
export const GALLERY_ENTRIES: GalleryEntry[] = [...FIELD_ENTRIES, ...HAM_ENTRIES];

export function findEntry(entry: string, state: string): GalleryEntry | undefined {
  return GALLERY_ENTRIES.find((e) => e.entry === entry && e.state === state);
}

/** Ids of the entries that mount without a checkpoint (the screenshot spec visits these) */
export function mountableIds(): string[] {
  return GALLERY_ENTRIES.filter((e) => !e.needsCheckpoint).map(galleryId);
}
