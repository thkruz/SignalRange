import type { ScenarioData } from '@app/ScenarioData';
import { geoCycleReached, handoversSincePageOpen, manualScanLossAbove } from './evaluators';
import { cedarMesaGroundStation } from './ground-stations';
import { OUTAGE_REPORT_ID, outageReportFiled } from './outage-report';
import { kuSat1 } from './satellites';

/**
 * Constellation Sandbox - Starlink Interference
 *
 * Cedar Mesa's CM-01 is a Ku flat-panel phased array user terminal. It tracks
 * the Starlink fleet (starlink-2026-11, about 11,200 members, not operated),
 * hands over between satellites, and has a GEO protection zone around the arc.
 * KU-SAT 1 stays in the sky as the protected GEO satellite.
 *
 * Figures on the Array Control page are typical values for a Ku flat-panel
 * terminal, not measured Starlink specs.
 *
 * Start time 2026-11-09 18:00:00 UTC.
 */
export const starlinkSandboxData: ScenarioData = {
  id: 'starlink-interference',
  url: 'range-watch/scenarios/starlink-interference',
  imageUrl: 'range-watch/starlink-interference/card.png',
  number: 0,
  isDisabled: false,
  difficulty: 'intermediate',
  title: 'Starlink Interference',
  subtitle: 'Run a Phased Array Terminal Under a GEO Arc',
  duration: 'Unlimited',
  missionType: 'Sandbox',
  description: `CM-01 at Cedar Mesa is a Ku-band flat-panel phased array. It has no dish to point. It steers a beam electronically and follows one Starlink at a time, then hands over to the next before the first sets.
  <br/><br/>Open the Array Control page and watch the handovers. Each one is a short outage. Switch to MANUAL, lock a Starlink yourself and watch the scan loss grow as the beam leans off the panel normal. KU-SAT 1, a GEO satellite at 98 W, is the protected satellite: the terminal keeps its beam out of the GEO arc while the protection zone is on. Turn the zone off to see what the warning does, then turn it back on. The GEO interference card shows how far the beam is from the arc. It has no uplink power model, so it reports geometry only. The figures are typical values for a Ku flat-panel terminal, not measured Starlink specs. There is no timer and nothing here can fail.`,
  equipment: ['Ku-band Phased Array User Terminal (electronic beam steering, GEO protection zone)', 'Ku-band RF Front End (13100 MHz LNB LO)', 'Spectrum Analyzer', 'RX Modem'],
  settings: {
    isSync: true,
    groundStations: [cedarMesaGroundStation],
    satellites: [kuSat1],
    constellations: [{ tleSet: 'starlink-2026-11' }],
    isExtraSatellitesVisible: true,
    scenarioStartDate: '2026-11-09',
    scenarioStartWallTime: '18:00:00',
  },
  objectives: [
    {
      id: 'open-array-control',
      title: 'Open Array Control',
      description: 'Open the Array Control tab on CM-01. The sky view shows every Starlink the panel can see and the one it is tracking.',
      groundStation: 'CM-01',
      conditions: [{ type: 'tab-active', description: 'Array Control Open', params: { tab: 'acu-control' }, mustMaintain: false }],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'watch-handovers',
      title: 'Watch Two Handovers',
      description:
        'Leave the terminal in AUTO and watch it hand over to a new satellite twice. The modem drops lock for a moment at each one. Skip time forward if you do not want to wait.',
      groundStation: 'CM-01',
      prerequisiteObjectiveIds: ['open-array-control'],
      conditions: [{ type: 'custom', description: 'Two handovers seen', params: { evaluator: handoversSincePageOpen(2) }, mustMaintain: false }],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'manual-lock',
      title: 'Lock a Starlink by Hand',
      description: 'Switch to MANUAL, then click a Starlink on the sky view to lock it. Pick one low in the sky until the scan loss passes 1 dB.',
      groundStation: 'CM-01',
      prerequisiteObjectiveIds: ['watch-handovers'],
      conditions: [{ type: 'custom', description: 'Manual lock with scan loss above 1 dB', params: { evaluator: manualScanLossAbove(1) }, mustMaintain: false }],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'geo-protection',
      title: 'Test the GEO Protection Zone',
      description:
        'Turn the GEO protection zone off. In MANUAL, lock a Starlink whose beam points into the GEO arc and watch the in-arc warning. Then turn the zone back on. The GEO interference card shows the separation from the arc.',
      groundStation: 'CM-01',
      prerequisiteObjectiveIds: ['manual-lock'],
      conditions: [
        { type: 'custom', description: 'GEO protection zone off', params: { evaluator: geoCycleReached(1) }, mustMaintain: false },
        { type: 'custom', description: 'Beam inside the GEO arc', params: { evaluator: geoCycleReached(2) }, mustMaintain: false },
        { type: 'custom', description: 'GEO protection zone back on', params: { evaluator: geoCycleReached(3) }, mustMaintain: false },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'file-the-report',
      title: 'Report the Link Drop',
      description:
        'Set the terminal back to AUTO and let it hand over. When the link drops, read the Last link drop row on Array Control, then open the form and file the NORAD number of the satellite that was serving and a UTC window of at most 10 minutes around the drop. The report is accepted only if the terminal logged that drop.',
      groundStation: 'CM-01',
      prerequisiteObjectiveIds: ['geo-protection'],
      conditions: [
        {
          type: 'custom',
          description: 'Outage report filed and accepted',
          params: { evaluator: outageReportFiled, reportForm: OUTAGE_REPORT_ID },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
  ],
};
