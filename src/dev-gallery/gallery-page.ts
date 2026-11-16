/**
 * @file gallery-page - Dev-only `/gallery` route: each immersive object in a named state with fake data
 * @description `/gallery` lists the entries; `/gallery/<entry>/<state>` holds one fullscreen. No scenario
 * runs. The router registers the route only when NODE_ENV is development.
 */
import { findEntry, GALLERY_ENTRIES } from './gallery-registry';
import { galleryId } from './gallery-types';
import './gallery.css';

let cleanup: (() => void) | null = null;
let root: HTMLElement | null = null;

export function hideGallery(): void {
  try {
    cleanup?.();
  } finally {
    cleanup = null;
    root?.remove();
    root = null;
    document.body.classList.remove('dev-gallery');
    delete document.body.dataset.galleryReady;
  }
}

function renderIndex(): void {
  const page = document.createElement('main');
  page.className = 'gallery-index';
  page.dataset.gallery = 'index';
  const rows = GALLERY_ENTRIES.map((e) => {
    const id = galleryId(e);
    const label = e.needsCheckpoint
      ? `<span class="gallery-needs" title="${e.needsCheckpoint}">${id} (needs checkpoint)</span>`
      : `<a href="/gallery/${e.entry}/${e.state}" data-gallery-entry="${id}">${id}</a>`;

    return `<li><code>${label}</code> <span>${e.title}</span></li>`;
  }).join('');
  page.innerHTML = `<h1>Gallery</h1><p>Dev only. Each link holds one object in a named state.</p><ul>${rows}</ul>`;
  document.body.append(page);
  root = page;
}

/** Show the index, or hold the entry named by the route params. Sets `body[data-gallery-ready]` once an object is up. */
export async function showGallery(params: Record<string, string>): Promise<void> {
  hideGallery();
  document.body.classList.add('dev-gallery');
  const entry = params.entry && params.state ? findEntry(params.entry, params.state) : undefined;
  if (!entry || entry.needsCheckpoint) {
    renderIndex();

    return;
  }
  cleanup = await entry.mount();
  document.body.dataset.galleryReady = galleryId(entry);
}

/** Mount one entry outside the router (the vitest smoke test); returns the cleanup */
export async function mountEntry(entry: string, state: string): Promise<() => void> {
  const found = findEntry(entry, state);
  if (!found) throw new Error(`no gallery entry ${entry}/${state}`);

  return found.mount();
}
