# Ingredient mapping evaluation

In two three-pair comparisons on October 16, 2026, the retrieval/Clef path made
no wrong accepted matches on a 23-line synthetic recipe. The legacy mapper made
two wrong matches per run. Retrieval left one or two known ingredients for
manual review, used larger model inputs, and cost more. Keep rollout off by default.

## Method and scope

The labels live in
[`mapping-evaluation.fixtures.ts`](../src/lib/ingredients/mapping-evaluation.fixtures.ts).
The catalog contains 24 ingredients: 23 global/current-user-visible entries
and one other user's private ingredient. The recipe has 19 known identities,
two genuinely new ingredients, and two ambiguous lines. Eight lines resolve
deterministically; 11 known identities remain for AI evaluation.

The labels distinguish identity from substitutions, prefer owned Chickpeas over
the global duplicate, and require abstention for unspecified `cornflour` and
`white powder`. Other cases cover aliases, regional synonyms, preparation,
misspellings, and related ingredients such as soda/powder and coconut milk/cream.

Both paths ran in workerd with local D1 and real remote services in account
`4426cbeacb457b1ca1b865d6c36ced0d`, namespace `default`, instance
`quickpantry-ingredients-dev`. All 24 fixture documents had completed indexing.
The cross-user scope probe returned 6 chunks, with 0 foreign chunks. Four older
smoke items remained in the instance; D1 drops their unknown IDs, but they can
affect ranking. No production resources or remote D1 migrations were used.

The original comparison used three paired rounds with alternating execution
order, legacy first in rounds 1 and 3. Its results appear in the next three
sections. A second comparison appears under [Reproducibility check](#reproducibility-check).
AI Search cache/rewrite/reranking and model Gateway cache were disabled. Timing
covers a whole mapper call, including parsing, D1 work, retrieval, decisions,
and any name generation. It excludes setup/backfill/readiness, HTTP/auth/flag
lookup, UI rendering, and production rate-limit admission. Admission hooks were
allowed in the evaluator to compare the pipelines.

The retrieval configuration used Qwen3 embedding 0.6B, hybrid keyword/vector
indexing, 1,024-token chunks, 10% overlap, and `scope_key`/`ingredient_id` text
metadata. Initial search requests allow 20 chunks at threshold `0.1`, merged
into 6 verified candidates. Retry requests allow 30 chunks at `0.05`, merged
into at most 12. Clef uses match probability `0.6`, `none` probability `0.8`,
and winning margin `0.2`. `uncertain` abstains without retry or creation.

These thresholds, readable criteria, and shortlist sizes were tuned on the same
fixtures after an earlier stricter run left too many known items unresolved.
They are calibration results, not held-out validation. Clef-flash was not
benchmarked; the adapter uses the verified Clef decision API. A broader catalog,
held-out labels, and a separate model comparison are needed before choosing a
cheaper model or claiming general improvements.

## Quality

Each cell lists rounds 1 / 2 / 3. An accepted match means a suggested existing
ingredient, before user confirmation.

| Metric | Legacy Scout | Retrieval + Clef + Scout names |
| --- | --- | --- |
| Correct identity, including null abstentions, out of 23 | 21 / 21 / 21 | 22 / 22 / 21 |
| Correct workflow, including new names and ambiguous abstention, out of 23 | 20 / 20 / 20 | 22 / 22 / 21 |
| Accepted existing matches | 20 / 20 / 20 | 18 / 18 / 17 |
| Correct accepted matches | 18 / 18 / 18 | 18 / 18 / 17 |
| Accepted-match precision | 90% / 90% / 90% | 100% / 100% / 100% |
| Wrong matches per 23 lines | 2 / 2 / 2 | 0 / 0 / 0 |
| No existing match proposed, including new-name cases | 3 / 3 / 3 | 5 / 5 / 6 |
| Known identities left for manual review | 0 / 0 / 0 | 1 / 1 / 2 |
| Unnecessary creation suggestions | 1 / 1 / 1 | 0 / 0 / 0 |
| Clef-only accepted selection precision | n/a | 10/10 / 10/10 / 9/9 |
| Initial model-visible shortlist recall, unresolved known identities | n/a | 11/11 / 11/11 / 10/11 |
| Final model-visible shortlist recall after retry | n/a | 11/11 / 11/11 / 10/11 |
| AI status | succeeded / succeeded / succeeded | succeeded / succeeded / failed |

Legacy selected global Chickpeas for `garbanzo` instead of the owned duplicate,
mapped ambiguous `cornflour` to Cornstarch, and proposed creating `white powder`.
Both paths proposed names for dragon fruit powder and shiitake mushrooms.

Retrieval retained Cornstarch in the shortlist for `cornstartch` in the first two
rounds but abstained. The third round had a partial retrieval failure: that line
never reached Clef and had no candidates. `plain flour` also remained unresolved
despite a shortlist containing All-purpose flour. Other successful suggestions
survived. The failed run stays in the comparison.

Recall counts every unresolved labeled known identity, including a failed line
with no model input. An earlier summary incorrectly reported the degraded
round as 10/10 by excluding that line; the corrected value is 10/11. Recall here
measures candidates actually forwarded to the decision model. It is separate
from the model's accepted-selection precision.

## Latency, input size, and provider calls

| Metric | Legacy | Retrieval path |
| --- | --- | --- |
| Whole mapper time, milliseconds, rounds 1 / 2 / 3 | 17,685 / 19,955 / 16,850 | 14,279 / 21,398 / 19,640 |
| Median time | 17.685 seconds | 19.640 seconds |
| Total serialized model-input bytes per recipe | 2,345 / 2,345 / 2,345 | 19,208 / 19,208 / 20,473 |
| Clef input tokens | 0 | 6,255 / 6,255 / 6,813 |
| Scout input tokens | 507 / 507 / 507 | 201 / 201 / 201 |
| Scout output tokens | 319 / 319 / 319 | 56 / 68 / 68 |
| Model calls | 1 Scout | 2 Clef + 1 Scout |
| Hybrid search calls | 0 | 18 / 18 / 20 |

Individual Clef calls took 251 to 783 milliseconds, but retrieval and generation
dominated the whole pipeline. Three runs are too few to estimate tail latency.
The 23-entry visible catalog is particularly cheap for the legacy prompt;
per-question instructions and repeated candidate text make the bounded Clef
payload larger here. There is no demonstrated input-size reduction.

## Projected cost

Rates checked October 16, 2026:

- [Clef](https://developers.cloudflare.com/workers-ai/models/clef/): $0.24 per million input tokens, no output charge.
- [Scout](https://developers.cloudflare.com/workers-ai/models/llama-4-scout-17b-16e-instruct/): $0.27 per million input and $0.85 per million output tokens.
- [AI Search](https://developers.cloudflare.com/ai-search/platform/limits-pricing/): billing starts November 1, 2026. Beyond included usage, hybrid queries are $0.75 per 1,000, base ingestion $0.75 per million tokens, storage $2 per GB-month.

These are gross list-price projections before included usage, not measured
invoice charges. AI Search includes its Workers AI embedding/reranking usage;
do not add a separate Qwen embedding charge. Query rewriting and AI Search
generation are off; Scout name generation is counted separately.

| USD per 23-line recipe | Legacy round 1 / 2 / 3 | Retrieval round 1 / 2 / 3 |
| --- | --- | --- |
| Models, including new-name generation | .00040804 / .00040804 / .00040804 | .00160307 / .00161327 / .00174719 |
| Projected retrieval | 0 / 0 / 0 | .01350000 / .01350000 / .01500000 |
| Projected serving subtotal | .00040804 / .00040804 / .00040804 | .01510307 / .01511327 / .01674719 |

Median model cost was about 3.95 times legacy, and median projected serving cost
was about 37.04 times legacy. Search projections count started provider calls,
including attempts in the degraded run; actual treatment of failed requests
may differ. Missing usage from failed model calls would make model estimates
incomplete; all model calls in this recorded comparison returned usage.

The 24 fixture source documents total 1,068 UTF-8 bytes. All report one chunk.
Twenty-three chunk texts were verified through the Items API; Butter's chunks
endpoint repeatedly returned provider error `7017`, so its text was inferred
from the generated document. On that basis, trimmed chunk text totals 1,044
bytes and an estimated **245 `cl100k_base` tokens**, tokenized with tiktoken
0.14.0. Projected one-time ingestion is **$0.00018375**. Overlap does not repeat
these short one-chunk documents, but would add tokens for longer documents.

Source bytes alone imply $0.000002136 per month at the storage rate. This is
only a source-byte floor. Full billed storage/index/metadata footprint was not
measured, and instance R2 counters did not reconcile with the fixture set.
Serving subtotals also exclude Worker CPU, D1, upload/reindex repetitions, and
amortized storage. Full lifecycle cost is therefore incomplete. It cannot be
called cheaper when even the measured serving subtotal is higher.

Monthly AI Search included usage is account-wide: 5 million ingestion tokens,
10 GB-month storage, 1,000 semantic queries, and 1,000 full-text queries. Actual
incremental charges depend on the account's other workloads and Workers AI
allowances.

## Reproducibility check

After adding the opt-in evaluator, `pnpm test:ingredient-eval` repeated the same
three alternating pairs against the same development instance. Both tests
passed in 269.66 seconds. All 24 fixture items completed indexing; the scope
probe again returned 6 chunks and 0 foreign chunks.

Each cell lists rounds 1 / 2 / 3, except median time. All six mapper calls
reported AI status `succeeded`; no search calls failed and no model usage was
missing.

| Metric | Legacy Scout | Retrieval + Clef + Scout names |
| --- | --- | --- |
| Correct identity out of 23 | 21 / 21 / 21 | 22 / 22 / 22 |
| Correct workflow out of 23 | 20 / 20 / 20 | 22 / 22 / 22 |
| Correct / accepted existing matches | 18/20 / 18/20 / 18/20 | 18/18 / 18/18 / 18/18 |
| Wrong accepted matches | 2 / 2 / 2 | 0 / 0 / 0 |
| Known identities left for manual review | 0 / 0 / 0 | 1 / 1 / 1 |
| Unnecessary creation suggestions | 1 / 1 / 1 | 0 / 0 / 0 |
| Clef-only accepted selection precision | n/a | 10/10 / 10/10 / 10/10 |
| Initial / final model-visible shortlist recall | n/a | 11/11 / 11/11 in each round |
| Whole mapper time, milliseconds | 12,026 / 11,520 / 17,060 | 17,360 / 16,372 / 15,630 |
| Median mapper time | 12.026 seconds | 16.372 seconds |
| Total serialized model-input bytes | 2,345 / 2,345 / 2,345 | 19,208 / 19,208 / 19,208 |
| Clef input tokens | 0 / 0 / 0 | 6,255 / 6,255 / 6,255 |
| Scout input / output tokens | 507/319 / 507/319 / 507/319 | 201/68 / 201/68 / 201/68 |
| Model calls | 1 / 1 / 1 | 3 / 3 / 3 |
| Hybrid search calls | 0 / 0 / 0 | 18 / 18 / 18 |
| Model cost, USD | .00040804 / .00040804 / .00040804 | .00161327 / .00161327 / .00161327 |
| Projected retrieval cost, USD | 0 / 0 / 0 | .01350000 / .01350000 / .01350000 |
| Projected serving subtotal, USD | .00040804 / .00040804 / .00040804 | .01511327 / .01511327 / .01511327 |

This repeats the tuned fixtures, not independent validation. It confirms the
same cost and coverage tradeoff, with a 3.95-times model-cost ratio and a
37.04-times projected serving-cost ratio. It does not replace the original
comparison or its degraded round. Ingestion and storage caveats above still apply.

## Reproduction and remaining gaps

Follow [development setup](ingredient-mapping.md#development-setup), then run
`pnpm test:ingredient-eval`. The opt-in integration test prints synthetic
catalog, scope, summary, and per-case/request records. It performs the same
three alternating pairs and corrects recall for missed lines. It does not fetch
remote chunk bodies as a prerequisite to inference, so a chunks endpoint outage
does not discard otherwise usable matching results.

Default unit tests separately exercise missing/stale index results, foreign or
deleted IDs, owner changes during inference, request timeouts/limits, account
deletion, durable retries, and manual review. Live API responses are variable,
so new runs need not reproduce identical probabilities or timings.

The fixture still exposes an existing parser issue: `1½` parses as `5.5`, and
`ml` currently becomes `COUNT`. Both compared paths preserve those existing
outputs; identity/workflow scores do not grade quantity/unit correctness.
Parser repairs are outside this change. Before broader rollout, use held-out
recipes, a representative larger clean index, and reconciled storage/usage
measurements. The current evidence supports a narrower claim: fewer wrong
suggestions on these labeled examples, with more review and higher cost.
