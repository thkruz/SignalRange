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

/** A download or upload number on the application layer is what the terminal could carry, before other devices take their share */
export function capacityNote(sample: { metric: SampleMetric; layer: ServiceLayer }): string {
  return (sample.metric === 'downMbps' || sample.metric === 'upMbps') && sample.layer === 'application' ? ' (terminal-side capacity, not shared use)' : '';
}

export const METRIC_LABEL: Record<SampleMetric, string> = {
  status: 'Status',
  rttMs: 'Latency',
  downMbps: 'Download',
  upMbps: 'Upload',
  lossPct: 'Loss',
  jitterMs: 'Jitter',
};
