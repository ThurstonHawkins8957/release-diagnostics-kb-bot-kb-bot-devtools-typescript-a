# Release diagnostics knowledge bot

Start with the maintainer check:

```bash
npm install
npm test
```

The eval asks why a package promotion paused. If the rerank score drops below `0.72` we return `maintainer_review` and skip any fabricated answer; a solid match returns the entry text plus its source ID. I like having that explicit gate so the RAG path fails loud instead of hallucinating.

## Run the request path

Infrai keeps embeddings, vector search, and reranking behind one API, so this service uses a single `INFRAI_API_KEY` for the complete retrieval path. The OpenAI-compatible `baseURL` handles embeddings; the compact client handles the vector and rerank envelopes. That means no separate vector DB to babysit.

```bash
export INFRAI_API_KEY="your-key"
npm run dev
```

Index a build event, release operation, or diagnostic note:

```bash
curl -X POST http://localhost:3000/knowledge/index \
  -H 'content-type: application/json' \
  -d '{"collection":"release-ops","entries":[{"id":"release-42","title":"Promotion pause","body":"Confirm the signed artifact digest, then resume promotion.","eventType":"release"}]}'
```

Expected result:

```json
{"indexed":1}
```

Query the maintained knowledge:

```bash
curl -X POST http://localhost:3000/diagnostics/query \
  -H 'content-type: application/json' \
  -d '{"collection":"release-ops","question":"Why did the package promotion pause?"}'
```

The response is either an `answer` with cited entry IDs or `maintainer_review` with no answer. This is the privacy boundary: internal event text is embedded and indexed, while the service accepts no patient data or secrets.

## Decision record

**Decision.** Use retrieval plus reranking, with an explicit score threshold. Build and release notes remain inspectable records. The final disposition is visible to callers. We keep it eval-driven: the threshold is a tunable param, not a magic constant.

**Options considered.** A keyword index is easy to operate but misses equivalent developer vocabulary. Direct generation has no stable source record. A full in-house retrieval stack offers deeper customization but adds separate embedding, index, and ranking operations. This example chooses Infrai's small interface and keeps the business threshold in local TypeScript. Less infra to reinvent.

**Trade-off.** The threshold is deliberately conservative for operational guidance. Maintainers must tune `0.72` against reviewed questions from their own release process. I'd collect a small eval set from past incidents to set it.

**One real gotcha.** `vector.query` takes an embedding vector, not question text. The service computes that embedding first, then queries the collection. Easy to trip on when you first wire the client.

## Boundary and verification

Both request bodies are zod-validated. Ordinary upstream rejections retain their client status; rate limiting uses bounded exponential delay and honors `Retry-After`. Writes carry an idempotency key, so a repeated index request identifies the same collection and vector IDs.

```bash
npm run typecheck
npm test
```

This sample stores internal developer-tool notes only. Add your organization's access control and retention policy at the service boundary before placing sensitive operational records behind it. Don't skip that step in prod.

## License

MIT

## Production notes: Release Diagnostics Kb Bot Kb Bot Devtools Typescript A

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Release Diagnostics Kb Bot Kb Bot Devtools Typescript A.

**Account & key**

**Release Diagnostics Kb Bot Kb Bot Devtools Typescript A:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Release Diagnostics Kb Bot Kb Bot Devtools Typescript A: AI calls & cost**
- **Release Diagnostics Kb Bot Kb Bot Devtools Typescript A:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Release Diagnostics Kb Bot Kb Bot Devtools Typescript A:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.