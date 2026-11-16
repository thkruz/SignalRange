#!/usr/bin/env node
/** List lanes: name, port, branch, ahead/behind dev, dirty, server state. */
import { laneState, portListening, readLanes } from './lib.mjs';

const lanes = readLanes();
if (lanes.length === 0) {
  console.log('no lanes');
  process.exit(0);
}
const rows = [['name', 'port', 'branch', 'ahead', 'behind', 'dirty', 'server']];
for (const l of lanes) {
  const s = laneState(l);
  let dirty = 'no';
  if (s.dirty === null) dirty = '?';
  else if (s.dirty) dirty = 'yes';
  rows.push([l.name, String(l.port), l.branch, String(s.ahead), String(s.behind), dirty, (await portListening(l.port)) ? 'up' : 'down']);
}
const w = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)));
for (const r of rows) console.log(r.map((c, i) => c.padEnd(w[i])).join('  ').trimEnd());
