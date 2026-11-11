/**
 * Campaign 6 field objects: laptop and its apps, handheld radio, clipboard sheets, documents.
 * Everything reads from a private FieldRig (fixtures/field-rig.ts), never from the game singletons.
 */
import { type ClipboardPage, ClipboardShell } from '@app/pages/mission-control/tabs/clipboard/clipboard-shell';
import { type DocumentsPage, DocumentsShell } from '@app/pages/mission-control/tabs/documents/documents-shell';
import { FieldHandoverPanel } from '@app/pages/mission-control/tabs/field-handover-panel';
import { FieldPathDiagramPanel } from '@app/pages/mission-control/tabs/field-path-diagram-panel';
import { FieldPowerPanel } from '@app/pages/mission-control/tabs/field-power-panel';
import { FieldRecordsPanel } from '@app/pages/mission-control/tabs/field-records-panel';
import { FieldWorkloadPanel } from '@app/pages/mission-control/tabs/field-workload-panel';
import { NetProbeApp } from '@app/pages/mission-control/tabs/laptop/netprobe-app';
import { PortalApp } from '@app/pages/mission-control/tabs/laptop/portal-app';
import { FieldRadio } from '@app/pages/mission-control/tabs/radio/radio-app';
import { type LaptopApp, LaptopShell } from '@app/presentation/laptop-shell';
import { createFieldRig, type FieldRig } from './fixtures/field-rig';
import { holdObject, type ImmersiveFrame } from './gallery-hold';
import type { GalleryEntry } from './gallery-types';

const noop = (): void => {};

const div = (): HTMLElement => document.createElement('div') as unknown as HTMLElement;

const LAPTOP_APPS: LaptopApp[] = [
  { id: 'netprobe', label: 'NetProbe', icon: 'probe', open: noop },
  { id: 'browser', label: 'Browser', icon: 'browser', open: noop },
  { id: 'skylink', label: 'SkyLink', icon: 'dish', open: noop },
  { id: 'vsat', label: 'VSAT', icon: 'modem', open: noop },
  { id: 'field-workload', label: 'MissionRunner', icon: 'apps', open: noop },
];

function laptop(activeId: string, showDesktop: boolean): ImmersiveFrame {
  return (inner, leave) => {
    const shell = new LaptopShell(inner, leave, { apps: LAPTOP_APPS, activeId, showDesktop });

    return { element: shell.element, dispose: () => shell.dispose() };
  };
}

function clipboard(activeId: string): ImmersiveFrame {
  const pages: ClipboardPage[] = [
    { id: 'cover', label: 'Cover', open: noop },
    { id: 'field-handover', label: 'Handover', open: noop },
    { id: 'field-records', label: 'Records', open: noop },
  ];

  return (inner, leave) => {
    const shell = new ClipboardShell(inner, leave, { pages, activeId });

    return { element: shell.element, dispose: () => shell.dispose() };
  };
}

function documents(activeId: string): ImmersiveFrame {
  const pages: DocumentsPage[] = [
    { id: 'field-path', label: 'Wiring diagram', open: noop },
    { id: 'field-power', label: 'Power plan', open: noop },
  ];

  return (inner, leave) => {
    const shell = new DocumentsShell(inner, leave, { pages, activeId });

    return { element: shell.element, dispose: () => shell.dispose() };
  };
}

function netprobe(rig: FieldRig, run: boolean): () => void {
  const host = div();
  const app = new NetProbeApp(host, (id, layer, metric) => rig.check(id, layer, 'local-probe', undefined, metric));
  const sync = (): void => app.sync(rig.service, rig.now());
  sync();
  if (run) {
    app.selectHost('skylink', 'registration');
    app.run('ping', rig.service);
    app.run('speed', rig.service);
    rig.advance(3);
    sync();
  }
  const release = holdObject(host, 'Laptop', 'laptop', laptop('netprobe', false));

  return () => {
    release();
    app.destroy();
  };
}

function portal(rig: FieldRig, page: 'account' | 'provider'): () => void {
  const host = div();
  const app = new PortalApp(host, (id, layer) => rig.check(id, layer, 'provider-portal'));
  app.open('skylink', page);
  app.sync(rig.service, rig.now());
  const release = holdObject(host, 'Laptop', 'laptop', laptop('browser', false));

  return () => {
    release();
    app.destroy();
  };
}

function missionRunner(rig: FieldRig, run: boolean): () => void {
  const host = div();
  const panel = new FieldWorkloadPanel(
    host,
    () => rig.runner,
    () => rig.service,
    () => rig.now()
  );
  panel.sync();
  if (run) {
    panel.start('chat', 'skylink');
    panel.start('video', 'vsat');
    rig.advance(8);
    panel.sync();
  }
  const release = holdObject(host, 'Laptop', 'laptop', laptop('field-workload', false));

  return () => {
    release();
    panel.destroy();
  };
}

function radio(rig: FieldRig, calls: boolean): () => void {
  const host = div();
  const app = new FieldRadio(host, (id, layer, via, endpointId) => rig.check(id, layer, via, endpointId));
  app.modelForClick = () => rig.service;
  app.conversationsAvailable = () => false;
  app.sync(rig.service, rig.now());
  if (calls) {
    rig.check('skylink', 'registration', 'pilot-report');
    rig.advance(20);
    rig.check('skylink', 'provider', 'pilot-report');
    rig.check('skylink', 'application', 'endpoint-report', 'ops-center');
    rig.advance(5);
    app.sync(rig.service, rig.now());
  }
  const release = holdObject(host, 'Field radio', 'equipment');

  return () => {
    release();
    app.destroy();
  };
}

function handover(rig: FieldRig, filled: boolean): () => void {
  const host = div();
  const panel = new FieldHandoverPanel(host, {
    records: () => rig.records,
    evidence: () => rig.evidence,
    service: () => rig.service,
    runs: () => rig.runner.getRuns(),
    plant: () => rig.plant,
  });
  panel.selectForm('h1');
  if (filled) {
    rig.check('skylink', 'registration', 'device-indicator');
    panel.setValue('soc', 900);
  }
  panel.sync();
  const release = holdObject(host, 'Field documents', 'paper', clipboard('field-handover'));

  return () => {
    release();
    panel.destroy();
  };
}

function records(rig: FieldRig, notices: boolean): () => void {
  const host = div();
  const panel = new FieldRecordsPanel(host, { records: () => rig.records });
  if (notices) {
    rig.ledger.deliverNotice('n1', 1);
    rig.ledger.deliverNotice('n2');
  }
  panel.sync();
  const release = holdObject(host, 'Field documents', 'paper', clipboard('field-records'));

  return () => {
    release();
    panel.destroy();
  };
}

function diagram(rig: FieldRig): () => void {
  const host = div();
  const panel = new FieldPathDiagramPanel(host, { plant: () => rig.plant, evidence: () => rig.evidence });
  panel.sync();
  const release = holdObject(host, 'Field documents', 'paper', documents('field-path'));

  return () => {
    release();
    panel.destroy();
  };
}

function power(rig: FieldRig): () => void {
  const host = div();
  const panel = new FieldPowerPanel(host, () => rig.plant);
  panel.sync();

  return holdObject(host, 'Field documents', 'paper', documents('field-power'));
}

const COVER_NOTE = 'ClipboardCover reads the ObjectivesManager and ScenarioManager singletons';
const PLANT_NOTE = 'PartCloseupModal and the plant boxes read PhysicalPlantService';

export const FIELD_ENTRIES: GalleryEntry[] = [
  { entry: 'laptop', state: 'desktop', title: 'Field laptop, desktop with app icons', mount: () => holdObject(div(), 'Laptop', 'laptop', laptop('netprobe', true)) },
  { entry: 'netprobe', state: 'idle', title: 'NetProbe, nothing run yet', mount: () => netprobe(createFieldRig(), false) },
  { entry: 'netprobe', state: 'ping-result', title: 'NetProbe, ping and speed results', mount: () => netprobe(createFieldRig(), true) },
  { entry: 'portal', state: 'account', title: 'Provider portal, account page', mount: () => portal(createFieldRig(), 'account') },
  { entry: 'portal', state: 'provider', title: 'Provider portal, network status page', mount: () => portal(createFieldRig(), 'provider') },
  { entry: 'missionrunner', state: 'cards', title: 'MissionRunner, requirement cards', mount: () => missionRunner(createFieldRig(), false) },
  { entry: 'missionrunner', state: 'run', title: 'MissionRunner, two runs in progress', mount: () => missionRunner(createFieldRig(), true) },
  { entry: 'radio', state: 'ch1-idle', title: 'Handheld radio, channel 1 idle', mount: () => radio(createFieldRig(), false) },
  { entry: 'radio', state: 'call-log', title: 'Handheld radio, call log with answers', mount: () => radio(createFieldRig(), true) },
  { entry: 'clipboard', state: 'handover', title: 'Clipboard, handover form', mount: () => handover(createFieldRig(), false) },
  { entry: 'clipboard', state: 'handover-filled', title: 'Clipboard, handover form with a reading filled', mount: () => handover(createFieldRig(), true) },
  { entry: 'clipboard', state: 'records', title: 'Clipboard, equipment records', mount: () => records(createFieldRig(), false) },
  { entry: 'clipboard', state: 'records-notices', title: 'Clipboard, records with provider notices', mount: () => records(createFieldRig(), true) },
  { entry: 'documents', state: 'diagram', title: 'Documents, wiring diagram laminate', mount: () => diagram(createFieldRig()) },
  { entry: 'documents', state: 'power', title: 'Documents, power plan graph paper', mount: () => power(createFieldRig()) },
  { entry: 'clipboard', state: 'cover', title: 'Clipboard, cover sheet', needsCheckpoint: COVER_NOTE, mount: () => noop },
  { entry: 'faceplate', state: 'router-unread', title: 'Router faceplate close-up, unread notice', needsCheckpoint: PLANT_NOTE, mount: () => noop },
  { entry: 'faceplate', state: 'router-read', title: 'Router faceplate close-up, notice read', needsCheckpoint: PLANT_NOTE, mount: () => noop },
];
