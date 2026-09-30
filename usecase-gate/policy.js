// Pure policy functions — no model calls, no side-effects.

/**
 * decideGate — map System One answers to a routing decision.
 *
 * @param {Object} params
 * @param {string}  params.intent            — choice answer: 'place_order'|'ask_menu'|'off_topic'|'other'
 * @param {number}  params.intentConfidence  — confidence from the choice answer
 * @param {number}  params.onMenu            — noul probability (0-1)
 * @returns {'menu'|'accept'|'clarify'|'reject'}
 */
export function decideGate({ intent, intentConfidence, onMenu }) {
  if (intent === 'ask_menu') return 'menu';
  if (intent === 'off_topic') return 'reject';
  if (intent === 'place_order') {
    if (intentConfidence >= 0.5 && onMenu >= 0.5) return 'accept';
    return 'clarify';
  }
  // 'other' or below thresholds
  return 'reject';
}

/**
 * bandFor — map a confidence score to a human-review band.
 *
 * @param {number} confidence  — 0..1
 * @returns {'act'|'confirm'|'review'}
 */
export function bandFor(confidence) {
  if (confidence >= 0.85) return 'act';
  if (confidence >= 0.6) return 'confirm';
  return 'review';
}
