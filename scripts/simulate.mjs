// Runs both use cases end-to-end against the local System One stand-in.
// Set SYSTEMONE_URL to point the same code at a real Jev/OpenJev endpoint.
import { runOrder } from '../usecase-gate/pipeline.js';
import { SCENARIOS as GATE_SCENARIOS } from '../usecase-gate/scenarios.js';
import { SCENARIOS as JUDGE_SCENARIOS } from '../usecase-judge/scenarios.js';
import { judgeItem } from '../usecase-judge/cascade.js';
import { hazardScreen } from '../usecase-judge/guard.js';
import { costReport } from '../usecase-judge/report.js';

const line = (s = '') => console.log(s);
const hr = () => line('-'.repeat(72));
let failures = 0;
const mark = ok => { if (!ok) failures++; return ok ? 'PASS' : 'FAIL'; };

line('USE CASE 1 - gate + split (decision model routes, LLM only extracts)');
hr();
for (const s of GATE_SCENARIOS) {
  const r = await runOrder(s.text, { answer: s.answer });
  const ok = s.expect?.route ? r.route === s.expect.route : true;
  line(`\n[${mark(ok)}] ${s.name}`);
  line(`  in:     ${s.text}${s.answer ? `  (+answer: ${s.answer})` : ''}`);
  line(`  route:  ${r.route}`);
  if (r.tickets) for (const t of r.tickets)
    line(`  ticket: ${t.station.padEnd(8)} ${t.lines.map(l => `${l.qty}x ${l.name} [${l.flag}]`).join(', ')}`);
  if (r.total !== undefined) line(`  total:  $${r.total}`);
}

line('\n\nUSE CASE 2 - judge cascade + hazard guard');
hr();
for (const s of JUDGE_SCENARIOS) {
  if (s.kind === 'guard') {
    const g = await hazardScreen(s.input);
    const ok = g.allowed === s.expect.allowed;
    line(`\n[${mark(ok)}] ${s.name}`);
    line(`  guard:  ${g.allowed ? 'allowed' : 'BLOCKED'} (injection=${g.signals.prompt_injection}, abuse=${g.signals.abusive})`);
    continue;
  }
  const g = await hazardScreen(s.item.reply);
  const j = await judgeItem(s.item);
  const ok = j.path === s.expect.path;
  line(`\n[${mark(ok)}] ${s.name}`);
  line(`  guard:  ${g.allowed ? 'allowed' : 'BLOCKED'} (injection=${g.signals.prompt_injection}, abuse=${g.signals.abusive})`);
  line(`  judge:  path=${j.path} cost=$${j.costUsd} calls=${JSON.stringify(j.calls)}`);
}

line('\n\nCOST REPORT - cascade vs always-LLM vs always-decision-model');
hr();
const items = JUDGE_SCENARIOS.filter(s => s.kind === 'judge').map(s => s.item);
const r = await costReport(items);
line(`items judged:        ${r.items}`);
line(`paths:               decision-model=${r.perPath.decisionModel}  llm=${r.perPath.llm}  human=${r.perPath.human}`);
line(`cascade cost:        $${r.cascadeCostUsd}`);
line(`llm-only cost:       $${r.llmOnlyCostUsd}`);
line(`decision-model only: $${r.decisionModelOnlyCostUsd}`);
line(`cascade savings:     ${r.savingsPct}%`);

if (failures) { line(`\n${failures} scenario(s) missed expectations`); process.exit(1); }
line('\nall scenarios met expectations');
