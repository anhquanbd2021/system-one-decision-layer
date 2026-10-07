// Pipeline: gate + extract + split — coffee-shop order orchestrator.
//
// Uses systemone() from lib/systemone.js as the decision backend.
// Accepts an optional {decide} override for testing.

import { systemone } from '../lib/systemone.js';
import { MENU } from './menu.js';
import { decideGate, bandFor } from './policy.js';
import { extract } from './extract.js';

export const GATE_CRITERIA = {
  intent: {
    type: 'choice',
    instructions: 'What does the customer want?',
    // Criteria texts carry the vocabulary each option should match —
    // the same role the label plays for a trained model. The local
    // stand-in scorer is keyword-driven; a real Jev/OpenJev endpoint
    // reads the descriptions semantically instead.
    criteria: {
      place_order: 'orders buys wants food drink latte espresso cappuccino americano matcha croissant muffin bagel sandwich cheesecake banana bread',
      ask_menu:    'asks menu what available prices options list offer',
      off_topic:   'weather news sports politics unrelated question not ordering',
    },
  },
  on_menu: {
    type: 'noul',
    instructions: 'Is every item the customer mentions on the menu?',
    // stand-in-only extension: coverage check against the catalog
    // vocabulary (real Jev answers this from the state + context)
    keywords: [...Object.keys(MENU), 'latte', 'espresso', 'coffee', 'drink', 'food'],
  },
};

export const SPLIT_CRITERIA = {
  station: {
    type: 'choice',
    instructions: null, // set dynamically per item
    criteria: {
      barista: 'latte espresso cappuccino americano matcha coffee drink beverage',
      kitchen: 'croissant muffin bagel sandwich cheesecake banana bread pastry food',
      other:   'anything else not food drink',
    },
  },
};

/**
 * Run an order through the full gate → extract → split pipeline.
 *
 * @param {string} text            — customer utterance
 * @param {Object} [opts]
 * @param {string} [opts.answer]   — clarification answer (if re-prompting)
 * @param {Function} [opts.decide] — override decision function (defaults to systemone())
 * @returns {Object}               — route result with trace
 */
export async function runOrder(text, { answer, decide } = {}) {
  const decideFn = decide ?? systemone();
  const trace = [];

  async function runGate(stateText) {
    const resp = await decideFn({
      state: stateText,
      questions: {
        intent: { ...GATE_CRITERIA.intent },
        on_menu: { ...GATE_CRITERIA.on_menu },
      },
    });
    const { intent, on_menu } = resp.answers;
    const route = decideGate({
      intent: intent.choice,
      intentConfidence: intent.confidence,
      onMenu: on_menu.probability,
    });
    return { intent, on_menu, route };
  }

  // ── STEP 1: GATE ──────────────────────────────────────────────────────
  const stateText = answer ? `${text} ${answer}` : text;
  const gate = await runGate(stateText);
  trace.push({ step: 'gate', detail: `intent=${gate.intent.choice} conf=${gate.intent.confidence} on_menu=${gate.on_menu.probability} -> ${gate.route}` });

  // ── STEP 2: BRANCH ────────────────────────────────────────────────────
  if (gate.route === 'menu') {
    trace.push({ step: 'route', detail: 'menu' });
    return { route: 'menu', menu: Object.keys(MENU), trace };
  }

  if (gate.route === 'reject') {
    trace.push({ step: 'route', detail: 'reject' });
    return { route: 'reject', trace };
  }

  if (gate.route === 'clarify' && !answer) {
    trace.push({ step: 'route', detail: 'clarify' });
    return {
      route: 'clarify',
      question: 'Could you clarify what you\'d like to order? Please list specific items from our menu.',
      trace,
    };
  }

  if (gate.route === 'clarify' && answer) {
    // Re-run gate once with original + answer combined
    trace.push({ step: 're-gate', detail: `re-running with answer: ${answer}` });
    const reGate = await runGate(stateText);
    trace.push({ step: 're-gate-result', detail: `intent=${reGate.intent.choice} conf=${reGate.intent.confidence} -> ${reGate.route}` });

    if (reGate.route !== 'accept') {
      trace.push({ step: 'route', detail: 'reject-after-clarify' });
      return { route: 'reject', trace };
    }
    // Fall through to extract
  }

  // ── STEP 3: EXTRACT ───────────────────────────────────────────────────
  const { lines, unmatched } = extract(stateText);
  trace.push({ step: 'extract', detail: `matched=${lines.length} unmatched=${unmatched.length}` });

  if (unmatched.length > 0) {
    trace.push({ step: 'route', detail: 'clarify-unmatched' });
    return {
      route: 'clarify',
      question: lines.length === 0
        ? 'I couldn\'t match any items from our menu. Could you rephrase your order?'
        : `I couldn't find "${unmatched.join(', ')}" on our menu — what would you like instead?`,
      trace,
    };
  }

  // ── STEP 4: SPLIT — station routing per line ──────────────────────────
  const stationLines = {};

  for (const line of lines) {
    const splitResp = await decideFn({
      state: `${line.name} ${line.qty}`,
      questions: {
        station: {
          type: 'choice',
          instructions: `Which station prepares ${line.name}?`,
          criteria: { ...SPLIT_CRITERIA.station.criteria },
        },
      },
    });

    const stationAnswer = splitResp.answers.station;
    const station = stationAnswer.choice;
    const flag = bandFor(stationAnswer.confidence);

    trace.push({ step: 'split', detail: `${line.name} -> ${station} conf=${stationAnswer.confidence} flag=${flag}` });

    if (!stationLines[station]) stationLines[station] = [];
    stationLines[station].push({
      qty: line.qty,
      name: line.name,
      price: MENU[line.name]?.price ?? 0,
      flag,
    });
  }

  // ── STEP 5: DELIVER — fan out into station tickets ────────────────────
  const tickets = [];
  const flags = { confirm: 0, review: 0 };

  for (const [station, stLines] of Object.entries(stationLines)) {
    tickets.push({ station, lines: stLines });
    for (const l of stLines) {
      if (l.flag === 'confirm') flags.confirm++;
      if (l.flag === 'review') flags.review++;
    }
  }

  const total = lines.reduce((sum, l) => sum + l.qty * (MENU[l.name]?.price ?? 0), 0);

  trace.push({ step: 'deliver', detail: `${tickets.length} tickets total=$${total.toFixed(2)}` });

  return {
    route: 'delivered',
    tickets,
    total: Math.round(total * 100) / 100,
    flags,
    trace,
  };
}
