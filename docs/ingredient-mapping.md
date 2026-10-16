# Ingredient matching

Configure and test the optional AI Search retrieval and Clef ingredient mapper.
The [evaluation report](ingredient-mapping-evaluation.md) records its measured
tradeoffs. Production configuration starts disabled, with no ingredient instance.

## Matching behavior

Parsing, exact names, learned aliases, and high-confidence fuzzy matches run
first. Current recipe mappings bypass suggestions. Only unresolved, nonblank
lines enter the retrieval path:

1. Search global/current-user ingredients with hybrid retrieval. Merge fuzzy
   candidates, recheck IDs and ownership in D1, prefer the user's record on name
   collisions, and send at most 6 candidates per line to Clef.
2. Clef chooses one supplied candidate, `none`, or `uncertain`. A match requires
   probability at least `0.6` and a winning margin at least `0.2`. `none` requires
   probability at least `0.8` and the same margin. These values are tuned on the
   small labeled fixture set, not calibrated guarantees.
3. Retry `none` and low-confidence decisions once with broader retrieval, up to
   12 candidates. A winning `uncertain` decision stays unresolved without retry.
4. Only a successful retry that confidently returns `none` permits Scout to
   suggest a new name. Scout receives an empty catalog. Failed retrieval,
   malformed answers, and unresolved ambiguity remain for manual review.

Search prefilters `scope_key` to `global` or `user:<current-user-id>`. The server
validates result keys/metadata, reloads names and aliases from D1, and rechecks
selected ingredients after inference. Search results alone never authorize an
ingredient. Requests disable AI Search caching, query rewriting, and reranking;
Clef requests bypass Gateway cache. Scout retains its shared one-hour Gateway
cache policy; the evaluator overrides it to measure uncached calls. The review
screen preserves current mappings and edits, and Apply retains ownership and
recipe-version checks.

## Development setup

Prerequisites are the [normal local setup](../README.md#local-development), a
Wrangler login with access to the configured Cloudflare account, Workers AI,
the `default` AI Search namespace, and the existing `pantry-plan` AI Gateway.
Use the repository's installed Wrangler through pnpm.

1. Confirm the account and inspect the development instance:

   ```sh
   pnpm exec wrangler whoami
   pnpm exec wrangler ai-search get quickpantry-ingredients-dev --namespace default --json
   ```

   The configured account is `4426cbeacb457b1ca1b865d6c36ced0d`. If the instance
   does not exist, create it with the required text metadata fields:

   ```sh
   pnpm exec wrangler ai-search create quickpantry-ingredients-dev \
     --namespace default --type builtin \
     --embedding-model @cf/qwen/qwen3-embedding-0.6b \
     --chunk-size 1024 --chunk-overlap 10 \
     --hybrid-search true --cache false --reranking false \
     --custom-metadata scope_key:text --custom-metadata ingredient_id:text
   ```

   Keep this instance separate from `quickpantry-recipes-dev`. Existing
   instances must already define `scope_key` and `ingredient_id` as text fields.
   See [AI Search Wrangler commands](https://developers.cloudflare.com/ai-search/wrangler-commands/)
   for schema changes not exposed by the installed `update` command.

2. Set these values in your ignored `.dev.vars`:

   ```dotenv
   INGREDIENT_AI_SEARCH_INSTANCE="quickpantry-ingredients-dev"
   INGREDIENT_CLEF_MAPPING_ENABLED="true"
   ```

   `INGREDIENT_CLEF_MAPPING_ENABLED` is the fallback for the Flagship flag
   `ingredient-clef-mapping`. Explicit flag targeting overrides the fallback.
   Flag evaluation uses the signed-in user's `email` and `userId`; a flag error
   selects the legacy path. An enabled path with a missing ingredient binding
   preserves deterministic suggestions and reports AI as unavailable.

3. Prepare local D1 and generated binding types, then start the application:

   ```sh
   pnpm db:migrate:local
   pnpm cf-typegen
   pnpm dev
   ```

   The default URL is `http://localhost:4321`. If another checkout uses that
   port, use `pnpm exec astro dev --port 4331` and set local `AUTH_URL` to that
   origin. Local code refuses the reserved production ingredient instance name
   `quickpantry-ingredients`.

Both `AI` and `AI_SEARCH` access remote services during local development.
Ingredient uploads contain names, normalized names, aliases, category, and
notes. Use development data. Local migrations operate on local D1; this setup
does not require a remote migration or deployment.

## Backfill and recovery

Migration `0004_ingredient_search_index.sql` adds durable dirty/version triggers.
It does not upload the existing catalog during migration. Ingredient and alias
writes mark rows transactionally, including raw SQL changes. Action handlers
nudge background synchronization through bound `waitUntil` independently of
the mapping rollout flag.

Each document has stable key `ingredients/<id>.md` and metadata `ingredient_id`
and `scope_key`. Content hashes skip unchanged uploads. A sync processes at most
20 IDs, with a 20-second foreground budget and 5-second individual I/O timeouts.
Late remote completions retain guarded recovery work through `waitUntil`.

An authenticated admin can call `actions.searchIndex.reindexIngredients`.
For local development, sign in as an `ADMIN`, open the browser console on that
local origin, and load the Vite action client:

```js
const { actions } = await import("/@id/astro:actions");
const { data, error } = await actions.searchIndex.reindexIngredients({ restart: true });
if (error) throw error;
console.table(data);
```

This module URL is for the local Vite server. Application client code imports
`actions` from `astro:actions`. Use that client to decode Astro action responses,
which use devalue serialization rather than an ordinary JSON object.

Call again with `{ restart: false }` until `remaining` is `0`. Restart only on
the first call; it resets all hashes, versions, exhausted uploads, and retry
backoff. Stop and inspect failures rather than continuously resetting them.
`remaining` includes backed-off work but excludes live uploads exhausted after
five attempts. Check local state separately:

```sh
pnpm exec wrangler d1 execute pantry-plan --local \
  --command "SELECT status, attempts, count(*) AS rows FROM IngredientSearchIndex GROUP BY status, attempts"
pnpm exec wrangler ai-search stats quickpantry-ingredients-dev --namespace default --json
```

Retries back off by 1, 4, 16, and 64 minutes, capped at 24 hours. Live uploads
stop after five failures until a relevant edit or admin restart. Deletion
tombstones retry indefinitely. Any user's pending-sync pass can recover due
orphans, including deleted owners. Missed live work is picked up during mapping
or by the admin action; there is no new periodic scheduler.

On account deletion, a database trigger removes private ingredients and aliases
before the legacy owner foreign key can make them global. It preserves text in
surviving recipes and leaves tombstones for remote deletion. Global ingredients
and their aliases remain intact. D1 verification hides deleted records while
remote cleanup is pending.

`IngredientSearchIndex.status = 'indexed'` means the upload was accepted. It
does not mean retrieval is ready. Wait for the AI Search item's status to become
`completed`; check Indexed Items or the [Items API](https://developers.cloudflare.com/ai-search/api/items/workers-binding/).
Do not use Node `getPlatformProxy()` for nested item methods in this Wrangler
version. The application and live evaluator perform item operations in workerd.

## Limits and failure handling

| Limit | Value |
| --- | --- |
| Recipe lines | 200, rejected before mapping if exceeded |
| Clef questions per request | 40, also capped at 48,000 UTF-8 request bytes |
| Candidate count | 6 initially, 12 on the single retry |
| Search concurrency | 4, identical requests deduplicated within a retrieval phase |
| Provider-work deadline | 30 seconds shared across retrieval, Clef, and generation |
| Per-call timeout | 8 seconds search/Clef, 15 seconds generation, clamped to deadline |
| Started/reserved request ceilings | 80 search, 12 Clef, 5 generation per mapping |
| Search admission | 100 requests/60 seconds/user through `INGREDIENT_SEARCH_RATE_LIMIT` |
| Model admission | Shared `AI_RATE_LIMIT`, 5 requests/60 seconds/user, including other AI imports |

Rate-limit counters are per Cloudflare location, not a global per-user ledger.
Parsing and D1 reads are outside the provider-work deadline. Larger recipes or
quota exhaustion can return partial suggestions. Deterministic matches and
manual mapping remain available; failed stages never restore the broad catalog
inside the enabled path. The warning reports temporary AI unavailability.

Logs include stage duration/success, counts, and decision kinds. They omit raw
lines, catalogs, aliases, provider payloads, and provider error messages. Index
retry diagnostics remain in D1; avoid exporting them as public logs.

## Testing

Run the local checks without live model requests:

```sh
pnpm test
pnpm exec astro check
pnpm build
```

Tests cover deterministic bypass, supplied-ID validation, scope and ownership
changes, missing/stale documents, abstention/retry/new names, admission and
timeouts, migration/deletion races, and editable review/Apply behavior. There
is no separate lint script.

For a local UI check, create catalog entries such as Chickpeas, Baking soda,
Baking powder, Cornstarch, and Cornmeal, then wait for their documents to finish
indexing. Save a text-only recipe with `1 cup garbanzo beans`, `1 tsp baking soda`,
`1 tbsp dragon fruit powder`, and `2 tbsp cornflour`. Open its ingredient review.
Existing matches and proposed new names remain editable. Ambiguous cornflour
should remain unmapped. Change a selection/quantity and confirm nothing writes
until Apply. With two review tabs open, applying one should make the older
preview fail its version check. Disable the local fallback to compare the
legacy path, provided Flagship has no explicit override for that user.

The opt-in remote comparison uses synthetic fixtures, local isolated D1,
`quickpantry-ingredients-dev`, and remote AI calls:

```sh
pnpm test:ingredient-eval
```

It applies local migrations, upserts 24 synthetic documents, waits for all 24
items to complete, checks cross-user filtering, and runs three alternating
legacy/retrieval pairs. `CATALOG`, `ISOLATION`, `SUMMARY`, and `RESULT` records
contain synthetic data and metrics. The integration assertions check isolation,
bounded inputs, and line preservation; the reported quality scores are not a
held-out accuracy gate. Provider failures remain in the results. The test does
not delete existing development items or run from `pnpm test`.

## Rollout and rollback

Keep production defaults unchanged while reviewing the evaluation. An operator
must apply the migration through the approved deployment workflow, create a
separate production ingredient instance with the same metadata schema, configure
`INGREDIENT_AI_SEARCH_INSTANCE`, and backfill/verify readiness before targeting
users with `ingredient-clef-mapping`. Index writes can run while the flag is off.

Start with explicit Flagship user targeting. Watch wrong accepted matches,
manual-review coverage, provider failures/latency, request counts, index backlog,
and total cost. The current small-fixture results do not justify a general
accuracy, latency, input-size, or cost claim.

Rollback by turning the flag off and keeping the environment fallback `false`.
That restores the legacy Scout/catalog path. Leave migration/index state in
place; retrieval outages in the enabled path instead preserve partial/manual
results. This PR does not deploy, run remote migrations, or enable production.
