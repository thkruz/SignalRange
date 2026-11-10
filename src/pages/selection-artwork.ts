/** Frame existing artwork without changing menu geometry between selections. */
export function selectionArtworkPosition(imageUrl: string): string {
  const positions: Record<string, string> = {
    'signal-hunter/2/card.png': '50% 0%', // Milky Way above the station.
    'signal-hunter/4/card.png': '50% 10%', // Lightning above the mountain ridge.
  };
  if (positions[imageUrl]) {
    return positions[imageUrl];
  }
  if (imageUrl.startsWith('home-sdr/')) {
    return '50% 55%';
  }
  // Frontline forward site (S9-S16): show more of the equipment along the bottom of the painting
  if (/^frontline\/physical\/(site|card)-forward/u.test(imageUrl)) {
    return '50% 65%';
  }
  return '50% 30%';
}
