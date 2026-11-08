import type Draggabilly from 'draggabilly';
import { displayScale } from './display-viewport';

/** Draggabilly's pointer deltas are screen pixels; its positions/transforms are layout pixels. */
export function scaleDragging(draggie: Draggabilly, element: HTMLElement, container: HTMLElement): void {
  // Runtime animation state in Draggabilly 3, absent from its public type declarations.
  const drag = draggie as Draggabilly & { dragPoint: { x: number; y: number } };
  let start = { x: 0, y: 0 };
  let bounds = { left: 0, top: 0, right: 0, bottom: 0 };
  draggie.on('dragStart', () => {
    const scale = displayScale();
    start = { ...draggie.position };
    const rect = element.getBoundingClientRect();
    const parent = container.getBoundingClientRect();
    bounds = {
      left: (parent.left - rect.left) / scale + container.clientLeft,
      top: (parent.top - rect.top) / scale + container.clientTop,
      right: (parent.left - rect.right) / scale + container.clientLeft + container.clientWidth,
      bottom: (parent.top - rect.bottom) / scale + container.clientTop + container.clientHeight,
    };
  });
  draggie.on('dragMove', (_event, _pointer, movement) => {
    const scale = displayScale();
    if (scale === 1) return;
    const x = Math.max(bounds.left, Math.min(bounds.right, movement.x / scale));
    const y = Math.max(bounds.top, Math.min(bounds.bottom, movement.y / scale));
    draggie.position.x = start.x + x;
    draggie.position.y = start.y + y;
    drag.dragPoint.x = x;
    drag.dragPoint.y = y;
  });
}
