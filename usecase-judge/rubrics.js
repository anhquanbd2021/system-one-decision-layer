// Judge rubric — the three questions the cascade asks about every
// candidate reply. Expressed as decision-model questions so the cheap
// model (lib/systemone.js) answers them first; the identical rubric is
// re-issued to the LLM judge when the cascade escalates.
//
// The local stand-in scorer is keyword-driven, so the criteria texts
// carry the vocabulary each option should match — the same role the
// label plays for a trained model. For the score rubric the level names
// lead with the canonical labels (implausible / mostly-ok / realistic)
// plus the signal words that distinguish them; with bare labels a
// keyword scorer would return uniform probabilities and nothing would
// ever stay on the decision-model tier.

export const RUBRIC = {
  politeness: {
    type: 'choice',
    instructions: 'How polite is the candidate reply?',
    criteria: {
      polite: 'warm courteous thanks welcome glad enjoy lovely kind friendly reply',
      neutral: 'plain matter-of-fact ordinary statement warmth',
      rude: 'impolite insulting dismissive curt hostile offensive idiot stupid whatever hurry dumb',
    },
  },
  realism: {
    type: 'score',
    instructions: 'How realistic are the prep steps the reply describes?',
    criteria: [
      'implausible fantasy impossible magic fictional',
      'mostly-ok plausible vague generic workable',
      'realistic concrete practical minutes seconds steps steam pour preheat',
    ],
  },
  friendliness: {
    type: 'noul',
    instructions: 'reply sounds friendly warm kind lovely glad happy thank welcome enjoy',
  },
};
