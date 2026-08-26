Intersections

A completely original daily puzzle game created using Angular, deployed on Vercel with a Supabase (Postgres) backend.

*This project is still in progress* Like many others, I habitually participate in the NYT word games each morning. I wanted to create my own variation that mimicked the aesthetics and satisfying animations that make games like connections and wordle so addicting.

## Game content pipeline

Puzzles are generated from Wikidata (`scripts/generate-games.mjs`) and reviewed/approved through an admin UI (`/#/admin`) before going live -- see `games.status` (`pending` / `approved` / `rejected`).

Both semantic-overlap (one entity satisfying two category constraints, e.g. Arizona bordering Mexico *and* having national parks) and lexical-collision (two different entities sharing a bare/alias name, e.g. Abraham Lincoln / Lincoln Motor Company) generation modes exist today, each with parameterized, reusable constraint/template patterns rather than one-off hardcoded queries per category.

### Future plans -- the final architecture

Semantic and lexical generation currently run as two separate passes with two separate collision searches (base-class constraint categories are never compared against lexical templates for accidental overlap, even though there's no principled reason they couldn't be) and each produces its candidates independently at generation time by querying Wikidata live.

The actual end state: a **precomputed knowledge graph** -- every category (semantic constraint or lexical template) becomes a node with its entity memberships as edges, stored once (new Supabase tables) and refreshed incrementally over time, rather than re-queried live on every run. Puzzle generation then becomes graph traversal/search over already-materialized data: faster and more reliable than live SPARQL, capacity grows combinatorially as more categories are added (every new category can potentially overlap with every existing one), and -- the piece that resolves today's semantic/lexical split -- there's no longer a "which mode is this" distinction at generation time, since connections between *any* two categories (same-entity or same-name) are just edges already sitting in the same graph, resolved once ahead of time rather than recomputed per run.
