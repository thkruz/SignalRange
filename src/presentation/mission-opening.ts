import type { ScenarioData } from '@app/ScenarioData';
import { getAssetUrl } from '@app/utils/asset-url';
import type { SceneData } from './scene-modal';

/** Campaign prologues expand the selection blurb without repeating the briefing. */
const PROLOGUES: Record<string, { title: string; body: string }> = {
  'nats-scenario1': {
    title: 'A Place on the Roster',
    body: `North Atlantic Teleport Services earns its living keeping ships connected to shore. The traffic arrives here as radio energy from a point over the Atlantic, passes through the equipment in this room, and leaves on a terrestrial network. To a customer at sea, this building is invisible. A good shift helps keep it that way.

The station runs through the night and through the Vermont winter. Each operator takes over equipment someone else has been watching, along with a log of what changed and what still needs attention. You are joining a working shift, with customers already on the link.

Charlie Brooks has spent six years here. His upcoming transfer has given your training a deadline: soon, someone else will need to trust your handover. For now, there is a chair beside his console and time to learn the station while he is still here.`,
  },
  'nats-eu-scenario1': {
    title: 'Across the Water',
    body: `Your qualification in Vermont put you on the roster. It also opened a position on the other side of the Atlantic. North Atlantic Teleport Services is bringing its Galway station into service, and Charlie Brooks is there ahead of you.

This room will receive radar imagery from MERIDIAN's low-orbit satellites. Maritime customers depend on those images to see what is happening offshore, including through cloud and darkness. Every delivery begins with a few minutes when a moving spacecraft is above a ground station's horizon.

The installation crew has finished its work. You have inherited their test settings, a new console, and a schedule that will not wait for the building to feel familiar. In time, Galway and the station in Shetland will work as a network. Today, Galway needs its first operational shift.`,
  },
  'ham-sdr-scenario1': {
    title: "Riley's Side of the Hobby",
    body: `Satellite work follows Charlie Brooks home through his niece. Riley is a licensed amateur radio operator, and her corner of it fits around a household desk: a laptop, a small receiver, and antennas she can put up in the backyard.

Some spacecraft broadcast signals anyone can receive. Weather images, amateur-radio contacts and small research payloads pass overhead while ordinary life carries on below. Getting a useful result can depend on something as modest as a connector, a piece of wire or knowing when to be outside.

Riley has offered to show you her station. There is no customer waiting on this link and no supervisor signing off the shift. The reward is being able to point to an image on the screen and know that you received it yourself, from a machine you will never touch.`,
  },
  'ccs-scenario2': {
    title: 'Inside SANDSTORM',
    body: `The 9th Electronic Warfare Squadron's field site travels with its equipment. Outside the shelter, the antennas and generators take up most of the ground. Inside, the operator's view is much smaller: a console, a tasking order, and the instruments that show what the site is doing.

An order to interrupt a link carries limits. Friendly traffic shares the wider radio environment, and the team receiving your report needs to know whether the assigned effect actually happened. Transmitter power alone cannot answer that. The monitoring equipment matters as much as the transmitting equipment.

You are taking responsibility for that distinction at SANDSTORM. The site has a second transmit string so the task can continue when equipment fails. Keeping the operation within its orders will depend on the person in this chair noticing what has changed.`,
  },
  // TODO(ted): review wording
  'frontline-scenario1': {
    title: 'Kivilahti, First Shift',
    body: `Frontline Signals trains people to keep a link alive where nobody can phone for help. The kit is small enough to carry: a power station, a SkyLink terminal, a router, a laptop. Together they carry a pilot's application traffic to the people who depend on it.

Kivilahti is the training camp. The equipment here is healthy, which makes it the one place where you can learn what working looks like before anything breaks. Later you will be asked to find a fault, and the only way to find one is to know the baseline it departs from.

Sergeant Marek Domański runs the camp and your instruction. Pilot Aleksandra Wysocka, Ola to everyone, runs the application at the other end. Your first job is to go out to the equipment, check it with your own eyes and hands, and leave a record the next operator can trust.`,
  },
  'signal-hunter-scenario1': {
    title: 'The Quiet Between Bursts',
    body: `By the time a problem reaches the 22nd Electronic Warfare Squadron's interference team, other operators have already been watching it. They see service interruptions, check their equipment and compare notes. Their stations can be working correctly while the trouble continues to arrive through the satellite.

At Peterson Annex, your job begins with those observations. A satellite can relay an unwanted transmission across a wide footprint, separating the people affected by it from the place it came from. Finding that place takes measurements that another analyst can examine and reproduce.

Tonight's incident has reached your console. The interference comes and goes, leaving stretches where the link looks healthy. The operations team needs something it can act on. You have the receiving equipment, the incident record, and the next watch to turn those interruptions into evidence.`,
  },
};

const INTERIORS: Record<string, string> = {
  nats: 'A painted view inside a commercial ground station operations room.',
  'nats-eu': 'A painted view inside a coastal satellite tracking station.',
  'ham-sdr': 'A painted view of a home amateur radio workshop.',
  ccs: 'A painted view inside a field communications shelter.',
  'signal-hunter': 'A painted view inside a radio monitoring room.',
};

/** Only show a scene when there is a story to tell; later missions may opt in. */
export function missionOpening(scenario: ScenarioData): SceneData | null {
  const prologue = PROLOGUES[scenario.id];
  if (!prologue && !scenario.openingScene) return null;
  const campaign = scenario.url.split('/')[0];
  const interior = INTERIORS[campaign];
  return {
    label: 'Prologue',
    title: prologue?.title ?? scenario.title,
    subtitle: [scenario.settings.groundStations[0]?.name, `${scenario.settings.scenarioStartWallTime ?? '12:00:00'} UTC`].filter(Boolean).join(' · '),
    image: interior ? `/images/scenes/${campaign}-v2.webp` : getAssetUrl(`/assets/campaigns/${scenario.imageUrl}`),
    imageAlt: interior ?? '',
    facts: [],
    body: prologue?.body,
    actionLabel: 'Start',
    ...scenario.openingScene,
  };
}
