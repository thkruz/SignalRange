#!/usr/bin/env node
/** Apply the asset link and private-app install to an existing lane. Usage: node scripts/lanes/sync-lane.mjs <name> */
import fs from 'node:fs';
import { laneDir, syncLaneExtras, validName } from './lib.mjs';

const [name] = process.argv.slice(2);
if (!validName(name) || !fs.existsSync(laneDir(name))) {
  console.error('[lane:sync] usage: sync-lane.mjs <name>   (an existing lane)');
  process.exit(1);
}
syncLaneExtras(laneDir(name));
