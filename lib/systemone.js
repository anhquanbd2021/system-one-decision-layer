// Local stand-in for a "System One" decision-model API (Jev-style).
//
// Contract mirrors POST /v1/systemone: { state, questions } in,
// typed { answers } out. Three question types:
//   choice - pick one option, probability per option, confidence
//   noul   - yes/no, single probability
//   score  - ordered levels, weighted score + per-level probability
//
// This is NOT a trained model. It is a deterministic keyword/lexicon
// scorer that makes the demo runnable offline with zero dependencies.
// The decision *shape* (typed answers + calibrated-ish confidence) is
// what the use cases exercise — swap SYSTEMONE_URL to a real endpoint
// (hosted Jev or an OpenJev server) and the use-case code is unchanged.

const STOP = new Set(('a,an,the,is,are,was,were,do,does,did,to,of,in,on,for,' +
  'and,or,but,with,without,this,that,it,its,i,you,we,they,he,she,me,my,your,' +
  'what,which,who,how,when,where,why,please,pls,can,could,would,should,not,' +
  'no,yes,every,all,any,some,be,been,being,have,has,had').split(','));

export function tokenize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .split(/\s+/)
    .filter(t => t && !STOP.has(t));
}

function stateText(state) {
  if (typeof state === 'string') return state;
  try { return JSON.stringify(state); } catch { return String(state); }
}

// Overlap score between state tokens and an option's name+criteria text.
function optionScore(stateTokens, name, description) {
  const hay = new Set(stateTokens);
  const sig = tokenize(`${name} ${description ?? ''}`);
  let s = 0;
  for (const w of sig) {
    if (hay.has(w)) s += name.toLowerCase().split(/\s+/).includes(w) ? 3 : 1;
    // singular/plural naive match
    else if (hay.has(w.replace(/s$/, '')) || hay.has(w + 's')) s += 0.5;
  }
  return s;
}

function softmax(scores) {
  const max = Math.max(...scores);
  const exps = scores.map(s => Math.exp(s - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map(e => e / sum);
}

function answerChoice(stateTokens, question) {
  const entries = Object.entries(question.criteria ?? {});
  if (entries.length === 0) throw new Error('choice question needs criteria');
  const raw = entries.map(([name, desc]) => optionScore(stateTokens, name, desc));
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

// Noul: probability of "yes". Two local modes:
//  - default: overlap between state and the instruction's content words
//  - `keywords` (stand-in-only extension, ignored by the real API):
//    fraction of STATE content tokens covered by the keyword set —
//    used for questions like "is every item on the menu" where the
//    answer depends on state coverage, not instruction overlap.
function answerNoul(stateTokens, question) {
  let ratio;
  if (Array.isArray(question.keywords) && stateTokens.length) {
    const vocab = new Set(question.keywords.flatMap(k => tokenize(k)));
    const hits = stateTokens.filter(t =>
      vocab.has(t) || vocab.has(t + 's') || vocab.has(t.replace(/s$/, ''))).length;
    ratio = hits / stateTokens.length;
  } else {
    const sig = tokenize(question.instructions ?? '');
    const hay = new Set(stateTokens);
    const hits = sig.filter(w => hay.has(w) || hay.has(w + 's') || hay.has(w.replace(/s$/, ''))).length;
    ratio = sig.length ? hits / sig.length : 0;
  }
  // 0% overlap -> ~0.05, 100% -> ~0.95, monotonic
  const p = 0.05 + 0.9 * (1 - Math.exp(-3 * ratio));
  return { type: 'noul', probability: round(p) };
}

// Score: distribute probability mass across ordered levels by overlap.
function answerScore(stateTokens, question) {
  const levels = question.criteria ?? [];
  if (levels.length < 2) throw new Error('score question needs >=2 levels');
  const raw = levels.map(l => optionScore(stateTokens, l, l) + 0.1);
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

function round(x) { return Math.round(x * 1000) / 1000; }

export function decideLocal(request) {
  const stateTokens = tokenize(stateText(request.state));
  const answers = {};
  for (const [id, q] of Object.entries(request.questions ?? {})) {
    if (q.type === 'choice') answers[id] = answerChoice(stateTokens, q);
    else if (q.type === 'noul') answers[id] = answerNoul(stateTokens, q);
    else if (q.type === 'score') answers[id] = answerScore(stateTokens, q);
    else throw new Error(`unknown question type: ${q.type}`);
  }
  return { model: request.model ?? 'jev-local', answers };
}

// In-process client — same shape as the HTTP API.
export async function systemoneLocal(request) {
  return decideLocal(request);
}

// HTTP client. baseUrl like http://localhost:5050 or https://api.typesafe.ai
export function systemoneClient(baseUrl, fetchImpl = fetch) {
  return async (request) => {
    const res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/v1/systemone`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'jev-local', ...request }),
    });
    if (!res.ok) throw new Error(`systemone ${res.status}`);
    return res.json();
  };
}

// Resolve which backend a use case talks to:
//   SYSTEMONE_URL set  -> real endpoint (hosted Jev / OpenJev)
//   unset              -> local deterministic stand-in
export function systemone(env = process.env) {
  return env.SYSTEMONE_URL ? systemoneClient(env.SYSTEMONE_URL) : systemoneLocal;
}

// Optional: expose the local stand-in over real HTTP so the demo
// exercises the actual wire contract.
import { createServer } from 'node:http';
export function serveSystemOne(port = 5050, host = '127.0.0.1') {
  const server = createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/v1/systemone') {
      let body = '';
      for await (const c of req) body += c;
      try {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(decideLocal(JSON.parse(body))));
      } catch (e) {
        res.writeHead(400); res.end(String(e.message));
      }
    } else { res.writeHead(404); res.end(); }
  });
  return new Promise(r => server.listen(port, host, () => r(server)));
}
