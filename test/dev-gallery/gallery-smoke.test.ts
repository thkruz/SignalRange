/**
 * Dev gallery smoke test: every entry that does not need a checkpoint mounts without throwing,
 * puts an object in the DOM, and cleans up. Entries that need a checkpoint stay unmounted.
 */
import { GALLERY_ENTRIES } from '@app/dev-gallery/gallery-registry';
import { galleryId } from '@app/dev-gallery/gallery-types';
import { EventBus } from '@app/events/event-bus';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

describe('dev gallery', () => {
  const showModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
  const close = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
  beforeAll(() => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.open = true;
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.open = false;
      },
    });
  });
  afterAll(() => {
    if (showModal) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', showModal);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
    if (close) Object.defineProperty(HTMLDialogElement.prototype, 'close', close);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  });
  afterEach(() => {
    document.body.innerHTML = '';
    EventBus.destroy();
  });

  it('has unique ids', () => {
    const ids = GALLERY_ENTRIES.map(galleryId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('lists the checkpoint-only entries with a reason', () => {
    for (const e of GALLERY_ENTRIES.filter((x) => x.needsCheckpoint)) expect(e.needsCheckpoint?.length).toBeGreaterThan(10);
  });

  const mountable = GALLERY_ENTRIES.filter((e) => !e.needsCheckpoint);
  it.each(mountable.map((e) => [galleryId(e), e] as const))('mounts %s', async (_id, entry) => {
    const release = await entry.mount();
    expect(document.body.querySelector('dialog.immersive-view, .ham-station-tab')).not.toBeNull();
    release();
    expect(document.body.querySelector('dialog.immersive-view')).toBeNull();
  });
});
