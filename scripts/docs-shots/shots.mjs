// Shot list for the docs screenshot runner (run.mjs).
//
// TARGETS: one fresh page load per target (scenario or sandbox URL). Shots for a target run in
// file order on the same page, so earlier shots may leave state (a tracked satellite, an open tab)
// that later shots rely on. `setup` on a target runs once after load.
//
// A shot:
//   id        unique, prefix groups (mc-, eq-, sys-, plug-)
//   group     output folder under public/images/shots/ (mission-control | equipment | systems | plugins)
//   slug      docs slug (see art-review/docs-refresh/wp1-wp2-result.md); output file is <slug>[-<variant>].webp
//   variant   optional suffix when a slug has several shots
//   alt       alt text draft
//   target    key into TARGETS
//   asset     optional asset-tree id to select first (ground station or satellite)
//   tab       optional tab id to open first
//   setup     optional steps: {click|domClick|hover|select+value|fill+value|eval|advance(ms)|waitFor|macro+args|wait}
//   expand    optional {top,bottom} px: with selector, crop a full-width band around the element
//   selector  optional Playwright selector; crops to that element, else the full 1440x900 viewport
//   settle    ms to wait before capture (default 1500)
import path from 'node:path';

export const VIEWPORT = { width: 1440, height: 900 };
export const OUT_DIR = path.resolve(import.meta.dirname, '../../../signal-range-docs/public/images/shots');

export const TARGETS = {
  eu: { path: '/campaigns/nats-eu/scenarios/nats-eu-sandbox' },
  ham: { path: '/campaigns/ham-sdr/scenarios/ham-sdr-sandbox' },
  hunter: { path: '/campaigns/signal-hunter/scenarios/signal-hunter-sandbox' },
  ea: { path: '/campaigns/ccs/scenarios/ccs-scenario2' },
  tlm: { path: '/campaigns/ccs/scenarios/ccs-scenario3' },
  plant: { path: '/campaigns/frontline/scenarios/frontline-sandbox' },
  field: { path: '/campaigns/frontline/scenarios/frontline-scenario7' },
  rw: { path: '/campaigns/range-watch/scenarios/starlink-interference' },
  geo: { path: '/campaigns/range-watch/scenarios/geo-belt-survey' },
  // Campaign mission mid-shift: brief closed and the first quiz answered so the clock runs.
  eus1: { path: '/campaigns/nats-eu/scenarios/nats-eu-scenario1', setup: [{ macro: 'startScenario1' }] },
  // Sandbox tracking MERIDIAN-SAR-1 in pass (modem 1 locked, carrier on the spectrum analyzer).
  eurx: { path: '/campaigns/nats-eu/scenarios/nats-eu-sandbox', asset: 'GW-01', setup: [{ tab: 'acu-control-0' }, { macro: 'trackSat', args: ['61701'] }, { advSteps: [240000, 40000] }, { wait: 2000 }] },
  // Sandbox: SAR-2 pass at T+17..26 min overlaps the gw-rain fade that starts at T+25 min.
  eulb: {
    path: '/campaigns/nats-eu/scenarios/nats-eu-sandbox',
    asset: 'GW-01',
    setup: [
      { advance: 1000000 }, { wait: 1500 },
      { tab: 'acu-control-0' }, { macro: 'trackSat', args: ['61702'] },
      { tab: 'rx-analysis' }, { fill: '#frequency-input', value: 1370 }, { domClick: '#apply-btn' }, { wait: 500 },
      { tab: 'link-budget' },
      { fill: '#lb-eirp', value: 31.3 }, { fill: '#lb-fspl', value: 169.1 }, { fill: '#lb-rxgain', value: 50.4 },
      { fill: '#lb-noisetemp', value: 125 }, { fill: '#lb-bandwidth', value: 36 }, { fill: '#lb-miscloss', value: 1 },
      { domClick: '#lb-compute' }, { wait: 500 },
      { advSteps: [560000, 40000] },
    ],
  },
  eusec: { path: '/campaigns/nats-eu/scenarios/nats-eu-sandbox', asset: 'GW-01' },
  eugps: { path: '/campaigns/nats-eu/scenarios/nats-eu-sandbox', asset: 'GW-01' },
};

const card = (title) => `xpath=(//*[contains(@class,"card-title") and normalize-space(.)="${title}"])[1]/ancestor::div[contains(concat(" ",normalize-space(@class)," ")," card ")][1]`;
const track = [
  { macro: 'trackSat', args: ['61701'] },
  { advance: 90000 },
  { wait: 1500 },
];

export const shots = [
  // ---- nats-eu sandbox, Galway ground station
  { id: 'mc-mission-overview', group: 'mission-control', slug: 'mission-overview', target: 'eu', tab: 'mission-overview', alt: 'Mission Overview tab with the scenario summary and station list.' },
  { id: 'mc-shell', group: 'mission-control', slug: 'shell', target: 'eu', asset: 'GW-01', tab: 'dashboard', alt: 'Mission Control shell: global command bar, asset tree, tab bar and timeline deck.' },
  { id: 'mc-shell-asset-tree', group: 'mission-control', slug: 'shell', variant: 'asset-tree', target: 'eu', selector: '#asset-tree-sidebar-container', alt: 'Asset tree listing ground stations and satellites.' },
  { id: 'mc-shell-alarms', group: 'mission-control', slug: 'shell', variant: 'alarms', target: 'eu', setup: [{ domClick: '#alarm-summary' }, { wait: 500 }], selector: '#mission-alarm-panel', alt: 'Active alarms panel opened from the command bar.' },
  { id: 'mc-dashboard', group: 'mission-control', slug: 'dashboard', target: 'eu', asset: 'GW-01', tab: 'dashboard', setup: [{ domClick: '#mission-alarm-close' }], alt: 'Dashboard tab with station information, equipment summary and chain status cards.' },
  { id: 'mc-acu-control', group: 'mission-control', slug: 'acu-control', target: 'eu', tab: 'acu-control-0', setup: track, alt: 'ACU Control tab tracking a satellite in program-track mode with the polar plot.' },
  { id: 'eq-acu-polar', tab: 'acu-control-0', group: 'equipment', slug: 'antenna-control-unit', target: 'eu', selector: '[id$="polar-plot-container"]', alt: 'Antenna control unit polar plot showing the pedestal on target.' },
  { id: 'mc-rx-analysis', group: 'mission-control', slug: 'rx-analysis', target: 'eurx', tab: 'rx-analysis', setup: [{ domClick: '#sa-auto-tune' }, { wait: 3000 }], alt: 'RX Analysis tab with a carrier on the spectrum analyzer and the receive chain controls.' },
  { id: 'eq-rtsa', tab: 'rx-analysis', group: 'equipment', slug: 'real-time-spectrum-analyzer', target: 'eurx', setup: [{ domClick: '#sa-auto-tune' }, { wait: 3000 }, { domClick: '#sa-peak-search' }, { wait: 1500 }], union: [card('Spectrum Analyzer'), card('Spectrum Analyzer Controls')], settle: 800, alt: 'Spectrum analyzer showing the received carrier above the noise floor with a peak marker, next to the Spectrum Analyzer Controls card.' },
  { id: 'eq-lnb', tab: 'rx-analysis', group: 'equipment', slug: 'low-noise-block-downconverter', target: 'eurx', selector: card('LNB (Low Noise Block)'), alt: 'LNB module with local oscillator, gain and lock status.' },
  { id: 'eq-agc', tab: 'rx-analysis', group: 'equipment', slug: 'automatic-gain-control', target: 'eurx', selector: card('AGC'), alt: 'AGC module showing input and output power.' },
  { id: 'eq-if-filter', tab: 'rx-analysis', group: 'equipment', slug: 'if-filter-bank', target: 'eurx', selector: card('IF Filter'), alt: 'IF filter bank with bandwidth and insertion loss.' },
  { id: 'eq-notch', tab: 'rx-analysis', group: 'equipment', slug: 'notch-filter', target: 'eurx', selector: card('Notch Filter'), alt: 'Notch filter with three notch stages.' },
  { id: 'eq-coupler', tab: 'rx-analysis', group: 'equipment', slug: 'coupler', target: 'eurx', selector: card('Tap Points'), alt: 'Tap points card where signals are sampled along the receive chain.' },
  { id: 'mc-tx-chain', group: 'mission-control', slug: 'tx-chain', target: 'eu', tab: 'tx-chain', alt: 'TX Chain tab with BUC, HPA and transmitter modems.' },
  { id: 'eq-buc', asset: 'GW-01', tab: 'tx-chain', group: 'equipment', slug: 'block-upconverter', target: 'eu', selector: card('BUC (Block Up Converter)'), alt: 'BUC module with LO, gain, output power and temperature.' },
  { id: 'eq-hpa', asset: 'GW-01', tab: 'tx-chain', group: 'equipment', slug: 'high-power-amplifier', target: 'eu', selector: card('HPA (High Power Amplifier)'), alt: 'HPA module with back-off and output power meter.' },
  { id: 'eq-transmitter', asset: 'GW-01', tab: 'tx-chain', group: 'equipment', slug: 'transmitter', target: 'eu', selector: card('Transmitter Modems'), alt: 'Transmitter modem bank.' },
  { id: 'mc-gps-timing', group: 'mission-control', slug: 'gps-timing', target: 'eu', tab: 'gps-timing', alt: 'GPS Timing tab with lock, GNSS constellation and holdover cards.' },
  { id: 'eq-gpsdo', tab: 'gps-timing', group: 'equipment', slug: 'gps-disciplined-oscillator', target: 'eu', selector: card('Lock & Power Status'), alt: 'GPSDO lock and power status card.' },
  { id: 'mc-pass-schedule', group: 'mission-control', slug: 'pass-schedule', target: 'eu', tab: 'pass-schedule', alt: 'Pass Schedule tab listing upcoming passes.' },
  { id: 'mc-link-budget', group: 'mission-control', slug: 'link-budget', target: 'eu', tab: 'link-budget', alt: 'Link Analysis worksheet tab.' },
  { id: 'mc-commanding', group: 'mission-control', slug: 'commanding', target: 'eu', tab: 'commanding', alt: 'TT&C commanding tab.' },
  { id: 'mc-contact-schedule', group: 'mission-control', slug: 'contact-schedule', target: 'eu', tab: 'contact-schedule', alt: 'Contact Plan tab.' },
  { id: 'mc-security-console', group: 'mission-control', slug: 'security-console', target: 'eu', tab: 'security-console', alt: 'Security console tab.' },
  { id: 'mc-sat-dashboard', group: 'mission-control', slug: 'satellite-dashboard', target: 'eu', asset: 'sat-61701', tab: 'sat-dashboard', alt: 'Satellite Dashboard tab.' },
  { id: 'mc-ground-track', group: 'mission-control', slug: 'ground-track', target: 'eu', tab: 'ground-track', settle: 4000, alt: 'Ground Track tab with the satellite sub-point and footprint.' },

  // ---- nats-eu scenario 1 (running campaign mission): command bar, timeline, time skip
  { id: 'mc-shell-command-bar', group: 'mission-control', slug: 'shell', variant: 'command-bar', target: 'eus1', setup: [{ eval: "document.querySelectorAll('.pending-quiz-indicator').forEach((e) => { e.style.display = 'none'; })" }], selector: 'header.app-shell-header', expand: { bottom: 130 }, alt: 'Global command bar mid-shift: scenario line, mission clock, Pause, Skip to AOS with countdown, alarm summary and the objective and mission timers.' },
  { id: 'mc-shell-timeline', group: 'mission-control', slug: 'shell', variant: 'timeline', target: 'eus1', setup: [{ domClick: 'footer.app-shell-timeline >> text=6H' }, { wait: 2500 }], selector: 'footer.app-shell-timeline', expand: { top: 170 }, alt: 'Contact Timeline on the 6 hour view with pass blocks and the playhead.' },
  { id: 'sys-clock', group: 'systems', slug: 'scenario-clock-and-time-skip', target: 'eus1', selector: 'header.app-shell-header', expand: { bottom: 130 }, setup: [{ eval: "document.querySelectorAll('.pending-quiz-indicator').forEach((e) => { e.style.display = 'none'; })" }], alt: 'Command bar with the mission clock, Pause and an enabled Skip to AOS control showing the time to the next pass.' },
  { id: 'mc-shell-time-skip', group: 'mission-control', slug: 'shell', variant: 'time-skip', target: 'eus1', setup: [{ domClick: '#time-skip-control' }, { wait: 800 }], selector: '#time-skip-modal-container .time-skip-modal-content', alt: 'Skip Ahead window with the next contact, the target time and the Cancel and Skip Ahead buttons.' },

  // ---- nats-eu sandbox, tracking a satellite in pass
  { id: 'eq-receiver', tab: 'rx-analysis', group: 'equipment', slug: 'receiver', target: 'eurx', selector: card('Receiver Modems'), alt: 'Receiver Modems card with modem 1 locked on the downlink: configuration, Signal Quality Good, Es/N0 and ADC readouts.' },
  { id: 'eq-omt', tab: 'acu-control-0', group: 'equipment', slug: 'orthomode-transducer', target: 'eurx', selector: card('OMT / Duplexer'), alt: 'OMT / Duplexer card with TX and RX polarization, cross-pol isolation and status.' },

  // ---- nats-eu sandbox, fresh pages for the systems shots
  { id: 'sys-link-budget', group: 'systems', slug: 'link-budget', target: 'eulb', tab: 'link-budget', settle: 1500, selector: '.link-budget-tab', alt: 'Link Analysis tab with the computed predicted C/N in family and the measured half showing a reduced live margin while rain fade is active.' },
  {
    id: 'sys-transec', group: 'systems', slug: 'transec-and-security', target: 'eusec', tab: 'security-console',
    setup: [{ domClick: '#sec-audit-body button[data-event-id]' }, { wait: 400 }, { select: '#sec-transec-mode', value: 'hopping' }, { wait: 400 }, { domClick: '#sec-transec-load-key' }, { wait: 2500 }],
    selector: '.security-console-tab', alt: 'Security console with a flagged audit entry, the accounts card and the TRANSEC card with a hop-set key loaded in hopping mode.',
  },
  {
    id: 'sys-timing', group: 'systems', slug: 'timing-and-gpsdo', target: 'eugps', tab: 'gps-timing',
    setup: [{ domClick: '#gpsdo-gnss-switch' }, { wait: 20000 }],
    selector: '.gps-timing-tab', alt: 'GPS Timing tab with the GNSS switch down: holdover active, no satellites tracked, holdover duration and error counting.',
  },

  // ---- ham-sdr sandbox
  { id: 'mc-sdr-console', group: 'mission-control', slug: 'sdr-console', target: 'ham', asset: 'BKYD-QFH', tab: 'sdr-console', settle: 3000, alt: 'SDR Console tab with the waterfall.' },

  // ---- signal-hunter sandbox
  { id: 'mc-geolocation', group: 'mission-control', slug: 'geolocation', target: 'hunter', asset: 'PA-22', tab: 'geolocation', settle: 3000, alt: 'Geolocation console.' },

  // ---- CCS electronic attack scenario
  { id: 'mc-ea-assessment', group: 'mission-control', slug: 'ea-assessment', target: 'ea', asset: 'SS-01', tab: 'ea-assessment', alt: 'EA Assessment tab.' },
  { id: 'sys-interference', group: 'systems', slug: 'interference-and-ea', target: 'ea', asset: 'SS-01', tab: 'ea-assessment', alt: 'EA assessment view of an interference event.' },

  // ---- telemetry scenario
  { id: 'mc-telemetry', group: 'mission-control', slug: 'telemetry', target: 'tlm', asset: 'SS-01', tab: 'telemetry', alt: 'Telemetry tab.' },

  // ---- crypto scenario
  { id: 'eq-crypto', group: 'equipment', slug: 'crypto-unit', target: 'eu', asset: 'GW-01', tab: 'tx-chain', selector: card('TX Payload Data'), alt: 'TX payload data card with the crypto unit status.' },

  // ---- frontline sandbox (physical site, SkyLink terminal)
  { id: 'mc-site', group: 'mission-control', slug: 'site', target: 'plant', asset: 'FL-01', tab: 'site', alt: 'Site tab for the field station.' },
  { id: 'mc-tent-control', group: 'mission-control', slug: 'tent-control', target: 'plant', asset: 'FL-01', tab: 'site', selector: '.canvas-header', expand: { bottom: 75 }, alt: 'The tent control in the tab header, right of the tabs.' },
  { id: 'plug-skylink', group: 'plugins', slug: 'skylink-terminal', target: 'plant', tab: 'station-skylink-app', settle: 3000, alt: 'SkyLink terminal app.' },
  { id: 'mc-field-panels', group: 'mission-control', slug: 'field-panels', target: 'plant', asset: 'FL-01', tab: 'site', setup: [{ eval: "document.querySelectorAll('#site-service-panel summary, #site-power-panel summary').forEach((s) => { if (!s.parentElement.open) s.click(); }); document.querySelector('#site-service-panel')?.scrollIntoView()" }, { wait: 500 }], selector: '#site-service-panel', alt: 'Field panels on the Site tab.' },

  // ---- range watch
  { id: 'plug-phased-array', group: 'plugins', slug: 'phased-array', target: 'rw', asset: 'CM-01', tab: 'acu-control-0', settle: 5000, alt: 'Phased array control page.' },
  { id: 'plug-constellation', group: 'plugins', slug: 'constellation-sandbox', target: 'geo', settle: 5000, alt: 'Constellation sandbox GEO belt survey.' },

  // ---- weather and faults
  { id: 'sys-weather', group: 'systems', slug: 'weather-and-rain-fade', target: 'eu', asset: 'GW-01', tab: 'link-budget', setup: [{ advance: 1700000 }, { wait: 1500 }], alt: 'Link Analysis tab while rain fade reduces the Galway link margin.' },
  { id: 'sys-faults', group: 'systems', slug: 'faults', target: 'eu', setup: [{ domClick: '#alarm-summary' }, { wait: 500 }], selector: '#mission-alarm-panel', alt: 'Active alarms panel listing station faults and warnings.' },
];
