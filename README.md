Intersections

A completely original daily puzzle game created using Angular, deployed on Vercel with a Supabase (Postgres) backend.

*This project is still in progress* Like many others, I habitually participate in the NYT word games each morning. I wanted to create my own variation that mimicked the aesthetics and satisfying animations that make games like connections and wordle so addicting.

## Game content pipeline

Puzzles are generated from Wikidata (`scripts/generate-games.mjs`) and reviewed/approved through an admin UI (`/#/admin`) before going live -- see `games.status` (`pending` / `approved` / `rejected`).

Both semantic-overlap (one entity satisfying two category constraints, e.g. Arizona bordering Mexico *and* having national parks) and lexical-collision (two different entities sharing a bare/alias name, e.g. Abraham Lincoln / Lincoln Motor Company) generation modes exist today, each with parameterized, reusable constraint/template patterns rather than one-off hardcoded queries per category.

### Future plans -- the final architecture

Semantic and lexical generation currently run as two separate passes with two separate collision searches (base-class constraint categories are never compared against lexical templates for accidental overlap, even though there's no principled reason they couldn't be) and each produces its candidates independently at generation time by querying Wikidata live.

The actual end state: a **precomputed knowledge graph** -- every category (semantic constraint or lexical template) becomes a node with its entity memberships as edges, stored once (new Supabase tables) and refreshed incrementally over time, rather than re-queried live on every run. Puzzle generation then becomes graph traversal/search over already-materialized data: faster and more reliable than live SPARQL, capacity grows combinatorially as more categories are added (every new category can potentially overlap with every existing one), and -- the piece that resolves today's semantic/lexical split -- there's no longer a "which mode is this" distinction at generation time, since connections between *any* two categories (same-entity or same-name) are just edges already sitting in the same graph, resolved once ahead of time rather than recomputed per run.

**Also planned, after the graph exists: a third, syntactic-overlap mode** -- categories defined by spelling patterns (e.g. "contains a double letter," "has 3 a's") rather than a Wikidata fact or a shared name. This is a genuinely different kind of category from the other two: it isn't SPARQL-derivable (spelling isn't a Wikidata property) and it isn't a finite enumerable list (unlike a base class or lexical template, "words with a double letter" has no fixed membership -- almost any word could qualify). That means: a small hardcoded library of syntactic predicate functions (not data-driven, since there's no Wikidata query to generalize from), a decision rule for whether/when a puzzle should include one (likely at most one per puzzle, layered on top of the other categories' words rather than replacing a whole category), and -- unlike everything built so far, which resolves entirely at generation time so the game engine never has to change -- this one genuinely needs guesses evaluated dynamically against the predicate at submission time, since the valid answer set isn't something you can fully enumerate ahead of time into a static items list. That's the one piece of this whole pipeline that would actually touch `checkGuess` in `gameview.component.ts`, not just the generator.
