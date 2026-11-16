import { DraggableHtmlBox } from '@app/modal/draggable-html-box';
import { getReportForm } from './report-form-registry';

/** Dialog boxes by form id; a closed box is reopened, not rebuilt. */
const boxes_ = new Map<string, DraggableHtmlBox>();

const esc_ = (s: string): string => s.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/"/gu, '&quot;');

/** Open the dialog for a registered report form. Returns false for an unknown id. */
export function openReportForm(id: string): boolean {
  const spec = getReportForm(id);

  if (!spec) return false;

  const existing = boxes_.get(id);

  if (existing?.popupDom.isConnected) {
    existing.open();

    return true;
  }

  const box = new DraggableHtmlBox(spec.title, `report-${id}`, '', 'app-shell-page');

  boxes_.set(id, box);

  const fields = spec.fields
    .map(
      (f) => `<label class="d-block mb-2"><span class="d-block small fw-bold">${esc_(f.label)}</span>
        <input type="text" class="form-control form-control-sm font-monospace" data-field="${esc_(f.key)}" placeholder="${esc_(f.placeholder ?? '')}" autocomplete="off" />
        ${f.hint ? `<span class="d-block small text-muted">${esc_(f.hint)}</span>` : ''}</label>`
    )
    .join('');
  const lookup = spec.lookup
    ? `<hr class="my-2" /><label class="d-block mb-1"><span class="d-block small fw-bold">${esc_(spec.lookup.label)}</span>
        <input type="text" class="form-control form-control-sm font-monospace" data-lookup-input placeholder="${esc_(spec.lookup.placeholder)}" autocomplete="off" /></label>
        <div class="small font-monospace" data-lookup-out style="min-height:1.5em"></div>`
    : '';

  box.popupDom.innerHTML = `<form class="p-2" style="min-width:300px;max-width:380px" data-report-form="${esc_(id)}" novalidate>
      ${spec.intro ? `<p class="small mb-2">${esc_(spec.intro)}</p>` : ''}
      ${fields}
      <button type="submit" class="btn btn-sm btn-primary" data-report-submit>${esc_(spec.submitLabel ?? 'File report')}</button>
      <div class="small mt-2" data-report-result role="status" aria-live="polite"></div>
      ${lookup}
    </form>`;

  const form = box.popupDom.querySelector<HTMLFormElement>('form');
  const result = box.popupDom.querySelector<HTMLElement>('[data-report-result]');

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const values: Record<string, string> = {};

    for (const input of form.querySelectorAll<HTMLInputElement>('input[data-field]')) {
      values[input.dataset.field ?? ''] = input.value.trim();
    }

    const res = spec.submit(values);

    if (result) {
      result.textContent = res.message;
      result.className = `small mt-2 ${res.ok ? 'text-success' : 'text-danger'}`;
    }
  });

  const lookupInput = box.popupDom.querySelector<HTMLInputElement>('[data-lookup-input]');
  const lookupOut = box.popupDom.querySelector<HTMLElement>('[data-lookup-out]');

  lookupInput?.addEventListener('input', () => {
    if (lookupOut && spec.lookup) lookupOut.textContent = spec.lookup.run(lookupInput.value.trim());
  });

  return true;
}
