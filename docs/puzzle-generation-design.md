# Puzzle generation: design decisions

This documents the design decisions behind the automated puzzle-generation pipeline, starting right after the Vercel/Supabase migration and mobile-Safari crash were resolved (commit `fc7628f` and earlier) and `intersections.in` was confirmed stable. Everything below is the "how do we stop hand-authoring puzzles" arc: the admin review system, the Wikidata generator, and the string of design problems that came up building it.

Commit hashes referenced below are accurate as of this writing. Note: some commits in this range (`4c75ffc`, `792ef5b`) were later amended into "CHECKPOINT" commits outside of the assistant session that built them — the code they point to is unchanged, only the commit message/position was rewritten.

## 1. Admin review & approval system

Before any generator existed, the review/approval plumbing was built first: candidates land in `games` with `status = 'pending'`, get reviewed at `/#/admin`, and only `status = 'approved'` rows are ever served to players.

**Schema** (`supabase/add_status_column.sql`): defaults to `'approved'` so every pre-existing row (the hand-seeded game) keeps working with zero migration effort.

```sql
alter table games add column if not exists status text not null default 'approved'
  check (status in ('pending', 'approved', 'rejected'));
```

**Auth decision**: a single shared password, but explicitly *not* hardcoded in source (repeating the earlier mistake of committing DB credentials was a named non-goal). Instead: `ADMIN_PASSWORD` / `ADMIN_SESSION_SECRET` live only as Vercel env vars, and a self-verifying signed cookie avoids needing a session table at all —

```ts
// api/_admin.ts
export function setSessionCookie(res: VercelResponse): void {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const token = `${expiresAt}.${sign(String(expiresAt), getSessionSecret())}`;
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`);
}
```

`checkPassword`/`isAdminRequest` use `crypto.timingSafeEqual` rather than `===` — a trivial, free defense against timing attacks. The login *screen* is just UX; the actual gate is `requireAdmin(req, res)` called at the top of every admin-mutating API route, since `/#/admin` is a public URL like any other.

**Deployment lesson** (no dedicated commit, just an incident): the first deploy of the `status`-filtered `api/games.ts` went out *before* the schema migration was run, breaking the live public API for several minutes (querying a column that didn't exist yet). Lesson carried forward for the rest of the session: sequence schema changes before code that depends on them, not the other way around.

*(`e8fa625` — Add admin review/approval UI for pending games)*

## 2. Generator v1: semantic-overlap mode

**Why semantic overlap first, not lexical**: two intersection mechanics were discussed — *semantic* (one real entity satisfying two category constraints, e.g. Arizona bordering Mexico **and** having national parks) and *lexical* (two different entities that just happen to share a name, e.g. Arizona the state / AriZona the drink). Semantic was built first because matching by Wikidata QID (same real-world thing) needs no fuzzy string handling at all, unlike lexical matching across unrelated domains.

**Key reuse insight**: `item-selector.service.ts` already auto-detects intersections by scanning for any word repeated across the four categories' `items` arrays. The generator never needed to compute or label intersections itself — assembling four categories where some entities happen to repeat is enough; existing gameplay logic does the rest.

**Where it runs**: a standalone Node script (`scripts/generate-games.mjs`), run manually, not a Vercel function — a live SPARQL endpoint with unpredictable latency is a bad fit for serverless execution-time limits.

*(`aac50da` — Add Wikidata semantic-overlap game generator script)*

### Query engineering lessons (learned by hitting them live)

Wikidata's public query service turned out to be the biggest source of iteration in the whole project, independent of any of the design decisions below:

- **Reverse-joins into high-cardinality predicates are dangerous.** A "states with national parks" constraint (join *into* a park via `P131`, "located in") consistently timed out (502/504) no matter how it was bounded — even with the state-side VALUES restricted to ~50 known QIDs. Dropped entirely in favor of constraints that stay as single-hop properties *on* the base class's own entities.
- **Subquery materialization fixes bad join plans.** Wrapping a selective filter in its own `SELECT` subquery before joining forced Blazegraph to materialize the small side first, turning some previously-timing-out queries instant.
- **Rate limiting is real and looks like random server errors.** A burst of manual test queries produced a run of 502s that looked like WDQS instability; it was actually a `429` in disguise. Fixed with a minimum request gap and exponential backoff:

```js
async function sparqlQuery(query, attempt = 1) {
  const wait = MIN_REQUEST_GAP_MS - (Date.now() - lastRequestAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
  // ...
  if (!res.ok) {
    if ([429, 502, 503, 504].includes(res.status) && attempt <= 4) {
      const backoff = 1500 * attempt;
      await new Promise((r) => setTimeout(r, backoff));
      return sparqlQuery(query, attempt + 1);
    }
    throw new Error(`SPARQL query failed: HTTP ${res.status}`);
  }
}
```

## 3. Quality fixes surfaced by live testing

Two problems only became visible once the generator was actually producing candidates:

**Category names were separately hand-typed strings** that could drift from the query they described. Fixed by computing `category_name` from the same structured parameters (entity noun, property label, comparator, threshold) used to build the SPARQL — change a threshold, the name updates with it, by construction.

**Consecutive runs produced near-duplicate candidates** (3/4 identical categories), because assembly deterministically grabbed the first colliding pair found from an unchanging constraint set. Fixed by having `assembleCandidate` build *every* viable 4-category combination, score each by overlap against every existing pending/approved/rejected game's category set, and reject the run if even the best option still shares 3+ categories with something already queued:

```js
candidates.sort((a, b) => a.overlap - b.overlap);
const best = candidates[0];
if (best.overlap > MAX_ACCEPTABLE_CATEGORY_OVERLAP) {
  console.log(`  -> best available combination still shares ${best.overlap}/4 categories...`);
  return null;
}
```

*(`98df7e1` — Auto-generate category names and avoid near-duplicate candidates)*

## 4. Expansion + the sparsity filter earning its keep

Added a second base class (Countries of the world, `Q6256`) reusing the same pattern functions with country-appropriate thresholds — no new SPARQL shapes needed, just new config. Also added `MIN_CONSTRAINT_ITEMS = 3` (matching `item-selector`'s real minimum to ever cover a category) as a blanket filter on *any* constraint result, regardless of why it came back thin:

```js
if (entities.length < MIN_CONSTRAINT_ITEMS) {
  console.log(`  -> skipping "${c.name}": too few results to form a category (needs >=${MIN_CONSTRAINT_ITEMS})`);
  continue;
}
```

This paid off immediately in production: "States Admitted to the Union After 1950" returned exactly 2 results (Alaska, Hawaii — correct!) and was silently dropped rather than shipping a broken category.

*(`fa608dd` — Expand base sets and constraints: add Countries of the world; `8260cae` — Filter out constraints too sparse to form a category)*

## 5. Parameterization: from hardcoded values to auto-derived ones

Even after constraints became reusable *patterns*, the actual thresholds ("population over 10,000,000", "before 1800") and relation targets ("Canada", "Mexico") were still hand-picked per base class — a scaling bottleneck for the eventual goal of a large category library.

**Thresholds** are now a percentile of the real data distribution, rounded to a "nice" number, rather than a guessed constant:

```js
async function fetchNumericPercentile(entities, property, percentile) {
  const rows = await sparqlQuery(`SELECT ?item ?value WHERE { VALUES ?item { ${valuesClause(entities)} } ?item wdt:${property} ?value . }`);
  const values = rows.map((r) => Number(r.value.value)).sort((a, b) => a - b);
  const idx = Math.min(values.length - 1, Math.floor(percentile * values.length));
  return roundToNiceNumber(values[idx]);
}
```

**Relational targets** (borders X, near water Y) are discovered by finding which values of a property actually occur often enough across the base class — a `GROUP BY` / `HAVING COUNT >= MIN_CONSTRAINT_ITEMS` query — rather than a human guessing "Canada and Mexico are the interesting ones." This is the same "try broadly, keep what empirically works" philosophy as the sparsity filter, just applied one step earlier, at parameter discovery instead of pattern-applicability.

*(`e3bd8c0` — Auto-derive constraint parameters and add lexical-collision mode)*

### The self-referential-match bug this exposed

Auto-discovery surfaced two technically-correct-but-useless categories: "States Bordering United States" (48/50 states — most of a state's neighbors are *other US states*) and "Countries Bordering European Union" (the EU isn't a country, just a valid `P47` target for some). Two different fixes for two different code paths:

- `fetchDistinctRelatedCountries` now excludes the base class's own dominant `P17` country (auto-detected, not hardcoded to "USA").
- `fetchDistinctPropertyValues` gained an optional `peerTypeQid` that restricts discovered targets to instances of the same class as the base class — appropriate for "peer" relations like borders, deliberately *not* applied to "near this body of water," where the target is a genuinely different kind of thing.

*(`19b8ee5` — Fix trivial self-referential matches in relational auto-discovery)*

## 6. Lexical-collision mode

Built in the same pass as parameterization (`e3bd8c0`) after a scope miscommunication — the plan was auto-derivation only, but "add lexical overlap handling" from an earlier discussion got folded in too.

**Unification, not a parallel system**: lexical mode reuses nearly the entire semantic-mode pipeline (collision detection, assembly, dedup, date assignment, insert) via one generalization — `findCollidingPairs` takes a matching-key function instead of being hardcoded to QIDs:

```js
function findCollidingPairs(constraintResults, keysFn = (e) => [e.qid], { setDisplayFromKey = false } = {}) { /* ... */ }
```

Semantic mode's default (`(e) => [e.qid]`) is unchanged; lexical mode passes `(e) => [...e.nameByKey.keys()]` — stripped, lowercased label and alias variants instead of identity. Starter templates (US States, Countries, Chemical Elements, Constellations) were deliberately chosen from domains already proven reliable that session, to avoid another round of query debugging.

**Validating example**: "Georgia" — the US state and the country are different Wikidata entities (different QIDs) but the same string, and correctly surfaced as the first lexical collision found live.

## 7. Alias-aware matching, resolved without touching the game engine

Motivating example: Abraham Lincoln / Lincoln Motor Company / Lincoln, Nebraska — a nickname-driven collision, not a primary-label one. Two requirements: discover these, and have the game *accept* a guess matching the alias.

**The key architectural decision**: resolve this entirely at generation time rather than teaching the runtime game engine about aliases. `item-selector.service.ts` and `checkGuess` in `gameview.component.ts` do plain exact-string matching — the entire intersection/guess-checking mechanism for every puzzle, hand-authored or generated. Changing that would mean touching live, already-shipped logic used by every puzzle in the database. Instead: when two entities collide via a shared alias, that alias string becomes the item text stored in `content[color].items`, in place of either entity's canonical label. The game keeps doing exactly what it already does; it never has to know a substitution happened.

```js
if (setDisplayFromKey) {
  const displayName = e.nameByKey?.get(k) ?? k;
  e.displayOverride = displayName;
  matchA.displayOverride = displayName;
}
```
```js
items: c.entities.map((e) => e.displayOverride ?? e.label),
```

**Data quality catch**: raw Wikidata aliases include a lot of noise for puzzle purposes — postal codes ("AL"), ISO codes ("US-AL"), phonetic spellings ("AR-kən-saw"). Filtered before ever being usable as a match key:

```js
function isUsableAlias(name) {
  if (name.length < 4) return false;
  if (/[^A-Za-z .'-]/.test(name)) return false;
  if (name.length <= 6 && name === name.toUpperCase()) return false;
  if (name.trim().split(/\s+/).length > 4) return false;
  return true;
}
```

**Correctness invariant, caught in review before implementation**: an entity with several matching name variants (e.g. "University of Pennsylvania" / "UPenn" / "Penn") must count as exactly *one* collision, not one per matching alias — otherwise any future "total overlap" quality metric would be silently inflated. `findCollidingPairs` stops at the first matching key per entity and pushes it once; verified with a synthetic test that `shared.length` stays `1`, not `3`, for a constructed multi-alias case.

*(`b9ca3d4` — Add alias-aware lexical matching, resolved entirely at generation time; `8db61ef` — Exclude overly verbose aliases)*

## 8. Admin UI: bold overlaps

Small addition, admin-only: any item appearing in 2+ of a pending game's four categories renders bold in the review screen, using the exact same rule `item-selector.service.ts` uses at play-time — a display aid for review, not a gameplay change.

*(`792ef5b`, committed as "Bold overlapping items in the admin review UI", later renamed to "CHECKPOINT 2" via an out-of-session amend)*

## 9. Architecture reflection: why semantic and lexical are still two passes

Raised directly: why doesn't a semantic constraint category (e.g. "States Bordering Canada") ever get compared against a lexical template (e.g. "Chemical Elements") for accidental overlap? Answer: mostly historical, not principled — semantic mode was built first and lexical was bolted on as a parallel path reusing the shared machinery, rather than a single unified pool. The one real (if minor) justification for keeping QID-matching for semantic mode specifically: within one base class, two constraints on the same entity always share a label anyway, so QID vs. string matching produce identical results there — QID is just marginally more robust against the rare case of two different entities sharing a label.

**Decision**: don't refactor this now. It's explicitly deferred to the knowledge-graph work (below), where every category becomes a node with entity-membership edges regardless of source — the semantic/lexical distinction disappears naturally once connections are precomputed once rather than searched for per-run in two separate passes.

## Future plans (captured in `README.md`)

1. **Knowledge-graph precomputation** — the actual end state. Every category (semantic constraint or lexical template) becomes a node with entity memberships as edges, stored once and refreshed incrementally, rather than queried live per run. Resolves the architecture-reflection point above for free, and puzzle-generation capacity grows combinatorially as categories are added.
2. **Syntactic-overlap mode** — a third mechanic (e.g. "contains a double letter," "exactly 3 a's"). Deliberately different from the other two: not SPARQL-derivable (spelling isn't a Wikidata property) and not a finite enumerable list, so it needs a small hardcoded predicate library, a rule for whether/when to include one per puzzle, and — unlike everything else in this document, which was designed specifically to avoid this — genuine runtime evaluation of guesses against a predicate. This is the one planned piece that would actually touch `checkGuess`.
