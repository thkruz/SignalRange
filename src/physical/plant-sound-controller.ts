/**
 * @file plant-sound-controller - Sound for the physical sandbox (WP14)
 * @description Per-verb one-shots, the tent flap and footsteps, and the ambient beds, all
 * through the SoundManager (so mute and volume apply). One-shots come from the plant's
 * action listener; the loops are reconciled from `refresh()` on the service tick.
 */

import { Sfx } from '@app/sound/sfx-enum';
import SoundManager from '@app/sound/sound-manager';
import type { PhysicalPlantManager } from './physical-plant-manager';
import type { PlantLogEntry } from './physical-plant-types';

const LOOPS: Sfx[] = [Sfx.AMB_YARD, Sfx.AMB_TENT, Sfx.GENERATOR_STEADY_OUT, Sfx.GENERATOR_STEADY_IN, Sfx.GENERATOR_ROUGH_OUT, Sfx.GENERATOR_ROUGH_IN];

/** The one-shot a verb makes, or null. Connector verbs split seat versus pull. */
export function sfxForVerb(entry: PlantLogEntry, isConnector: boolean): Sfx | null {
  switch (entry.verb) {
    case 'reseat':
      return isConnector ? Sfx.CONNECTOR_SEAT : null;
    case 'tighten':
      return Sfx.FCONNECTOR_TIGHTEN;
    case 'wiggle':
      return Sfx.CABLE_RUSTLE;
    case 'multimeter':
      return Sfx.PROBE_BEEP;
    case 'cable-tester':
      return Sfx.CABLE_TESTER_BEEPS;
    case 'swap':
      return isConnector ? Sfx.CONNECTOR_PULL : Sfx.CASE_SWAP;
    case 'powerCycle':
      return Sfx.POWER_CYCLE;
    case 'refuel':
      return Sfx.REFUEL_POUR;
    case 'spotted':
      return Sfx.SPOTTED_WHISTLE;
    default:
      return null;
  }
}

export class PlantSoundController {
  private readonly unsubscribe_: () => void;
  private siteTabShown_ = false;
  private readonly playing_ = new Set<Sfx>();

  constructor(
    private readonly plant_: PhysicalPlantManager,
    private readonly sound_: Pick<SoundManager, 'play' | 'stop'> = SoundManager.getInstance()
  ) {
    this.unsubscribe_ = plant_.onAction((entry, wasOutside, nowOutside) => this.onAction_(entry, wasOutside, nowOutside));
  }

  setSiteTabShown(shown: boolean): void {
    this.siteTabShown_ = shown;
    this.refresh();
  }

  /** Reconcile the loops with the plant: yard outside, tent inside on the Site tab, generator by location and fault */
  refresh(): void {
    const outside = this.plant_.isOutside();
    const want = new Set<Sfx>();
    if (outside) {
      want.add(Sfx.AMB_YARD);
    } else if (this.siteTabShown_) {
      want.add(Sfx.AMB_TENT);
    }
    if (this.plant_.isGeneratorRunning()) {
      const rough = this.plant_.isRfiPresent();
      if (rough) {
        want.add(outside ? Sfx.GENERATOR_ROUGH_OUT : Sfx.GENERATOR_ROUGH_IN);
      } else {
        want.add(outside ? Sfx.GENERATOR_STEADY_OUT : Sfx.GENERATOR_STEADY_IN);
      }
    }
    for (const sfx of LOOPS) {
      const on = this.playing_.has(sfx);
      if (want.has(sfx) && !on) {
        this.sound_.play(sfx);
        this.playing_.add(sfx);
      } else if (!want.has(sfx) && on) {
        this.sound_.stop(sfx);
        this.playing_.delete(sfx);
      }
    }
  }

  dispose(): void {
    this.unsubscribe_();
    for (const sfx of this.playing_) {
      this.sound_.stop(sfx);
    }
    this.playing_.clear();
  }

  private onAction_(entry: PlantLogEntry, wasOutside: boolean, nowOutside: boolean): void {
    if (!wasOutside && nowOutside) {
      this.sound_.play(Sfx.TENT_EXIT);
    } else if (wasOutside && !nowOutside) {
      this.sound_.play(Sfx.TENT_ENTER);
    }
    const sfx = sfxForVerb(entry, this.plant_.getConnectorState(entry.target ?? '') !== null);
    if (sfx) {
      this.sound_.play(sfx);
    }
    this.refresh();
  }
}
