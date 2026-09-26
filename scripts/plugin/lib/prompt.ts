import { createInterface } from 'node:readline/promises';

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

/** Free-text prompt. Returns `def` immediately when stdin is not a TTY (CI). */
export async function promptText(label: string, def = ''): Promise<string> {
  if (!process.stdin.isTTY) {
    return def;
  }

  const answer = await ask(`${label}${def ? ` (${def})` : ''}: `);

  return answer || def;
}
