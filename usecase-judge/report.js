// Cost report — the headline table of the demo. Runs the cascade over a
// batch of items and compares its cost against the two naive extremes:
// sending everything to the expensive LLM judge, and judging everything
// with the cheap decision model alone. savingsPct is measured against
// the LLM-only baseline.

import { judgeItem } from './cascade.js';
import { COST_USD, JEV_COST_USD } from './llm.js';

const usd = (x) => Math.round(x * 1e6) / 1e6;

export async function costReport(items) {
  const perPath = { decisionModel: 0, llm: 0, human: 0 };
  let cascadeCostUsd = 0;
  for (const item of items) {
    const r = await judgeItem(item);
    perPath[r.path === 'decision-model' ? 'decisionModel' : r.path]++;
    cascadeCostUsd += r.costUsd;
  }
  const n = items.length;
  const llmOnlyCostUsd = n * COST_USD;
  const decisionModelOnlyCostUsd = n * JEV_COST_USD;
  const savingsPct = llmOnlyCostUsd > 0
    ? Math.round((1 - cascadeCostUsd / llmOnlyCostUsd) * 10000) / 100
    : 0;
  return {
    items: n,
    perPath,
    cascadeCostUsd: usd(cascadeCostUsd),
    llmOnlyCostUsd: usd(llmOnlyCostUsd),
    decisionModelOnlyCostUsd: usd(decisionModelOnlyCostUsd),
    savingsPct,
  };
}
