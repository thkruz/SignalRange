// Renders results-*.json into Markdown: one table per area, failures first.
import fs from 'node:fs';

const cell = (s) => String(s ?? '').replace(/\|/gu, '\\|').replace(/\r?\n/gu, ' ');

export function render(files) {
  const runs = files.map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
  let out = '';
  const total = { pass: 0, fail: 0 };
  for (const r of runs) for (const x of r.results) x.pass ? total.pass++ : total.fail++;
  out += `Totals across ${runs.map((r) => r.stage).join(' + ')}: ${total.pass} passed, ${total.fail} failed.\n\n`;
  for (const run of runs) {
    const pass = run.results.filter((x) => x.pass).length;
    out += `## Stage \`${run.stage}\` (${run.stage === 'pre' ? 'feedback migrations only' : 'feedback migrations + supabase/pending revoke'}): ${pass} passed, ${run.results.length - pass} failed\n\n`;
    const areas = [...new Set(run.results.map((x) => x.area))];
    for (const a of areas) {
      const rows = run.results.filter((x) => x.area === a).sort((x, y) => Number(x.pass) - Number(y.pass));
      out += `### ${a} (${rows.filter((x) => x.pass).length}/${rows.length} pass)\n\n| Result | Case | HTTP | ms | Expected | Notes / failing input |\n|---|---|---|---|---|---|\n`;
      for (const x of rows) out += `| ${x.pass ? 'pass' : x.known ? 'known gateway' : '**FAIL**'} | ${cell(x.name)} | ${x.status} | ${x.ms} | ${cell(x.expect)} | ${cell([x.note, x.input && `input: ${x.input}`, x.response && `response: ${x.response}`].filter(Boolean).join(' / '))} |\n`;
      out += '\n';
    }
  }
  return out;
}
