// Simulated "expensive LLM judge" — stands in for e.g. gpt-5-nano on the
// escalation tier of the eval-judge cascade. Deterministic (no network)
// so the demo and tests stay stable.
//
// It returns the same answer shape as lib/systemone.js but scores
// differently — heavier keyword weights and a sharper (lower
// temperature) softmax — so it commits harder than the cheap decision
// model whenever there is *some* evidence, and still abstains (low
// confidence) when there is none, which is what flags an item for human
// review.

import { tokenize } from '../lib/systemone.js';

export const COST_USD = 0.0004;     // per LLM judge call
export const JEV_COST_USD = 0.00004; // per decision-model call (cost tables)

function stateText(state) {
  if (typeof state === 'string') return state;
  try { return JSON.stringify(state); } catch { return String(state); }
}

// Different weights than the lib scorer: name hit 5, criteria hit 2,
// near-plural hit 0.8 (lib uses 3 / 1 / 0.5).
function optionScore(stateTokens, name, description) {
  const hay = new Set(stateTokens);
  const sig = tokenize(`${name} ${description ?? ''}`);
  const nameWords = new Set(name.toLowerCase().split(/\s+/));
  let s = 0;
  for (const w of sig) {
    if (hay.has(w)) s += nameWords.has(w) ? 5 : 2;
    else if (hay.has(w.replace(/s$/, '')) || hay.has(w + 's')) s += 0.8;
  }
  return s;
}

function softmax(scores) {
  const max = Math.max(...scores);
  const exps = scores.map(s => Math.exp(s - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map(e => e / sum);
}

function round(x) { return Math.round(x * 1000) / 1000; }

function answerChoice(stateTokens, question) {
  const entries = Object.entries(question.criteria ?? {});
  if (entries.length === 0) throw new Error('choice question needs criteria');
  // sharper softmax than the lib scorer: raw scores doubled.
  const raw = entries.map(([name, desc]) => 2 * optionScore(stateTokens, name, desc));
  const probs = softmax(raw);
  const probabilities = {};
  let best = 0;
  entries.forEach(([name], i) => {
    probabilities[name] = round(probs[i]);
    if (probs[i] > probs[best]) best = i;
  });
  return {
    type: 'choice',
    choice: entries[best][0],
    probabilities,
    confidence: round(probs[best]),
  };
}

function answerNoul(stateTokens, question) {
  const sig = tokenize(question.instructions ?? '');
  const hay = new Set(stateTokens);
  const hits = sig.filter(w => hay.has(w) || hay.has(w + 's') || hay.has(w.replace(/s$/, ''))).length;
  const ratio = sig.length ? hits / sig.length : 0;
  // steeper curve than the lib scorer: 0.02 + 0.96*(1 - e^-4r)
  const p = 0.02 + 0.96 * (1 - Math.exp(-4 * ratio));
  return { type: 'noul', probability: round(p) };
}

function answerScore(stateTokens, question) {
  const levels = question.criteria ?? [];
  if (levels.length < 2) throw new Error('score question needs >=2 levels');
  // smaller prior mass (0.05 vs 0.1) and the same sharper softmax.
  const raw = levels.map(l => 2 * (optionScore(stateTokens, l, l) + 0.05));
  const probs = softmax(raw);
  const probabilities = {};
  let score = 0;
  levels.forEach((name, i) => {
    probabilities[name] = round(probs[i]);
    score += (i + 1) * probs[i];
  });
  return {
    type: 'score',
    score: round(score),
    probabilities,
    confidence: round(Math.max(...probs)),
  };
}

export async function llmJudge(request) {
  const stateTokens = tokenize(stateText(request.state));
  const answers = {};
  for (const [id, q] of Object.entries(request.questions ?? {})) {
    if (q.type === 'choice') answers[id] = answerChoice(stateTokens, q);
    else if (q.type === 'noul') answers[id] = answerNoul(stateTokens, q);
    else if (q.type === 'score') answers[id] = answerScore(stateTokens, q);
    else throw new Error(`unknown question type: ${q.type}`);
  }
  return { model: request.model ?? 'llm-judge-sim', answers };
}
