export enum Character {
  NARRATOR = 'narrator',
  OPERATOR = 'operator',
  COMMANDER = 'commander',
  TECHNICIAN = 'technician',
  ANALYST = 'analyst',
}

export const CharacterAvatars: Record<Character, string> = {
  [Character.NARRATOR]: '/images/characters/narrator.png',
  [Character.OPERATOR]: '/images/characters/operator.png',
  [Character.COMMANDER]: '/images/characters/commander.png',
  [Character.TECHNICIAN]: '/images/characters/technician.png',
  [Character.ANALYST]: '/images/characters/analyst.png',
};
