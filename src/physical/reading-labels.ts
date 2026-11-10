import type { SampleMetric, SampleProvenance, ServiceLayer } from '@app/physical/service-types';

/** Player-facing names for service readings, shared by the Service checks table and the notebook lines */
export const PROVENANCE_LABEL: Record<SampleProvenance, string> = {
  'device-indicator': 'Device light',
  'local-probe': 'Local probe',
  'terminal-app': 'Terminal app',
  'provider-portal': 'Provider portal',
  'pilot-report': 'Pilot report',
  'endpoint-report': 'Endpoint report',
  'workload-run': 'Workload run',
};

export const LAYER_LABEL: Record<ServiceLayer, string> = {
  power: 'Power',
  local: 'Local network',
  registration: 'Terminal link',
  account: 'Account',
  provider: 'Provider',
  application: 'Application',
};

export const METRIC_LABEL: Record<SampleMetric, string> = {
  status: 'Status',
  rttMs: 'Latency',
  downMbps: 'Download',
  upMbps: 'Upload',
  lossPct: 'Loss',
  jitterMs: 'Jitter',
};
