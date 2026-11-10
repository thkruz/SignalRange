/**
 * @file observation-text - Every observation line the C6 plant can show
 * @description One table per target class (verb -> state -> 1 to 3 variants) so
 * the text can be localised and tested as data. A line says what was checked and
 * what it showed. It never names the hidden cause ("corroded", "fixed", "faulty"),
 * and a fix verb returns the physical result plus an invitation to check.
 * Tokens: `{atM}` metres from the named end, `{len}` cable length, `{end}` named
 * end, `{v}` measured volts, `{nom}` expected volts, `{r}` loop resistance,
 * `{fuel}`/`{tank}` litres, `{pct}` battery percent, `{w}` load in watts,
 * `{a}` load in amps, `{boot}` boot seconds.
 * No DOM and no engine imports.
 */

import type { PlantFaultKind } from './physical-plant-types';
import type { RuleVerb } from './plant-verb-rules';

export type ObsTargetClass =
  | 'generator'
  | 'power-station'
  | 'power-strip'
  | 'router'
  | 'modem'
  | 'laptop'
  | 'panel'
  | 'reflector'
  | 'lnb'
  | 'conn-pd'
  | 'conn-coax'
  | 'conn-feed'
  | 'conn-power'
  | 'cable-pd'
  | 'cable-coax';

/** Fault kinds plus derived states. 'cleared' / 'no-effect' / 'not-needed' / 'full' only for fix verbs. */
export type ObsState = 'healthy' | PlantFaultKind | 'unpowered' | 'booting' | 'supply-absent' | 'supply-low' | 'cleared' | 'no-effect' | 'not-needed' | 'full';

export interface ObsKey {
  target: ObsTargetClass | '*';
  verb: RuleVerb;
  state: ObsState;
  /** Target id; lets the picker avoid repeating a line for the same target and verb */
  id?: string;
}

/** 1 to 3 variants; the first is the default when only one line is authored */
export type ObsLines = readonly [string, ...string[]];

export interface ObsTemplateVars {
  atM?: number | string;
  len?: number | string;
  end?: string;
  v?: string;
  nom?: string | number;
  r?: string;
  fuel?: string;
  tank?: string | number;
  pct?: number | string;
  w?: number | string;
  a?: string;
  boot?: number | string;
}

export type ClassText = Partial<Record<RuleVerb, Partial<Record<ObsState, ObsLines>>>>;
export type ObsTable = Readonly<Partial<Record<ObsTargetClass | '*', ClassText>>>;

/** Lines that belong to no target class */
export const GENERIC_OBS = {
  'not-applicable': ['That tool has no use on this.', 'Nothing to use that on here.'],
  'unknown-target': ['There is nothing like that here.'],
  'go-outside': ['You step outside.', 'You go out through the flap.'],
  'return-inside': ['You head back inside.'],
  spotted: ['The instructor notices how often you are going out and asks what you are looking for.'],
  'no-spare': ['The spare bin has none of those left.', 'You check the spares box. Empty for that item.'],
  'no-supply': ['There is no supply to measure here.'],
  // Supply hints appended to a 0 V reading (config `supplyHint`); `{feeder}` is the feeding part's label
  'hint-feeder': ['This part is fed from the {feeder}. Check what arrives there.'],
  'hint-generic': ['Nothing is arriving from upstream.'],
  'hint-source': ['This is a source and it is putting out nothing.'],
} as const satisfies Record<string, ObsLines>;

export type GenericObsKey = keyof typeof GENERIC_OBS;

// ---------------------------------------------------------------- connectors

/** Multi-pin power and data plug (SkyLink cable ends) */
const PLUG: ClassText = {
  inspect: {
    healthy: [
      'Plug fully home, no gap at the shell, pins clean in the visible part. Not tested electrically.',
      'Shell sits flush, latch engaged, no residue. Contacts not tested.',
      "Looks seated and dry at the shell. Can't see past the first few mm of contact.",
    ],
    'partial-seat': [
      'A thin gap shows between the shell and the socket face, and the plug sits slightly crooked. It looks pushed in, but not all the way. Not tested electrically.',
    ],
    unseated: ['The plug is out of the socket and hangs on its cable. Socket face is empty.'],
    corrosion: ['Green crust on the pins and the inside of the shell. Pin tips look dull.', 'White and green powder around two pins.'],
    moisture: ['Beads of water inside the shell and a wet ring at the boot.', 'Water bead on the pin insulator. Boot is damp inside.'],
    'bent-pin': ['One centre pin leans about 15 degrees off line from the others.', "One pin tip sits off-centre and doesn't line up with its socket hole."],
  },
  wiggle: {
    healthy: [
      'You move the plug by hand. No play at the shell.',
      'Side to side and a gentle pull. It stays solid.',
      'Nothing moves at the plug. It stays put for the 3 s you watched.',
    ],
    'partial-seat': ['The plug shifts a few mm in the socket as you move it, then settles back.'],
    unseated: ['Nothing to move. The plug is lying free of the socket.'],
    corrosion: ['Plug moves normally. The contacts feel gritty as it turns.', 'No play at the plug while you move it.'],
    moisture: ['Plug holds firm. Water runs from the boot as you flex it.'],
    'bent-pin': ['Plug holds firm when moved.'],
  },
  feel: {
    healthy: ['Dry and cool. Shell is solid in your hand.', 'Shell and boot are dry and at air temperature.', 'No heat and no play at the shell.'],
    'partial-seat': ['There is a little play: the shell rocks a couple of mm against the socket.'],
    unseated: ['It hangs loose. Nothing to feel but the cable.'],
    corrosion: ['The shell and thread feel rough and gritty under your thumb.'],
    moisture: ['The boot is wet, and a film comes off on your finger.'],
    'bent-pin': ['Nothing odd by hand. Shell and boot feel normal.'],
  },
  multimeter: {
    healthy: ['{v} V DC across the supply pins, steady for 10 s. Expect {nom} V.', 'Reads {v} V DC, no drift. That is the supply voltage at this plug only.'],
    'partial-seat': ['Reading jumps between {v} V and 0.0 V as the plug shifts.'],
    unseated: ['0.0 V DC at the socket. Probes touch, no supply.'],
    corrosion: ['{v} V at the pins, expect {nom} V. Drops further when the load starts.'],
    moisture: ['{v} V at the pins, expect {nom} V. Reading creeps down while you hold the probes.'],
    'bent-pin': ['{v} V DC on the straight pins. One pin reads 0.0 V at its far end.'],
  },
  'cable-tester': {
    healthy: ['All pins continuous to the far end, 0.2 ohm per pin. Insulation not tested here.', 'Contacts show continuity, no shorts between pins. Leakage not tested.'],
    'partial-seat': ['Resistance jumps between 0.2 ohm and open as you press on the plug. Settles when held.'],
    unseated: ['Open circuit on every pin at the plug.'],
    corrosion: ['Centre pin reads 4.7 ohm, the others 0.2 ohm. Climbs a little on the second try.'],
    moisture: ['Pin-to-shield leakage 12 kohm. A dry connector reads open. Falls further after a minute.'],
    'bent-pin': ['One pin reads open to the far end. Same pin shorts to the shell when pushed.'],
  },
  reseat: {
    cleared: ['You unplug it, look it over, and push it in until it clicks. The shell now sits flush. Check the link.'],
    'no-effect': [
      'You unplug it, look it over, and push it back in. It sits flush. Check the link to see if anything changed.',
      'You pull the plug, wipe the shell and seat it again. Nothing looks different.',
    ],
  },
  seal: {
    cleared: ['You dry the joint with a rag and wrap it with self-amalgamating tape. The wrap is tight and dry. Test the connector again.'],
    'no-effect': ['You wipe the joint and wrap it with self-amalgamating tape. Nothing inside was disturbed. Check the link.'],
  },
  swap: {
    cleared: [
      'You cut the old connector off and crimp on a new one from the kit. The new one sits flush. Test the link.',
      'You replace the connector from the kit. The old one is in your pocket. Check the contacts again.',
    ],
    'no-effect': [
      'You cut the old connector off and crimp on a new one from the kit. The new one sits flush. Test the link.',
      'You replace the connector from the kit. The old one is in your pocket. Check the contacts again.',
    ],
  },
};

/** F connector with a nut (IFL coax); carries the LNB supply */
const COAX: ClassText = {
  ...PLUG,
  inspect: {
    ...PLUG.inspect,
    healthy: [
      'Nut turned down to the face, no gap at the shell, centre pin clean in the visible part. Not tested electrically.',
      'Shell sits flush, nut engaged, no residue. Contacts not tested.',
    ],
    'loose-nut': ['The nut sits a turn back from the face of the socket. Thread visible behind it.'],
  },
  wiggle: {
    ...PLUG.wiggle,
    'loose-nut': ['The plug turns loosely when you twist it. The nut turns by hand with no resistance.'],
  },
  feel: {
    ...PLUG.feel,
    'loose-nut': ['The nut spins freely by hand. The shell is loose behind it.'],
  },
  multimeter: {
    ...PLUG.multimeter,
    'loose-nut': ['Reading wanders from {v} V down to 0.0 V when the nut is touched.'],
  },
  'cable-tester': {
    ...PLUG['cable-tester'],
    'loose-nut': ['Contact resistance jumps between 0.2 ohm and open when the nut is turned.'],
  },
  tighten: {
    cleared: ['You turn the nut down until it is snug. It no longer spins by hand. Check the link.'],
    'no-effect': ['You turn the nut and it stops snug after a quarter turn. Nothing else moves. Check the link.'],
  },
};

/** Bolted waveguide flange on the VSAT feed port (ahead of the LNA) */
const FEED: ClassText = {
  inspect: {
    healthy: [
      'Flange sits flush on the feed horn with all four screws in. Gasket line is dry. Not tested electrically.',
      'Flange face is square and the screws are seated. Nothing visible in the opening.',
    ],
    'loose-nut': ['One flange screw stands proud of its hole and the washer under it turns.'],
    'partial-seat': ['A thin gap shows along one edge of the flange, and it sits a hair off square. Looks mounted, but not fully home. Not tested electrically.'],
    unseated: ['The flange is off the feed horn. The waveguide opening is bare.'],
    corrosion: ['Green crust on the flange face and around the screw heads.'],
    moisture: ['Beads of water on the flange face and along the gasket line.'],
    'bent-pin': ['One locating pin on the flange leans off line with its hole.'],
  },
  wiggle: {
    healthy: ['You push and pull the flange by hand. No play.', 'The flange stays solid under a gentle twist.'],
    'partial-seat': ['The flange shifts a few mm as you press it, then settles back.'],
    'loose-nut': ['The flange turns loosely when you twist it. A screw turns by hand with no resistance.'],
    unseated: ['Nothing to move. The flange is off the horn.'],
    corrosion: ['Flange moves normally. The screw heads feel gritty as they turn.'],
    moisture: ['Flange holds firm. Water runs from the gasket line as you flex it.'],
    'bent-pin': ['Flange holds firm when moved.'],
  },
  feel: {
    healthy: ['Dry and cool. The flange is solid in your hand.', 'No heat and no play at the flange.'],
    'partial-seat': ['There is a little play: the flange rocks a couple of mm against the horn.'],
    'loose-nut': ['A flange screw spins freely by hand. The flange is loose behind it.'],
    unseated: ['It hangs loose. Nothing to feel but the opening.'],
    corrosion: ['The flange face and screw heads feel rough and gritty under your thumb.'],
    moisture: ['The flange is wet, and a film comes off on your finger.'],
    'bent-pin': ['Nothing odd by hand. The flange feels normal.'],
  },
  'cable-tester': {
    healthy: ['Contacts show continuity through the flange, no shorts. Leakage not tested.'],
    'partial-seat': ['Resistance jumps between 0.2 ohm and open as you press on the flange. Settles when held.'],
    'loose-nut': ['Contact resistance jumps between 0.2 ohm and open when a screw is turned.'],
    unseated: ['Open circuit through the flange.'],
    corrosion: ['Centre contact reads 4.7 ohm, the others 0.2 ohm. Climbs a little on the second try.'],
    moisture: ['Contact-to-shell leakage 12 kohm. A dry flange reads open. Falls further after a minute.'],
    'bent-pin': ['One contact reads open through the flange. It shorts to the shell when pushed.'],
  },
  reseat: {
    cleared: ['You back the screws off, seat the flange square on the horn and run the screws down evenly. Check the signal.'],
    'no-effect': ['You back the screws off, seat the flange again and run them down. It sits square. Check the signal to see if anything changed.'],
  },
  tighten: {
    cleared: ['You run each flange screw down in turn until none turns by hand. Check the signal.'],
    'no-effect': ['You run each flange screw down. They stop snug after a quarter turn. Check the signal.'],
  },
  seal: {
    cleared: ['You dry the flange with a rag and wrap the joint with self-amalgamating tape. The wrap is tight and dry. Test the connector again.'],
    'no-effect': ['You wipe the flange and wrap the joint with self-amalgamating tape. Nothing inside was disturbed. Check the signal.'],
  },
  swap: {
    cleared: ['You fit a new flange from the kit and bolt it down square. Test the signal.'],
    'no-effect': ['You fit a new flange from the kit and bolt it down square. Test the signal.'],
  },
};

/** Mains or DC plug and socket on the power path */
const POWER: ClassText = {
  inspect: {
    healthy: ['Plug fully home in the socket, no gap, no scorch marks. Not tested electrically.', 'Sits flush, pins not visible, no residue around the socket.'],
    'partial-seat': [
      'A thin gap shows between the plug body and the socket face, and the plug sits slightly crooked. It looks pushed in, but not all the way. Not tested electrically.',
    ],
    unseated: ['The plug is out of the socket and hangs on its lead. Socket face is empty.'],
    corrosion: ['Green and white crust on the pins and inside the socket.', 'Pin tips look dull, with powder around two of them.'],
    moisture: ['Beads of water on the pins and a damp ring around the socket.'],
    'bent-pin': ['One pin leans visibly off line from the others.'],
  },
  wiggle: {
    healthy: ['You move the plug by hand. No play at the plug.', 'A gentle pull and twist. It stays solid.'],
    'partial-seat': ['The plug shifts a few mm in the socket as you move it, then settles back.'],
    unseated: ['Nothing to move. The plug is lying free.'],
    corrosion: ['Plug moves normally. The pins feel gritty as it turns.'],
    moisture: ['Plug holds firm. Water runs from the socket as you flex it.'],
    'bent-pin': ['Plug holds firm when moved.'],
  },
  feel: {
    healthy: ['Dry and at air temperature. Plug is solid in the socket.', 'No heat and no play at the plug.'],
    'partial-seat': ['There is a little play: the plug rocks a couple of mm in the socket.'],
    unseated: ['It hangs loose. Nothing to feel but the lead.'],
    corrosion: ['The plug body and pins feel rough and gritty under your thumb.'],
    moisture: ['The socket is wet, and a film comes off on your finger.'],
    'bent-pin': ['Nothing odd by hand. The plug feels normal.'],
  },
  multimeter: {
    healthy: ['{v} V at the contacts, steady for 10 s. Expect {nom} V.', 'Reads {v} V, no drift. That is the supply at this plug only.'],
    'partial-seat': ['Reading jumps between {v} V and 0.0 V as the plug shifts.'],
    unseated: ['0.0 V at the socket. Probes touch, no supply.'],
    corrosion: ['{v} V at the contacts, expect {nom} V. Drops further when the load starts.'],
    moisture: ['{v} V at the contacts, expect {nom} V. Reading creeps down while you hold the probes.'],
    'bent-pin': ['{v} V on the straight pins. One pin reads 0.0 V at its far end.'],
  },
  reseat: {
    cleared: ['You unplug it, look it over, and push it in until it sits flush. Check what is powered.'],
    'no-effect': ['You unplug it, wipe the pins and push it back in. It sits flush. Check what is powered.', 'You pull the plug and seat it again. Nothing looks different.'],
  },
  swap: {
    cleared: ['You replace the plug from the kit. The new one sits flush. Check what is powered.'],
    'no-effect': ['You replace the plug from the kit. The new one sits flush. Check what is powered.'],
  },
};

// -------------------------------------------------------------------- cables

const CABLE: ClassText = {
  inspect: {
    healthy: [
      'Jacket intact along the visible run. Not tested electrically.',
      'No cuts, flats or kinks on the part you can see. Inside the jacket is unchecked.',
      'Run looks clean and clipped. Cable runs out of view past the flap.',
    ],
    'cable-nick': ['A cut in the outer jacket about {atM} m from the {end}. Braid or core glints through.'],
    'cable-pinch': ['The cable is trapped under a heavy edge about {atM} m from the {end}. Jacket is creased there.'],
    'cable-crush': ['A flat section about {atM} m from the {end}. Jacket is split along the flat.'],
    'cable-water': ['No cuts along the visible run. A film of moisture at the cable ends.'],
  },
  wiggle: {
    healthy: ['You flex the run along its length. Nothing shifts.', 'You work the cable by hand from end to end. It feels even all the way.'],
    'cable-nick': ['You flex it along the run. The jacket gapes a little at one cut.'],
    'cable-pinch': ['The jacket is creased and stiff near {atM} m from the {end}, and the cable shifts under the edge as you move it.'],
    'cable-crush': ['The flat part does not change shape however you flex it.'],
    'cable-water': ['You flex the run along its length. The cable feels heavy at one low point.'],
  },
  'cable-tester': {
    healthy: [
      'Continuity end to end over {len} m. Loop resistance {r} ohm. Insulation and RF loss not tested.',
      'No open and no short over {len} m. Does not show the state of the jacket.',
    ],
    'cable-nick': ['Impedance step at {atM} m from the {end}, out of {len} m. Continuity is still good.'],
    'cable-pinch': ['Impedance varies at {atM} m from the {end}, out of {len} m. Reading moves when the cable is moved.'],
    'cable-crush': ['Open circuit at {atM} m from the {end}, out of {len} m. Nothing beyond that point.'],
    'cable-water': ['Shield-to-core leakage 40 kohm. Impedance drifts from {atM} m from the {end} onward, out of {len} m.'],
  },
  reroute: {
    cleared: ['You lift the cable clear of the edge and clip it along a new path. The jacket has a crease where it was trapped. Check the link.'],
    'no-effect': ['You move the cable onto a clearer path and clip it. Nothing else was touching it. Check the link.'],
  },
  swap: {
    cleared: [
      'You run a spare {len} m cable end to end and plug both ends. The old cable is coiled on the bench. Check the link.',
      'New cable laid and clipped. Both plugs are home. Test the link.',
    ],
    'no-effect': [
      'You run a spare {len} m cable end to end and plug both ends. The old cable is coiled on the bench. Check the link.',
      'New cable laid and clipped. Both plugs are home. Test the link.',
    ],
  },
};

// --------------------------------------------------------------------- parts

/** Shared by the router and the modem; the modem overrides the LED wording */
function indoorBox(leds: string, bootLeds: string, vsat: boolean): ClassText {
  const dead = 'No light on the brick. The LEDs are off.';

  return {
    inspect: {
      healthy: [`${leds} Setup not checked.`, 'Lights steady. Case clean and dry.'],
      booting: [bootLeds],
      unpowered: ['No lights on the case.'],
      'brick-dead': [dead],
    },
    feel: {
      healthy: ['Warm at the vents.', 'Case just above room temperature.'],
      booting: ['Barely warm at the vents.'],
      unpowered: ['Cold.'],
      'brick-dead': ['Cold. The brick is cold too.'],
    },
    multimeter: {
      healthy: ['{v} V DC at the input. Expect {nom} V.'],
      'brick-dead': ['0.0 V DC at the input.'],
    },
    powerCycle: {
      cleared: ['You switch it off, wait 10 s and power it on. Power LED amber for about {boot} s. Watch the link LED.'],
      'no-effect': [
        vsat
          ? 'You switch it off, wait 10 s and power it on. Power LED amber for about {boot} s. Watch the Rx LED for the lock.'
          : 'You switch it off, wait 10 s and power it on. Power LED amber for about {boot} s. Watch the link LED.',
      ],
      unpowered: ['You switch it off and on. Nothing lights.'],
      'brick-dead': ['You switch it off and on. Nothing lights.'],
    },
    swap: {
      cleared: ['You swap the brick for a spare. Power LED comes on amber. Allow about {boot} s to boot.'],
      'no-effect': ['You swap the brick for a spare. Power LED comes on amber. Allow about {boot} s to boot.'],
    },
  };
}

const ROUTER = indoorBox('Power LED steady, link LED lit, cables seated.', 'Power LED blinking amber. No link light.', false);
const MODEM = indoorBox('Power, Rx and Tx LEDs steady. IFL F connector seated.', 'Power LED amber, Rx LED dark.', true);

const DISH_FIX: ClassText = {
  clearSnow: {
    cleared: ['You brush the face clear and tip the snow out of the frame. The face is bare. Check the status.'],
    'no-effect': ['You brush the face. Nothing was on it. Check the status.'],
  },
  removeNet: {
    cleared: ['You unhook the netting from the frame and pull it clear. The face is open. Check the status.'],
    'no-effect': ['You look for netting and there is none on the dish.'],
  },
};

const OBS_BY_CLASS: ObsTable = {
  '*': {
    inspect: { healthy: ['Nothing stands out.'] },
    wiggle: { healthy: ['It stays solid when you move it.'] },
    feel: { healthy: ['It feels normal.'] },
    multimeter: {
      healthy: ['{v} V, steady.'],
      'supply-low': ['{v} V, against {nom} V expected.'],
      'supply-absent': ['0.0 V. Nothing is arriving here.'],
    },
    'cable-tester': { healthy: ['Contact resistance 0.1 ohm on every pin.'] },
    reseat: { cleared: ['Reseated. Check the link.'], 'no-effect': ['Reseated. Nothing looked different afterwards.'] },
    tighten: { cleared: ['Tightened. Check the link.'], 'no-effect': ['Tightened. Nothing looked different afterwards.'] },
    seal: { cleared: ['Sealed. Check the link.'], 'no-effect': ['Sealed. Nothing looked different afterwards.'] },
    swap: { cleared: ['Swapped in the spare. Old unit set aside.'], 'no-effect': ['Swapped in the spare. Old unit set aside.'] },
    powerCycle: { cleared: ['Power cycled. Check the status.'], 'no-effect': ['Power cycled. Nothing looked different afterwards.'] },
    clearSnow: { cleared: ['Cleared. Check the status.'], 'no-effect': ['Nothing looked different afterwards.'] },
    removeNet: { cleared: ['Removed. Check the status.'], 'no-effect': ['Nothing looked different afterwards.'] },
    reroute: { cleared: ['Rerouted. Check the link.'], 'no-effect': ['Nothing looked different afterwards.'] },
  },
  generator: {
    inspect: {
      healthy: [
        'Running. Fuel gauge about {fuel} L, cap on, no leaks under the frame. Exhaust is clear.',
        'Engine running steady, no fuel smell, output plugs seated. Gauge reads {fuel} L.',
      ],
      'generator-sag': ['Running, but the engine note rises and falls. Gauge reads {fuel} L.'],
      'generator-noise': ['Inverter generator running smoothly. Gauge reads {fuel} L. Electrical noise is not visible from here.'],
      'out-of-fuel': ['Silent. Fuel gauge reads empty. Cap is on.'],
      unpowered: ['Silent. Gauge reads {fuel} L. The switch is off.'],
      booting: ['The engine is cranking and catching. The output is not up yet.'],
    },
    feel: {
      healthy: ['Frame vibrates evenly and the housing is warm.', 'Warm casing, steady vibration.'],
      'generator-sag': ['The frame shudders and the engine hunts up and down.'],
      'generator-noise': ['The inverter housing buzzes under your hand and the fan is running.'],
      'out-of-fuel': ['Cold and still.'],
      unpowered: ['Cold and still.'],
      booting: ['The frame shakes unevenly as the engine catches.'],
    },
    multimeter: {
      healthy: ['{v} V AC at the socket, 50 Hz, steady. Expect {nom} V.', '{v} V AC with the load on. Steady for 10 s.'],
      'generator-sag': ['{v} V AC under the {w} W load. Expect {nom} V. The reading hunts as the engine does.'],
      'generator-noise': ['{v} V AC, steady. Voltage does not show radio noise.'],
      'out-of-fuel': ['0.0 V AC at the socket.'],
      'supply-absent': ['0.0 V AC at the socket.'],
      'supply-low': ['{v} V AC under the {w} W load. Expect {nom} V.'],
    },
    powerCycle: {
      cleared: ['You stop it, wait 10 s and restart. The engine note stays even. Check the output under load.'],
      'no-effect': ['You stop it, wait 10 s and restart. It runs again at {v} V AC. Compare the load reading.'],
      'out-of-fuel': ['You pull the cord. It turns over and does not catch. The tank is empty.'],
    },
    setMode: {
      cleared: ['You set the switch to run and pull the cord. The engine catches and warms up. The output is not up yet.'],
      unpowered: ['You set the switch to off. The engine dies down and goes quiet.'],
      'out-of-fuel': ['You set the switch to run and pull the cord. It turns over and does not catch. The tank is empty.'],
      booting: ['The engine is already cranking. The output is not up yet.'],
      'not-needed': ['It is already running.'],
      full: ['It is already off.'],
    },
    refuel: {
      cleared: ['You pour a can into the tank and restart. It catches and settles. Check the gauge and the output.'],
      'not-needed': ['The gauge shows {fuel} L of {tank} L. You leave the can closed.', 'The tank has fuel ({fuel} L of {tank} L). You do not pour.'],
      full: ['Tank is nearly full ({fuel} L of {tank} L).'],
    },
  },
  'power-station': {
    inspect: {
      healthy: [
        'Display on, {pct} percent, DC outputs lit, input LED green. Internal cells not checked.',
        'Screen shows {pct} percent and {w} W out. Vents clear, no marks on the case.',
      ],
      'battery-depleted': ['Display blank. No output LEDs. Input LED off.', 'Screen reads 0 percent and shows no output.'],
      unpowered: ['Display blank. No output LEDs. Input LED off.'],
    },
    feel: {
      healthy: ['Case is cool to warm, fan quiet.', 'Warm at the vents. Nothing hot.'],
      'battery-depleted': ['Case is cool. The fan is still.'],
      unpowered: ['Case is cool. The fan is still.'],
    },
    multimeter: {
      healthy: ['{v} V DC at the outputs, {a} A load. Expect {nom} V.', '{v} V DC, steady under {w} W.'],
      'battery-depleted': ['0.0 V DC at the outputs.'],
      'supply-absent': ['0.0 V DC at the outputs.'],
      'supply-low': ['{v} V DC at the outputs under {w} W. Expect {nom} V.'],
    },
    powerCycle: {
      cleared: ['You switch the station off, wait 10 s and switch it on. Outputs return. Check what is powered.'],
      'no-effect': ['You switch the station off, wait 10 s and switch it on. Outputs return. Check what is powered.'],
      'battery-depleted': ['You switch it off and on. Display stays blank.'],
      unpowered: ['You switch it off and on. Display stays blank.'],
    },
    swap: {
      cleared: ['You fit the spare charger brick. The input LED is lit. Check the charge reading.'],
      'no-effect': ['You fit the spare charger brick. The input LED is lit. Check the charge reading.'],
    },
  },
  'power-strip': {
    inspect: {
      healthy: ['Switch lit, both sockets in use, leads seated. Not tested electrically.', 'Switch lamp on. Case clean and dry.'],
      unpowered: ['The switch lamp is dark.'],
    },
    feel: {
      healthy: ['Cool to the touch. Sockets are solid.', 'At air temperature. Nothing warm.'],
      unpowered: ['Cold. Nothing warm.'],
    },
    multimeter: {
      healthy: ['{v} V across the strip, steady. Expect {nom} V.'],
      'supply-absent': ['0.0 V across the strip.'],
      'supply-low': ['{v} V across the strip. Expect {nom} V.'],
    },
    swap: {
      cleared: ['You fit the spare strip. Its switch lamp lights. Check what is powered.'],
      'no-effect': ['You fit the spare strip. Its switch lamp lights. Check what is powered.'],
    },
  },
  router: ROUTER,
  modem: MODEM,
  laptop: {
    inspect: {
      healthy: ['Lid up, charging LED on, screen awake. Software not checked.', 'Screen on, charging, port lights lit.'],
      unpowered: ['Screen dark, no charging LED.'],
      'brick-dead': ['Screen dark, no charging LED. The charger brick has no light.'],
    },
    feel: {
      healthy: ['Warm at the underside.', 'Case a little warm, fan quiet.'],
      unpowered: ['Cold.'],
      'brick-dead': ['Cold. The charger brick is cold too.'],
    },
    powerCycle: {
      cleared: ['You shut it down, wait 10 s and boot it. The login screen returns.'],
      'no-effect': ['You shut it down, wait 10 s and boot it. The login screen returns.'],
      unpowered: ['You press the power button. The screen stays dark.'],
      'brick-dead': ['You press the power button. The screen stays dark.'],
    },
    swap: {
      cleared: ['You fit the spare charger. The charging LED lights. Check the battery indicator.'],
      'no-effect': ['You fit the spare charger. The charging LED lights. Check the battery indicator.'],
    },
  },
  panel: {
    ...DISH_FIX,
    inspect: {
      healthy: ['Face clear and dry, mount tight, cable plug home. Pointing not checked.', 'Panel dry, no marks. Status LED not visible from here.'],
      snow: ['A layer of snow sits across the face, about 20 mm deep.'],
      net: ['Netting is draped across the face and caught on the frame.'],
      booting: ['Status LED on the base pulses.'],
      unpowered: ['No LED at the base.'],
      'brick-dead': ['No LED at the base. The power brick has no light.'],
    },
    feel: {
      healthy: ['Cool, with a slight warmth at the electronics box.', 'Face is at air temperature.'],
      snow: ['Face is packed with snow and cold to the touch.'],
      net: ['Netting is pulled tight against the face.'],
      booting: ['Cool, with a slight warmth at the electronics box.'],
      unpowered: ['Face is at air temperature. The electronics box is cold.'],
      'brick-dead': ['Face is at air temperature. The electronics box is cold.'],
    },
    powerCycle: {
      cleared: ['You unplug the base, wait 10 s and plug it back. Status LED pulses for about {boot} s. Watch for a lock.'],
      'no-effect': ['You unplug the base, wait 10 s and plug it back. Status LED pulses for about {boot} s. Watch for a lock.'],
      unpowered: ['You unplug the base, wait 10 s and plug it back. No LED comes on.'],
      'brick-dead': ['You unplug the base, wait 10 s and plug it back. No LED comes on.'],
    },
    swap: {
      cleared: ['You fit the spare panel base unit. Status LED pulses. Allow about {boot} s.'],
      'no-effect': ['You fit the spare panel base unit. Status LED pulses. Allow about {boot} s.'],
    },
  },
  reflector: {
    inspect: {
      healthy: ['Dish surface clean, no dents. Mount bolts tight. Feed arm straight. Pointing not checked.', 'Reflector dry with no dents. Feed horn cover in place.'],
      snow: ['Snow lies in the bowl and on the feed arm.'],
      net: ['Netting is draped over the rim and across the feed arm.'],
      'brick-dead': ['Surface clean. The mount adapter has no light on it.'],
    },
    clearSnow: {
      cleared: ['You brush the bowl and arm clear. The surface is bare. Check the signal.'],
      'no-effect': ['You brush the bowl. Nothing was on it. Check the signal.'],
    },
    removeNet: {
      cleared: ['You free the netting from the rim and pull it off. Check the signal.'],
      'no-effect': ['You look for netting and there is none on the dish.'],
    },
    swap: {
      cleared: ['You fit a spare reflector. Pointing will need checking.'],
      'no-effect': ['You fit a spare reflector. Pointing will need checking.'],
    },
  },
  lnb: {
    inspect: {
      healthy: ['Housing intact, F connector boot snug, no cracks. Electronics not tested.', 'LNB sits square in the feed arm. Boot is dry on the outside.'],
      unpowered: ['Nothing to see on the LNB. It has no LED.'],
      'brick-dead': ['Nothing to see on the LNB. It has no LED.'],
    },
    swap: {
      cleared: ['You fit a spare LNB and connect the IFL. Check the signal on the receiver.'],
      'no-effect': ['You fit a spare LNB and connect the IFL. Check the signal on the receiver.'],
    },
  },
  'conn-pd': PLUG,
  'conn-coax': COAX,
  'conn-feed': FEED,
  'conn-power': POWER,
  'cable-pd': CABLE,
  'cable-coax': CABLE,
};

export const OBS_TABLE: ObsTable = OBS_BY_CLASS;

function linesFor(table: ObsTable, target: ObsTargetClass | '*', verb: RuleVerb, state: ObsState): ObsLines | undefined {
  return table[target]?.[verb]?.[state];
}

/** The authored lines for a key: the class row, then the `*` row. Never falls back to another state. */
export function lookupObs(table: ObsTable, key: ObsKey): ObsLines | undefined {
  return linesFor(table, key.target, key.verb, key.state) ?? linesFor(table, '*', key.verb, key.state);
}

/** True when the table has text for exactly this key (class or `*` row) */
export function hasObs(table: ObsTable, key: ObsKey): boolean {
  return lookupObs(table, key) !== undefined;
}

/** Replace `{name}` markers in a template; unknown names are left as written */
export function fillText(template: string, values: Record<string, string | number | undefined>): string {
  return template.replace(/\{(\w+)\}/gu, (whole, name: string) => {
    const value = values[name];

    return value === undefined ? whole : String(value);
  });
}

/** Pick one variant, never the one this key returned last time (when there is another) */
function chooseVariant(lines: ObsLines, rng: { next(): number }, last: Map<string, string> | undefined, memoryKey: string): string {
  let pool: readonly string[] = lines;
  const previous = last?.get(memoryKey);
  if (pool.length > 1 && previous !== undefined) {
    pool = pool.filter((line) => line !== previous);
  }
  const line = pool[Math.min(pool.length - 1, Math.floor(rng.next() * pool.length))];
  last?.set(memoryKey, line);

  return line;
}

/**
 * Pick the line for a key and fill its tokens. Fallback chain: the exact
 * class/verb/state, the `*` row for that verb and state, then the class's
 * `healthy` row, then the `*` healthy row. Throws only when no row exists at all.
 */
export function pickObs(table: ObsTable, key: ObsKey, rng: { next(): number }, vars: ObsTemplateVars, last?: Map<string, string>): string {
  const lines = lookupObs(table, key) ?? lookupObs(table, { ...key, state: 'healthy' });
  if (!lines) {
    throw new Error(`No observation text for ${key.target}.${key.verb}.${key.state}`);
  }
  const line = chooseVariant(lines, rng, last, `${key.id ?? key.target}|${key.verb}`);

  return fillText(line, vars as Record<string, string | number | undefined>);
}

/** Pick a line that belongs to no class (refusals, trips, no stock) */
export function pickGeneric(key: GenericObsKey, rng: { next(): number }, last?: Map<string, string>): string {
  return chooseVariant(GENERIC_OBS[key], rng, last, `generic|${key}`);
}
