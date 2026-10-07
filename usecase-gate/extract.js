// Deterministic stand-in for the LLM item-extraction step.
//
// In the real coffeeshop-jev architecture a small LLM (e.g. gpt-5-nano)
// parses free-text orders into structured lines.  This demo replaces
// that call with a deterministic parser that tolerates plural/singular
// forms and one-edit typos (Levenshtein distance <= 1).

import { MENU } from './menu.js';

/** Levenshtein distance (iterative, two-row). */
function lev(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1);
  const curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,      // insert
        prev[j] + 1,          // delete
        prev[j - 1] + cost,   // replace
      );
    }
    prev.splice(0, prev.length, ...curr);
  }
  return prev[b.length];
}

const MENU_KEYS = Object.keys(MENU);

/**
 * Normalise a token: lowercase, collapse underscores/hyphens to spaces,
 * strip trailing 's' for plural matching.
 */
function normalise(token) {
  return token.toLowerCase().replace(/[_-]+/g, ' ').replace(/s$/, '');
}

/**
 * Find the best MENU key for a token.  Accepts exact (after normalise),
 * singular, plural, or one-edit-distant match.  Returns null if nothing
 * within distance 1.
 */
function matchItem(token) {
  const norm = normalise(token);

  // exact match (after normalise)
  for (const key of MENU_KEYS) {
    if (normalise(key) === norm) return key;
  }

  // plural/singular
  for (const key of MENU_KEYS) {
    const n = normalise(key);
    if (n + 's' === norm || norm + 's' === n) return key;
  }

  // one-edit (Levenshtein <= 1)
  let best = null;
  let bestDist = Infinity;
  for (const key of MENU_KEYS) {
    const d = lev(norm, normalise(key));
    if (d <= 1 && d < bestDist) {
      bestDist = d;
      best = key;
    }
  }
  return best;
}

/**
 * Parse an order string into structured lines.
 *
 * Handles patterns like:
 *   "2 lattes and a croissant"
 *   "one matcha latte please"
 *   "latte, cappuccino, and 3 muffins"
 *
 * @param {string} text
 * @returns {{ lines: Array<{qty:number, name:string}>, unmatched: string[] }}
 */
export function extract(text) {
  const lines = [];
  const unmatched = [];

  // Split on commas, " and ", ampersand, plus word boundaries around "a"/"an"/"one"
  // We use a regex that captures numeric prefixes and qty-words.
  const qtyWords = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5,
                     six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

  // Tokenise the full text into segments separated by "and", commas, ampersand
  const segments = text
    .toLowerCase()
    .replace(/&/g, ' and ')
    .split(/\s+and\s+|,/)
    .map(s => s.trim())
    .filter(Boolean);

  for (const seg of segments) {
    // Extract leading quantity (digits or word)
    let qty = 1;
    let rest = seg;

    const digitMatch = rest.match(/^(\d+)\s+/);
    if (digitMatch) {
      qty = parseInt(digitMatch[1], 10);
      rest = rest.slice(digitMatch[0].length);
    } else {
      for (const [w, n] of Object.entries(qtyWords)) {
        const re = new RegExp(`^${w}\\s+`);
        if (re.test(rest)) {
          qty = n;
          rest = rest.replace(re, '');
          break;
        }
      }
    }

    // Strip filler words
    rest = rest.replace(/\bplease\b|\bpls\b|\bjust\b|\balso\b|\bwant\b|\blike\b|\bget\b|\bi'?ll have\b/g, '').trim();

    // Try to match remaining tokens to a menu item
    const tokens = rest.split(/\s+/).filter(Boolean);
    let matched = false;

    if (tokens.length > 0) {
      // Try progressively: full phrase, then individual tokens from the end
      for (let start = 0; start < tokens.length; start++) {
        const candidate = tokens.slice(start).join(' ');
        const item = matchItem(candidate);
        if (item) {
          lines.push({ qty, name: item });
          matched = true;
          break;
        }
      }

      if (!matched) {
        // Try each token individually
        for (const tok of tokens) {
          const item = matchItem(tok);
          if (item) {
            lines.push({ qty, name: item });
            matched = true;
            break;
          }
        }
      }
    }

    if (!matched) {
      unmatched.push(seg);
    }
  }

  return { lines, unmatched };
}
