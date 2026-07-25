import { getAssetUrl } from "@app/utils/asset-url";

export enum Character {
  /** Mid-level ground station operator and guide. British immigrant with a rough tone. */
  CHARLIE_BROOKS = 'charlie_brooks',
  /** Junior ground station operator. Enthusiastic and eager to learn. */
  CATHERINE_VEGA = 'catherine_vega',
  /** Atlantic Shipping Alliance. SeaLink's anchor customer. */
  JAMES_OKAFOR = 'james_okafor',
  /** Board Member and former investment banker who doesn't understand satellites but understands burn rate */
  FRANCIS_MARTIN = 'francis_martin',
  /** Satellite Operations Engineer from Halifax. Canadian with subtle Canadian-isms. */
  MARCUS_CHEN = 'marcus_chen',
  DANA_TORRES = "dana_torres",
  /** Charlie's teenage niece. Licensed ham (KD2RLY), SatNOGS contributor, teaches backyard satellite tracking with infectious enthusiasm. */
  RILEY_BROOKS = 'riley_brooks',
  /** SH-02 Shetland operator; the player's cross-station peer in Campaign 2. Shetlander; practical, weather-obsessed, understated humor. */
  FIONA_MACLEOD = 'fiona_macleod',
  /** MERIDIAN constellation ops engineer (satellite operator HQ, Rotterdam). Precise, procedural, warm under pressure. */
  ANNEKE_VISSER = 'anneke_visser',
  /** Customer: senior analyst, Nordic Maritime Watch (SAR imagery tasking). Direct, mission-focused, talks vessels-and-coverage not RF. */
  ERIK_HALVORSEN = 'erik_halvorsen',
  /** NATS Group Security / CSIRT lead. Drives the Campaign 2 Phase 3 adversary arc. Calm, methodical, evidence-first. */
  PRIYA_SHARMA = 'priya_sharma',
  /** System/Self-check - no avatar, used for solo scenarios where no NPC is present */
  SYSTEM = 'system',
}

export enum Emotion {
  NEUTRAL = 'neutral',
  HAPPY = 'happy',
  ANGRY = 'angry',
  SAD = 'sad',
  SURPRISED = 'surprised',
  CONCERNED = 'concerned',
  CONFIDENT = 'confident',
  SKEPTICAL = 'skeptical',
  EXCITED = 'excited',
  FRUSTRATED = 'frustrated',
}

export const CharacterAvatars: Record<Character, string> = {
  [Character.CHARLIE_BROOKS]: getAssetUrl('/assets/characters/charlie-brooks.png'),
  [Character.CATHERINE_VEGA]: getAssetUrl('/assets/characters/catherine-vega.png'),
  [Character.JAMES_OKAFOR]: getAssetUrl('/assets/characters/james-okafor.png'),
  [Character.FRANCIS_MARTIN]: getAssetUrl('/assets/characters/francis-martin.png'),
  [Character.MARCUS_CHEN]: getAssetUrl('/assets/characters/marcus-chen.png'),
  [Character.DANA_TORRES]: getAssetUrl('/assets/characters/dana-torres.png'),
  [Character.RILEY_BROOKS]: getAssetUrl('/assets/characters/riley-brooks.png'),
  [Character.FIONA_MACLEOD]: getAssetUrl('/assets/characters/fiona-macleod.png'),
  [Character.ANNEKE_VISSER]: getAssetUrl('/assets/characters/anneke-visser.png'),
  [Character.ERIK_HALVORSEN]: getAssetUrl('/assets/characters/erik-halvorsen.png'),
  [Character.PRIYA_SHARMA]: getAssetUrl('/assets/characters/priya-sharma.png'),
  [Character.SYSTEM]: '',
};

export const CharacterNames: Record<Character, string> = {
  [Character.CHARLIE_BROOKS]: 'Charlie Brooks',
  [Character.DANA_TORRES]: 'Dana Torres',
  [Character.CATHERINE_VEGA]: 'Catherine Vega',
  [Character.JAMES_OKAFOR]: 'James Okafor',
  [Character.FRANCIS_MARTIN]: 'Francis Martin',
  [Character.MARCUS_CHEN]: 'Marcus Chen',
  [Character.RILEY_BROOKS]: 'Riley Brooks',
  [Character.FIONA_MACLEOD]: 'Fiona MacLeod',
  [Character.ANNEKE_VISSER]: 'Anneke Visser',
  [Character.ERIK_HALVORSEN]: 'Erik Halvorsen',
  [Character.PRIYA_SHARMA]: 'Priya Sharma',
  [Character.SYSTEM]: 'Knowledge Check',
};

export const CharacterTitles: Record<Character, string> = {
  [Character.CHARLIE_BROOKS]: 'Senior Ground Station Operator',
  [Character.DANA_TORRES]: 'Shift Supervisor',
  [Character.CATHERINE_VEGA]: 'Ground Station Operator',
  [Character.JAMES_OKAFOR]: 'Fleet Captain',
  [Character.FRANCIS_MARTIN]: 'Board Member',
  [Character.MARCUS_CHEN]: 'Satellite Operations Engineer',
  [Character.RILEY_BROOKS]: 'Amateur Radio Operator - KD2RLY',
  [Character.FIONA_MACLEOD]: 'Ground Station Operator',
  [Character.ANNEKE_VISSER]: 'Constellation Operations Engineer',
  [Character.ERIK_HALVORSEN]: 'Senior Maritime Analyst',
  [Character.PRIYA_SHARMA]: 'CSIRT Lead',
  [Character.SYSTEM]: '',
};

export const CharacterCompany: Record<Character, string> = {
  [Character.CHARLIE_BROOKS]: 'North Atlantic Teleport Services (Vermont)',
  [Character.DANA_TORRES]: 'North Atlantic Teleport Services (Vermont)',
  [Character.CATHERINE_VEGA]: 'North Atlantic Teleport Services (Maine)',
  [Character.JAMES_OKAFOR]: 'Atlantic Shipping Alliance',
  [Character.FRANCIS_MARTIN]: 'SeaLink',
  [Character.MARCUS_CHEN]: 'SeaLink Maritime (Halifax)',
  [Character.RILEY_BROOKS]: 'Backyard / AMSAT Member',
  [Character.FIONA_MACLEOD]: 'North Atlantic Teleport Services EU (Shetland)',
  [Character.ANNEKE_VISSER]: 'MERIDIAN Constellation Operations (Rotterdam)',
  [Character.ERIK_HALVORSEN]: 'Nordic Maritime Watch',
  [Character.PRIYA_SHARMA]: 'NATS Group Security',
  [Character.SYSTEM]: '',
};

export function getCharacterAvatarUrl(character: Character, emotion?: Emotion): string {
  const basePath = CharacterAvatars[character];
  if (!emotion || emotion === Emotion.NEUTRAL) {
    return basePath;
  }
  // Insert emotion before .png: /assets/characters/charlie-brooks.png -> /assets/characters/charlie-brooks-happy.png
  return basePath.replace('.png', `-${emotion}.png`);
}
