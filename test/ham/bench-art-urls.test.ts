import fs from 'node:fs';
import path from 'node:path';
import { ART_FOR_KIND, ART_PATH, EQUIPMENT_ART } from '@app/ham/ui/bench/bench-art';
import { describe, expect, it } from 'vitest';

const benchDir = path.resolve(__dirname, '../../public', `.${ART_PATH}`);
// The webp art is gitignored (it lives in R2); a checkout without it skips the on-disk checks
const hasArt = fs.existsSync(benchDir);

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
