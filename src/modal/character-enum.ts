export enum Character {
  /** Mid-level ground station operator and guide. British immigrant with a rough tone. */
  CHARLIE_BROOKS = 'charlie_brooks',
  /** SeaLink CEO. Former submarine communications officer. */
  CATHERINE_VEGA = 'catherine_vega',
  /** Atlantic Shipping Alliance. SeaLink's anchor customer. */
  JAMES_OKAFOR = 'james_okafor',
  /** Board Member and former investment banker who doesn’t understand satellites but understands burn rate */
  FRANCIS_MARTIN = 'francis_martin',
}

export const CharacterAvatars: Record<Character, string> = {
  [Character.CHARLIE_BROOKS]: '/assets/characters/charlie-brooks.png',
  [Character.CATHERINE_VEGA]: '/assets/characters/catherine-vega.png',
  [Character.JAMES_OKAFOR]: '/assets/characters/james-okafor.png',
  [Character.FRANCIS_MARTIN]: '/assets/characters/francis-martin.png',
};
