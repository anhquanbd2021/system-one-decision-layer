# Demo contract — read before writing code

Zero-dependency Node 20+ (`.mjs` ES modules). No npm packages. No network
calls required at runtime — `lib/systemone.js` is a deterministic local
stand-in for a Jev-style decision-model endpoint.

## The shared library (already implemented — do not modify)

`lib/systemone.js` exports:

- `systemone(env?) -> async (request) => { model, answers }`
  Resolves the backend: `SYSTEMONE_URL` set -> real HTTP endpoint;
  unset -> local stand-in. **Always call through this**, never import
  the scorer directly, so the use case works unchanged against a real
  Jev/OpenJev server.
- `tokenize(text)`, `decideLocal(request)`, `systemoneClient(baseUrl)`,
  `serveSystemOne(port, host)` for tests/tooling.

Request shape (mirrors `POST /v1/systemone`):

```js
await decide({
  state: "2 lattes and a croissant please",        // string or JSON-able
  questions: {
    intent:  { type: 'choice', instructions: 'What does the customer want?',
               criteria: { place_order: 'names items to buy',
                           ask_menu: 'asks what is available',
                           off_topic: 'not about ordering' } },
    on_menu: { type: 'noul', instructions: 'Is every item on the menu?' },
    rush:    { type: 'score', instructions: 'How urgent?',
               criteria: ['relaxed', 'normal', 'hurry'] },
  },
});
```

Answer shape:

```js
{
  answers: {
    intent:  { type:'choice', choice:'place_order',
               probabilities:{ place_order:0.9, ... }, confidence:0.9 },
    on_menu: { type:'noul', probability:0.97 },
    rush:    { type:'score', score:2.1, probabilities:{...}, confidence:0.7 },
  }
}
```

## The pattern being demonstrated

A decision model supplies **typed signal + confidence**; **plain code**
supplies the policy. Never let the model's output bypass a deterministic
policy function — that separation is the point of the demo.

## Your directory

Write ONLY inside your assigned `usecase-*` directory plus ONE test file
`test/<name>.test.mjs`. Do not edit `lib/`, `package.json`, `README.md`,
`CONTRACT.md`, `scripts/`, or the other use case's files.

## Test rules

- `node:test` + `node:assert/strict`, runnable via
  `node --test "test/<name>.test.mjs"` from the `demo/` directory.
- Deterministic — no randomness, no timers that flake, no network.
- Cover the policy table (each branch) and the confidence-band edges.
