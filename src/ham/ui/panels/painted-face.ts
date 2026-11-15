/**
 * @file painted-face - A painted instrument faceplate with live controls placed on its painted wells
 * @description The picture is the background of a box with the picture's aspect ratio; each control is an
 * absolutely placed child whose box is a fraction of the picture (see FACE_ART in bench-art.ts), so the
 * controls stay on the painted knobs, windows and keys at any size. Text inside scales with the face
 * width (container query units). The controls themselves stay real elements with the same test ids.
 */

import { type ArtBox, type EquipmentArt } from '../bench/bench-art';
import { h } from '../ui-kit';
import './painted-face.css';

export const boxStyle = (b: ArtBox): string => `left:${(b.x * 100).toFixed(2)}%;top:${(b.y * 100).toFixed(2)}%;width:${(b.w * 100).toFixed(2)}%;height:${(b.h * 100).toFixed(2)}%`;

/** Put `el` on the painted region `b` (a fraction box) of the face */
export function place(el: HTMLElement, b: ArtBox, cls = ''): HTMLElement {
  el.classList.add('pf-slot');
  if (cls) for (const c of cls.split(' ')) el.classList.add(c);
  el.setAttribute('style', `${el.getAttribute('style') ?? ''};${boxStyle(b)}`);

  return el;
}

/** The face: `art` as the background, `slots` placed by region name */
export function paintedFace(art: EquipmentArt, name: string, slots: [string, HTMLElement, string?][]): HTMLElement {
  const face = h('div', { class: 'pface', 'data-face': name, style: `--pf-ratio:${(art.width / art.height).toFixed(4)};background-image:url("${art.src}")` });
  watchArt(face, art.src);
  for (const [region, el, cls] of slots) {
    const b = art.regions[region];
    if (!b) throw new Error(`painted-face: ${name} has no region ${region}`);
    face.append(place(el, b, cls));
  }

  return face;
}

/**
 * The face art is a CSS background, so a missing file shows no broken-image icon. Probe it anyway: when it
 * fails to load the face gets `pface-failed` (a plain chassis colour and border take the picture's place, the
 * controls stay placed and live) and the enclosing chassis drops `inst-painted` so the plain CSS chassis returns.
 */
export function watchArt(face: HTMLElement, src: string): void {
  if (typeof Image === 'undefined') return;
  const probe = new Image();
  probe.onerror = () => markFailed(face);
  probe.src = src;
}

export function markFailed(face: HTMLElement): void {
  face.classList.add('pface-failed');
  face.style.backgroundImage = 'none';
  face.closest('.inst-chassis')?.classList.remove('inst-painted');
}
