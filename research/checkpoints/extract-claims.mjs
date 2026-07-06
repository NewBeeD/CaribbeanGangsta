import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = String.raw`C:\Users\Dan\.claude\projects\C--Users-Dan-Desktop-WebDev-IslandLife\d95e48fe-c751-497c-9aa0-8405d9723465\subagents\workflows\wf_98cbf101-e84`;
const all = [];
for (const f of readdirSync(dir).filter(f => f.startsWith('agent-') && f.endsWith('.jsonl'))) {
  const raw = readFileSync(join(dir, f), 'utf8');
  // source URL = first http(s) URL mentioned in the agent's prompt (first lines)
  const urlMatch = raw.match(/https?:\/\/[^\s"\\<>]+/);
  const agentUrl = urlMatch ? urlMatch[0].replace(/[).,;]+$/, '') : null;
  for (const line of raw.split('\n')) {
    if (!line.includes('"claims"')) continue;
    let obj; try { obj = JSON.parse(line); } catch { continue; }
    const content = obj?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const c of content) {
      if (c.type === 'tool_use' && c.name === 'StructuredOutput' && Array.isArray(c.input?.claims)) {
        if (all.length === 0) console.log('SAMPLE INPUT KEYS:', JSON.stringify(Object.keys(c.input)), '| FIRST CLAIM:', JSON.stringify(c.input.claims[0]).slice(0, 600));
        for (const cl of c.input.claims) {
          all.push({ source: agentUrl, quality: c.input.sourceQuality ?? null, claim: cl.claim ?? cl.text ?? null, quote: cl.quote ?? cl.evidence ?? null, agent: f });
        }
      }
    }
  }
}
// dedupe identical claim texts (retries produce dupes)
const seen = new Set();
const deduped = all.filter(c => { const k = c.claim; if (seen.has(k)) return false; seen.add(k); return true; });
writeFileSync(join(String.raw`C:\Users\Dan\Desktop\WebDev\IslandLife\research\checkpoints`, 'all-claims.json'), JSON.stringify(deduped, null, 2));
console.log(`raw: ${all.length}, deduped: ${deduped.length}`);
const bySource = {};
for (const c of deduped) bySource[c.source] = (bySource[c.source] ?? 0) + 1;
for (const [s, n] of Object.entries(bySource)) console.log(`${n}  ${s}`);
