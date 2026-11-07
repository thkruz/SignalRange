/** Frame existing artwork without changing menu geometry between selections. */
export function selectionArtworkPosition(imageUrl: string): string {
  const positions: Record<string, string> = {
    'signal-hunter/2/card.png': '50% 0%', // Milky Way above the station.
    'signal-hunter/4/card.png': '50% 10%', // Lightning above the mountain ridge.
  };
  return positions[imageUrl] ?? (imageUrl.startsWith('home-sdr/') ? '50% 55%' : '50% 30%');
}
