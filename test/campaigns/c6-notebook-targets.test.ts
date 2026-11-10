import { frontlinePlantConfig } from '../../src/campaigns/frontline/plant-config';
import { buildNotebookTargets } from '../../src/pages/mission-control/tabs/notebook-targets';

const cfg = frontlinePlantConfig;
const labels = new Map<string, string | undefined>([
  ...cfg.parts.map((p) => [p.id, p.label] as const),
  ...cfg.connectors.map((c) => [c.id, c.label] as const),
  ...cfg.cables.map((c) => [c.id, c.label] as const),
]);
const plant = {
  getLabel: (id: string) => labels.get(id) ?? id,
  getPartIds: () => cfg.parts.map((p) => p.id),
  getConnectorIds: () => cfg.connectors.map((c) => c.id),
  getCableIds: () => cfg.cables.map((c) => c.id),
};

describe('hypothesis target picker', () => {
  const targets = buildNotebookTargets('part', { plant, services: null });

  it('never shows a raw part, connector or cable id', () => {
    for (const t of targets) {
      expect(t.label).not.toMatch(/[:]/u);
      expect(t.label).not.toBe(t.id);
    }
    expect(targets.find((t) => t.id === 'skylink-cable:dish')?.label).toBe('SkyLink cable, dish end');
    expect(targets.find((t) => t.id === 'ps:ac-out')?.label).toBe('Power station AC output');
  });

  it('lists every candidate, sorted by label so the answer does not stand out', () => {
    expect(targets).toHaveLength(cfg.parts.length + cfg.connectors.length + cfg.cables.length);
    const sorted = [...targets].sort((a, b) => a.label.localeCompare(b.label));
    expect(targets).toEqual(sorted);
  });

  it('lets a segment hypothesis name the shared local service with a readable label', () => {
    const services = {
      getServiceIds: () => ['skylink', 'vsat'],
      getPath: (id: string) => ({ label: id === 'skylink' ? 'SkyLink' : 'Camp reference VSAT' }),
    };
    const segment = buildNotebookTargets('segment', { plant, services });
    expect(segment.map((t) => t.label)).toEqual(['Camp reference VSAT', 'SkyLink', 'The shared local service']);
    expect(segment.find((t) => t.label === 'The shared local service')?.id).toBe('local-shared-service');
    expect(buildNotebookTargets('endpoint', { plant, services }).some((t) => t.id === 'local-shared-service')).toBe(false);
  });
});
