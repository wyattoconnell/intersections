Intersections

A completely original daily puzzle game created using Angular, deployed on Vercel with a Supabase (Postgres) backend.

*This project is still in progress* Like many others, I habitually participate in the NYT word games each morning. I wanted to create my own variation that mimicked the aesthetics and satisfying animations that make games like connections and wordle so addicting.

## Game content pipeline

Puzzles are generated from Wikidata (`scripts/generate-games.mjs`) and reviewed/approved through an admin UI (`/#/admin`) before going live -- see `games.status` (`pending` / `approved` / `rejected`).

### Future plans

- **Parameterized constraint patterns**: generalize the current per-base-class hardcoded constraints (e.g. "borders Canada", "population over 10 million") into reusable patterns (property > threshold, founded/admitted before/after year, member of group, etc.) that can be instantiated against any base class via a small per-class property mapping, instead of writing bespoke SPARQL per constraint per base class.
- **Knowledge-graph precomputation**: rather than querying Wikidata live at generation time, precompute and store a graph of base sets, patterns, and their entity memberships (new Supabase tables), refreshed incrementally over time. Puzzle generation then becomes graph traversal/search over already-materialized data -- faster and more reliable than live SPARQL queries, and puzzle-generation capacity grows combinatorially as more categories are added, since every new category can potentially overlap with every existing one already in the graph.
- **Lexical-collision mode**: a second puzzle-generation mode where the "intersection" is two different entities from unrelated domains that share a bare name after stripping their qualifier (e.g. Arizona the state / AriZona the iced tea brand), as opposed to the current semantic-overlap mode (one entity satisfying two category constraints at once).
