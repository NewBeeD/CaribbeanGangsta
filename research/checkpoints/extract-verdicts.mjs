import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = String.raw`C:\Users\Dan\Desktop\WebDev\IslandLife\research\checkpoints\live-run-wf_00b250b9\transcripts`;
const out = [];
for (const f of readdirSync(dir).filter(f => f.startsWith('agent-') && f.endsWith('.jsonl'))) {
  for (const line of readFileSync(join(dir, f), 'utf8').split('\n')) {
    if (!line.includes('"verdicts"')) continue;
    let obj; try { obj = JSON.parse(line); } catch { continue; }
    const content = obj?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const c of content) {
      if (c.type === 'tool_use' && c.name === 'StructuredOutput' && Array.isArray(c.input?.verdicts)) {
        out.push({ source: c.input.source, accessible: c.input.accessible, verdicts: c.input.verdicts, agent: f });
      }
    }
  }
}
writeFileSync(join(String.raw`C:\Users\Dan\Desktop\WebDev\IslandLife\research\checkpoints`, 'verdicts.json'), JSON.stringify(out, null, 2));
const n = out.reduce((s, o) => s + o.verdicts.length, 0);
console.log(`sources with verdicts: ${out.length}, total verdicts: ${n}`);
for (const o of out) {
  const sup = o.verdicts.filter(v => v.verdict === 'SUPPORTED').length;
  const unv = o.verdicts.filter(v => v.verdict === 'UNVERIFIABLE').length;
  const ref = o.verdicts.filter(v => v.verdict === 'REFUTED').length;
  console.log(`${o.accessible ? 'ok ' : 'N/A'} S:${sup} U:${unv} R:${ref}  ${o.source}`);
}
