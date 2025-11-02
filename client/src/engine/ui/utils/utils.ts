/**
 * Safely escape HTML to prevent XSS
 */
export const escapeHtml = (str: string): string => {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
};

export const getFreqBandInfo = (band: string): { minFreq: number; maxFreq: number } => {
  const freqBands: Record<string, { minFreq: number; maxFreq: number }> = {
    hf: { minFreq: 3e6, maxFreq: 30e6 },
    vhf: { minFreq: 30e6, maxFreq: 300e6 },
    uhf: { minFreq: 300e6, maxFreq: 3e9 },
    l: { minFreq: 1e9, maxFreq: 2e9 },
    s: { minFreq: 2e9, maxFreq: 4e9 },
    c: { minFreq: 4e9, maxFreq: 8e9 },
    x: { minFreq: 8e9, maxFreq: 12e9 },
    ku: { minFreq: 12e9, maxFreq: 18e9 },
    k: { minFreq: 18e9, maxFreq: 27e9 },
    ka: { minFreq: 27e9, maxFreq: 40e9 },
  };

  if (!freqBands[band]) {
    throw new Error(`Invalid frequency band: ${band}`);
  }

  return freqBands[band];
};