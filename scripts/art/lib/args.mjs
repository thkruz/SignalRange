/** Tiny argv helpers: --flag, --opt value, --list a,b or --list a b c (until the next --flag). */
export function makeArgs(argv = process.argv.slice(2)) {
  const has = (name) => argv.includes(name);
  const opt = (name, fallback = undefined) => {
    const i = argv.indexOf(name);
    return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
  };
  const list = (name) => {
    const i = argv.indexOf(name);
    if (i < 0) return null;
    const out = [];
    for (let j = i + 1; j < argv.length && !argv[j].startsWith('--'); j++) out.push(...argv[j].split(',').filter(Boolean));
    return out;
  };
  return { argv, has, opt, list };
}
