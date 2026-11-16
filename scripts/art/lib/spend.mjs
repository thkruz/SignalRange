/** Model table (prices are ESTIMATES, check https://ai.google.dev/gemini-api/docs/pricing), spend guard, ledger. */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** priceUsdPerImage: flat estimate per generated image. imageSize: sent to the API when set. */
export const MODELS = {
  'gemini-2.5-flash-image': { priceUsdPerImage: 0.039, inputUsdPerM: 0.3, outputUsdPerM: 30, imageSize: null },
  'gemini-3-pro-image': { priceUsdPerImage: 0.134, inputUsdPerM: 2, outputUsdPerM: 120, imageSize: '2K' },
};

const round6 = (x) => Math.round(x * 1e6) / 1e6;

export function modelInfo(id) {
  const m = Object.hasOwn(MODELS, id) ? MODELS[id] : undefined;
  if (!m) throw new Error(`unknown model ${id}; supported: ${Object.keys(MODELS).join(', ')}`);
  return m;
}

/** ok:false with a reason unless the estimate fits inside budget. `items` is [{ model, count }]. */
export function checkBudget({ items, budget }) {
  const estimate = round6(items.reduce((s, i) => s + i.count * modelInfo(i.model).priceUsdPerImage, 0));
  const count = items.reduce((s, i) => s + i.count, 0);
  if (count < 1) return { ok: false, estimate, reason: 'nothing to generate' };
  if (!Number.isFinite(budget) || budget <= 0) return { ok: false, estimate, reason: '--budget <usd> is required (a positive number of US dollars)' };
  if (estimate > budget + 1e-9) return { ok: false, estimate, reason: `estimate $${estimate.toFixed(3)} is over the budget $${budget.toFixed(3)}` };
  return { ok: true, estimate };
}

export function usageCostUsd(usage, model) {
  if (!usage) return null;
  const input = usage.promptTokenCount ?? 0;
  const output = usage.candidatesTokenCount ?? 0;
  if (!input && !output) return null;
  const m = modelInfo(model);
  return round6((input * m.inputUsdPerM + output * m.outputUsdPerM) / 1e6);
}

export function appendLedger(file, row) {
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify(row)}\n`, 'utf8');
}

export function readLedger(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split(/\r?\n/u)
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

export const ledgerTotalUsd = (rows) => round6(rows.reduce((s, r) => s + (r.usd ?? 0), 0));
