// Test scenarios for the coffee-shop gate pipeline.

import { MENU } from './menu.js';

export const SCENARIOS = [
  {
    name: 'clean-order-delivered',
    text: '2 lattes and a croissant please',
    expect: {
      route: 'delivered',
      tickets: [
        { station: 'barista', lines: [{ qty: 2, name: 'latte' }] },
        { station: 'kitchen', lines: [{ qty: 1, name: 'croissant' }] },
      ],
      total: 12.25,
    },
  },
  {
    name: 'ask-menu',
    text: "what's on the menu?",
    expect: { route: 'menu' },
  },
  {
    name: 'off-topic-rejected',
    text: 'what is the weather like today?',
    expect: { route: 'reject' },
  },
  {
    name: 'item-not-on-menu',
    text: 'I want a latte and a pizza',
    expect: { route: 'clarify' },
  },
  {
    name: 'clarify-then-delivered',
    text: 'I want a latte and a pizza',
    answer: 'a croissant and a muffin instead',
    expect: { route: 'delivered' },
  },
  {
    name: 'typo-triggers-clarify',
    text: '2 lattes and a croisant',
    expect: { route: 'clarify' },
  },
  {
    name: 'multi-station-split',
    text: 'espresso and a bagel and a latte',
    expect: {
      route: 'delivered',
      tickets: [
        { station: 'barista', lines: [{ qty: 1, name: 'espresso' }, { qty: 1, name: 'latte' }] },
        { station: 'kitchen', lines: [{ qty: 1, name: 'bagel' }] },
      ],
    },
  },
];
