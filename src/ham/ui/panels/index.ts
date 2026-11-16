/**
 * @file panels/index - Registry of Station tab panels
 * @description Order here is display order. Each panel decides its own relevance.
 */

import type { StationPanel } from '../station-panel';
import { AnalyzerPanel } from './analyzer-panel';
import { AntennaPanel } from './antenna-panel';
import { BoardPanel } from './board-panel';
import { CardsPanel } from './cards-panel';
import { ConversationsPanel } from './conversations-panel';
import { DcPanel } from './dc-panel';
import { FrontPanel } from './front-panel';
import { HintPanel } from './hint-panel';
import { LogPanel } from './log-panel';
import { MeterPanel } from './meter-panel';
import { PacketPanel } from './packet-panel';
import { RadioPanel } from './radio-panel';
import { SatellitePanel } from './satellite-panel';
import { SwrPanel } from './swr-panel';
import { WorksheetPanel } from './worksheet-panel';

export function createStationPanels(): StationPanel[] {
  return [
    new HintPanel(),
    new RadioPanel(),
    new MeterPanel(),
    new SwrPanel(),
    new AnalyzerPanel(),
    new AntennaPanel(),
    new BoardPanel(),
    new DcPanel(),
    new PacketPanel(),
    new SatellitePanel(),
    new FrontPanel(),
    new WorksheetPanel(),
    new CardsPanel(),
    new LogPanel(),
    new ConversationsPanel(),
  ];
}
