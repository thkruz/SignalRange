import { describe, expect, it, vi } from 'vitest';
import { FIELD_KIT, kitObjectFor, kitSheetsNav, offeredSheets } from '../../../src/pages/mission-control/tabs/field-kit';

const kit = (id: string) => FIELD_KIT.find((item) => item.id === id)!;

describe('field kit', () => {
  it('finds the object that holds a workspace page', () => {
    expect(kitObjectFor('field-power')?.id).toBe('documents');
    expect(kitObjectFor('field-path')?.id).toBe('documents');
    expect(kitObjectFor('field-handover')?.id).toBe('clipboard');
    expect(kitObjectFor('field-records')?.id).toBe('clipboard');
    expect(kitObjectFor('field-notebook')?.id).toBe('notebook');
    expect(kitObjectFor('field-service')).toBeNull();
  });

  it('offers only the pages the scenario has', () => {
    const sheets = offeredSheets(kit('clipboard'), new Set(['field-records']), (mission) => mission === 'checklist');
    expect(sheets.map((sheet) => sheet.label)).toEqual(['Cover sheet', 'Equipment log']);
    expect(offeredSheets(kit('clipboard'), new Set(['field-records']), () => false).map((sheet) => sheet.label)).toEqual(['Equipment log']);
    expect(offeredSheets(kit('documents'), new Set(), () => false)).toEqual([]);
  });

  it('lists the other pages across the top and marks the one on screen', () => {
    const open = vi.fn();
    const nav = kitSheetsNav('field-power', new Set(['field-power', 'field-path']), () => false, open)!;
    expect(nav.getAttribute('aria-label')).toBe('Documents pages');
    const buttons = [...nav.querySelectorAll<HTMLButtonElement>('button')];
    expect(buttons.map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([
      ['Wiring diagram', 'false'],
      ['Power plan', 'true'],
    ]);
    buttons[0].click();
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ tabId: 'field-path' }));
    // A single page needs no row
    expect(kitSheetsNav('field-power', new Set(['field-power']), () => false, open)).toBeUndefined();
  });
});
