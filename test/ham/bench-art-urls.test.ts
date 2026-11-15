import fs from 'node:fs';
import path from 'node:path';
import { ART_FOR_KIND, ART_PATH, EQUIPMENT_ART } from '@app/ham/ui/bench/bench-art';
import { afterEach, describe, expect, it, vi } from 'vitest';

const benchDir = path.resolve(__dirname, '../../public', `.${ART_PATH}`);
// The webp art is gitignored (it lives in R2); a checkout without it skips the on-disk checks
const hasArt = fs.existsSync(benchDir);

const CDN = 'https://assets.example.test';

describe('bench art URLs on the assets host', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('every bench art src starts with PUBLIC_ASSETS_BASE_URL (production serves the art from R2)', async () => {
    vi.stubEnv('PUBLIC_ASSETS_BASE_URL', CDN);
    vi.resetModules();
    const art = await import('@app/ham/ui/bench/bench-art');
    const entries = Object.entries(art.EQUIPMENT_ART);
    expect(entries.length).toBeGreaterThan(0);
    for (const [name, picture] of entries) expect(picture.src.startsWith(CDN), name).toBe(true);
  });

  it('the transceiver face art (trx-face.webp) goes through the assets host too', async () => {
    vi.stubEnv('PUBLIC_ASSETS_BASE_URL', CDN);
    vi.resetModules();
    const { faceArtUrl } = await import('@app/ham/ui/panels/radio-front-panel');
    expect(faceArtUrl()).toBe(`${CDN}/assets/campaigns/home-sdr/bench/trx-face.webp`);
  });
});

describe('bench art URLs', () => {
  it('every art src is the art folder plus a .webp name, served under /assets', () => {
    for (const [name, art] of Object.entries(EQUIPMENT_ART)) {
      expect(art.src, name).toContain(ART_PATH);
      expect(art.src, name).toMatch(/\.webp$/u);
    }
  });

  it('every device kind with art points at a defined picture', () => {
    for (const [kind, key] of Object.entries(ART_FOR_KIND)) expect(EQUIPMENT_ART[key], kind).toBeDefined();
  });

  it.skipIf(!hasArt)('every art src resolves to a real webp in public/ (the USB SDR image included)', () => {
    for (const [name, art] of Object.entries(EQUIPMENT_ART)) {
      const file = path.join(benchDir, art.src.slice(art.src.indexOf(ART_PATH) + ART_PATH.length));
      expect(fs.existsSync(file), `${name}: ${file}`).toBe(true);
      const head = fs.readFileSync(file).subarray(0, 12);
      expect(head.subarray(0, 4).toString('latin1'), name).toBe('RIFF');
      expect(head.subarray(8, 12).toString('latin1'), name).toBe('WEBP');
    }
  });

  it('the USB SDR picture is registered and used for sdr devices', () => {
    expect(ART_FOR_KIND.sdr).toBe('sdr');
    expect(EQUIPMENT_ART.sdr.src).toContain(`${ART_PATH}sdr.webp`);
  });
});
