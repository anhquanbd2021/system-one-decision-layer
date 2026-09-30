import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { decideGate, bandFor } from '../usecase-gate/policy.js';
import { extract } from '../usecase-gate/extract.js';
import { runOrder } from '../usecase-gate/pipeline.js';

// ─── decideGate ────────────────────────────────────────────────────────
describe('decideGate', () => {
  it('returns menu for ask_menu intent', () => {
    assert.equal(
      decideGate({ intent: 'ask_menu', intentConfidence: 0.9, onMenu: 1 }),
      'menu',
    );
  });

  it('returns reject for off_topic intent', () => {
    assert.equal(
      decideGate({ intent: 'off_topic', intentConfidence: 0.8, onMenu: 0 }),
      'reject',
    );
  });

  it('returns accept when place_order with high confidence + on_menu', () => {
    assert.equal(
      decideGate({ intent: 'place_order', intentConfidence: 0.9, onMenu: 0.95 }),
      'accept',
    );
  });

  it('returns accept at exact boundary (both = 0.5)', () => {
    assert.equal(
      decideGate({ intent: 'place_order', intentConfidence: 0.5, onMenu: 0.5 }),
      'accept',
    );
  });

  it('returns clarify when intentConfidence < 0.5', () => {
    assert.equal(
      decideGate({ intent: 'place_order', intentConfidence: 0.49, onMenu: 0.9 }),
      'clarify',
    );
  });

  it('returns clarify when onMenu < 0.5', () => {
    assert.equal(
      decideGate({ intent: 'place_order', intentConfidence: 0.9, onMenu: 0.49 }),
      'clarify',
    );
  });

  it('returns reject for unknown intent', () => {
    assert.equal(
      decideGate({ intent: 'other', intentConfidence: 0.7, onMenu: 0.8 }),
      'reject',
    );
  });
});

// ─── bandFor ───────────────────────────────────────────────────────────
describe('bandFor', () => {
  it('returns act at confidence >= 0.85', () => {
    assert.equal(bandFor(0.85), 'act');
    assert.equal(bandFor(1.0), 'act');
  });

  it('returns confirm at confidence >= 0.6 (below 0.85)', () => {
    assert.equal(bandFor(0.6), 'confirm');
    assert.equal(bandFor(0.84), 'confirm');
  });

  it('returns review below 0.6', () => {
    assert.equal(bandFor(0.59), 'review');
    assert.equal(bandFor(0.0), 'review');
  });
});

// ─── extract ───────────────────────────────────────────────────────────
describe('extract', () => {
  it('parses a simple order with plural + singular', () => {
    const { lines, unmatched } = extract('2 lattes and a croissant');
    assert.equal(lines.length, 2);
    assert.equal(lines[0].name, 'latte');
    assert.equal(lines[0].qty, 2);
    assert.equal(lines[1].name, 'croissant');
    assert.equal(lines[1].qty, 1);
    assert.equal(unmatched.length, 0);
  });

  it('matches plural forms (muffins -> muffin)', () => {
    const { lines } = extract('3 muffins please');
    assert.equal(lines.length, 1);
    assert.equal(lines[0].name, 'muffin');
    assert.equal(lines[0].qty, 3);
  });

  it('matches one-edit typo via Levenshtein distance 1 (mufin -> muffin)', () => {
    const { lines } = extract('a mufin');
    assert.equal(lines.length, 1);
    assert.equal(lines[0].name, 'muffin');
  });

  it('matches one-edit typo via Levenshtein distance 1 (croisant -> croissant)', () => {
    const { lines } = extract('a croisant');
    assert.equal(lines.length, 1);
    assert.equal(lines[0].name, 'croissant');
  });

  it('rejects distance-2 typos (crosiant -> no match)', () => {
    const { lines, unmatched } = extract('a crosiant');
    assert.equal(lines.length, 0);
    assert.equal(unmatched.length, 1);
  });

  it('handles qty words (a/an/one/two)', () => {
    const { lines } = extract('one espresso and an americano');
    assert.equal(lines.length, 2);
    assert.equal(lines[0].name, 'espresso');
    assert.equal(lines[0].qty, 1);
    assert.equal(lines[1].name, 'americano');
    assert.equal(lines[1].qty, 1);
  });

  it('handles comma-separated items', () => {
    const { lines } = extract('latte, cappuccino, and 3 muffins');
    assert.equal(lines.length, 3);
    assert.equal(lines[0].name, 'latte');
    assert.equal(lines[1].name, 'cappuccino');
    assert.equal(lines[2].name, 'muffin');
    assert.equal(lines[2].qty, 3);
  });
});

// ─── runOrder end-to-end ──────────────────────────────────────────────
describe('runOrder', () => {
  function mockDecide(route) {
    let callCount = 0;
    return async (request) => {
      callCount++;
      const firstQ = Object.keys(request.questions)[0];

      if (firstQ === 'intent') {
        const map = {
          menu:      { intent: 'ask_menu',   conf: 0.95, onMenu: 0.9 },
          reject:    { intent: 'off_topic',  conf: 0.90, onMenu: 0.1 },
          clarify:   { intent: 'place_order',conf: 0.30, onMenu: 0.9 },
          delivered: { intent: 'place_order',conf: 0.95, onMenu: 0.99 },
        };
        const m = map[route];
        return {
          answers: {
            intent:  { type:'choice', choice: m.intent, confidence: m.conf,
                       probabilities:{ [m.intent]: m.conf } },
            on_menu: { type:'noul', probability: m.onMenu },
          },
        };
      }

      if (firstQ === 'station') {
        const state = String(request.state).toLowerCase();
        const isFood = /croissant|muffin|bagel|sandwich|cheesecake|banana/.test(state);
        const station = isFood ? 'kitchen' : 'barista';
        return {
          answers: {
            station: { type:'choice', choice: station, confidence: 0.92,
                       probabilities:{ barista: isFood ? 0.08 : 0.92,
                                       kitchen: isFood ? 0.92 : 0.08 } },
          },
        };
      }

      throw new Error('unexpected question type: ' + firstQ);
    };
  }

  it('routes menu request to menu', async () => {
    const result = await runOrder("what's on the menu?", { decide: mockDecide('menu') });
    assert.equal(result.route, 'menu');
    assert.ok(Array.isArray(result.menu));
    assert.ok(result.menu.includes('latte'));
  });

  it('routes off-topic to reject', async () => {
    const result = await runOrder('tell me a joke', { decide: mockDecide('reject') });
    assert.equal(result.route, 'reject');
  });

  it('routes ambiguous order to clarify (no answer)', async () => {
    const result = await runOrder('thingamajig', { decide: mockDecide('clarify') });
    assert.equal(result.route, 'clarify');
    assert.ok(result.question);
  });

  it('delivers a two-station order with correct stations', async () => {
    const result = await runOrder('2 lattes and a croissant', { decide: mockDecide('delivered') });
    assert.equal(result.route, 'delivered');
    assert.ok(Array.isArray(result.tickets));
    assert.ok(result.tickets.length >= 2);

    const stations = result.tickets.map(t => t.station);
    assert.ok(stations.includes('barista'));
    assert.ok(stations.includes('kitchen'));

    const barista = result.tickets.find(t => t.station === 'barista');
    assert.ok(barista.lines.some(l => l.name === 'latte' && l.qty === 2));

    const kitchen = result.tickets.find(t => t.station === 'kitchen');
    assert.ok(kitchen.lines.some(l => l.name === 'croissant' && l.qty === 1));
  });

  it('delivers a multi-station order (barista + kitchen)', async () => {
    const result = await runOrder('espresso and a bagel and a cheesecake', { decide: mockDecide('delivered') });
    assert.equal(result.route, 'delivered');

    const stations = result.tickets.map(t => t.station);
    assert.ok(stations.includes('barista'));
    assert.ok(stations.includes('kitchen'));

    const allNames = result.tickets.flatMap(t => t.lines.map(l => l.name));
    assert.ok(allNames.includes('espresso'));
    assert.ok(allNames.includes('bagel'));
    assert.ok(allNames.includes('cheesecake'));
  });
});
