# System One decision layer — companion demo

Two self-contained use cases showing how a "System One" decision model
(Jev-style: `choice`/`score`/`noul` answers + calibrated confidence,
no text generation) sits in front of — and beside — an LLM in an agent
pipeline. Zero dependencies, Node 20+, no API keys.

Inspired by Thang Chung's
[coffeeshop-jev](https://github.com/thangchung/agent-engineering-experiment/tree/main/coffeeshop-jev)
(.NET + Aspire + Microsoft Agent Framework + OpenJev + gpt-5-nano).

## Layout

| Path | What |
|---|---|
| `lib/systemone.js` | Deterministic local stand-in for `POST /v1/systemone`. Same request/answer shape as the real API — it exists so the demo runs offline, not to fake a trained model. |
| `usecase-gate/` | **Gate + split** — the coffee-shop order pipeline: one decision-model call gates intent (`choice`) + on-menu (`noul`); a per-line `choice` routes each item to barista/kitchen with confidence bands (`act`/`confirm`/`review`). A deterministic extractor stands in for the LLM — in the real system that's the generative model's only job. |
| `usecase-judge/` | **Judge cascade + guard** — the decision model grades rubric items first; low-confidence answers escalate to a simulated expensive LLM judge; still-uncertain items flag a human. Plus an input hazard screen (`prompt_injection`, `abusive` nouls) in front of the pipeline. `costReport()` prints the cascade savings. |

## The pattern

The model supplies **typed signal + confidence**; **plain code** supplies
the policy (`decideGate`, `bandFor`, the escalation floor). No model output
ever bypasses a deterministic, unit-tested decision function.

## Run it

```text
npm test            # node --test "test/*.test.mjs"
npm run simulate    # both use cases end-to-end + cost report
npm start           # interactive lab on http://127.0.0.1:5050
npm run check       # tests + simulate
```

Live deployment: <https://system-one-decision-layer.onrender.com>
(Render free tier — cold start may take a minute.)

## Point it at a real model

```powershell
$env:SYSTEMONE_URL="https://api.typesafe.ai"   # hosted Jev
# or http://<lan-host>:<port>                  # local OpenJev server
npm run simulate
```

Unset `SYSTEMONE_URL` and everything runs against the local stand-in.
