// Jev-as-judge cascade — replicates the eval-judge pattern from
// coffeeshop-jev: the cheap decision model judges every item first; if
// ANY rubric answer lands below the confidence floor the item is
// re-judged by the expensive LLM judge; if the LLM is still uncertain
// (< 0.6) the item is flagged for human review. Plain code owns the
// policy; the models only supply typed signal + confidence.

import { systemone } from '../lib/systemone.js';
import { llmJudge, COST_USD, JEV_COST_USD } from './llm.js';
import { RUBRIC } from './rubrics.js';

const HUMAN_REVIEW_BELOW = 0.6;

// Confidence of an answer regardless of question type. Choice/score
// answers carry an explicit confidence; a noul's confidence is the
// probability of the side it lands on (p near 0.5 = least certain).
function confidenceOf(answer) {
  if (answer.confidence !== undefined) return answer.confidence;
  const p = answer.probability ?? 0.5;
  return Math.max(p, 1 - p);
}

function weakest(answers) {
  return Math.min(...Object.values(answers).map(confidenceOf));
}

function itemState(item) {
  if (typeof item === 'string') return item;
  return item?.reply ?? item?.input ?? String(item);
}

export async function judgeItem(item, { escalateBelow = 0.6 } = {}) {
  const state = itemState(item);
  const decide = systemone();
  const calls = { jev: 1, llm: 0 };

  const jev = await decide({ state, questions: RUBRIC });
  if (weakest(jev.answers) >= escalateBelow) {
    return { verdicts: jev.answers, path: 'decision-model', costUsd: JEV_COST_USD, calls };
  }

  calls.llm = 1;
  const llm = await llmJudge({ state, questions: RUBRIC });
  const path = weakest(llm.answers) < HUMAN_REVIEW_BELOW ? 'human' : 'llm';
  return { verdicts: llm.answers, path, costUsd: JEV_COST_USD + COST_USD, calls };
}
