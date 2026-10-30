/** Repo-relative locations shared by the art tools. */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const ART = join(REPO, 'src', 'private', 'art');
export const LEDGER = join(ART, 'ledger.jsonl');
export const SUPERSEDED = join(ART, 'superseded');
export const CHARACTERS = join(REPO, 'public', 'assets', 'characters');
export const CAMPAIGN_ASSETS = join(REPO, 'public', 'assets', 'campaigns');
export const STYLE_FILE = join(REPO, 'scripts', 'art', 'card-style.json');
export const ENV_FILES = [join(REPO, '.env'), 'D:/code/kruczek-labs/05-games/hq/.env'];
