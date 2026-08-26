// Wikidata-sourced semantic-overlap game generator (v1).
//
// Base class: US states (Q35657). Each "constraint" below is an independent
// SPARQL query narrowing that same class (e.g. "borders Canada"). Two
// constraints "collide" when the same state qualifies for both -- that's
// the game's intersection mechanic. No stripping/label-matching needed:
// matching is by Wikidata QID, since it's the same real-world entity.
//
// Run manually:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/generate-games.mjs
//
// item-selector.service.ts already auto-detects intersections by scanning
// for any word repeated across the four categories' `items` arrays, so this
// script only needs to assemble four categories -- no intersection bookkeeping.

import { createClient } from '@supabase/supabase-js';

const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'IntersectionsGameGenerator/1.0 (https://intersections.in; game content generator)';
const MIN_REQUEST_GAP_MS = 1200; // be polite to the public WDQS endpoint
const COLORS = ['blue', 'red', 'yellow', 'green'];
// item-selector.service.ts needs >=3 items to ever "cover" a category, so a
// constraint that comes back thinner than this isn't usable -- whether
// because the pattern genuinely doesn't apply to this base class (e.g.
// "borders" queried against college mascots) or just happened to match few
// entities. Either way, empirically too sparse is empirically too sparse.
const MIN_CONSTRAINT_ITEMS = 3;

let lastRequestAt = 0;

async function sparqlQuery(query, attempt = 1) {
  const wait = MIN_REQUEST_GAP_MS - (Date.now() - lastRequestAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();

  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/sparql-results+json', 'User-Agent': USER_AGENT },
  });

  if (!res.ok) {
    if ([429, 502, 503, 504].includes(res.status) && attempt <= 4) {
      const backoff = 1500 * attempt;
      console.warn(`  (${res.status} from WDQS, retrying in ${backoff}ms, attempt ${attempt})`);
      await new Promise((r) => setTimeout(r, backoff));
      return sparqlQuery(query, attempt + 1);
    }
    throw new Error(`SPARQL query failed: HTTP ${res.status}`);
  }

  const body = await res.json();
  return body.results.bindings;
}

function qidFromUri(uri) {
  return uri.split('/').pop();
}

async function fetchUsStates() {
  const rows = await sparqlQuery(`
    SELECT ?state ?stateLabel WHERE {
      ?state wdt:P31 wd:Q35657 .
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    } ORDER BY ?stateLabel
  `);
  return rows.map((r) => ({ qid: qidFromUri(r.state.value), label: r.stateLabel.value }));
}

function valuesClause(states) {
  return states.map((s) => `wd:${s.qid}`).join(' ');
}

// Each constraint is scoped to the US-states VALUES set fetched above, so
// every query is bounded to ~50 known entities rather than an open-ended
// join across a huge global predicate.
function buildConstraints(states) {
  const VALUES = valuesClause(states);
  return [
    {
      name: 'States with Population Over 10 Million',
      sparql: `
        SELECT DISTINCT ?state ?stateLabel WHERE {
          VALUES ?state { ${VALUES} }
          ?state wdt:P1082 ?population .
          FILTER(?population > 10000000)
          SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
        }
      `,
    },
    {
      name: 'States Bordering Canada',
      sparql: `
        SELECT DISTINCT ?state ?stateLabel WHERE {
          VALUES ?state { ${VALUES} }
          ?state wdt:P47 ?neighbor .
          ?neighbor wdt:P17 wd:Q16 .
          SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
        }
      `,
    },
    {
      name: 'States Bordering Mexico',
      sparql: `
        SELECT DISTINCT ?state ?stateLabel WHERE {
          VALUES ?state { ${VALUES} }
          ?state wdt:P47 ?neighbor .
          ?neighbor wdt:P17 wd:Q96 .
          SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
        }
      `,
    },
    {
      name: 'States Admitted to the Union Before 1800',
      sparql: `
        SELECT DISTINCT ?state ?stateLabel WHERE {
          VALUES ?state { ${VALUES} }
          ?state wdt:P571 ?date .
          FILTER(YEAR(?date) < 1800)
          SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
        }
      `,
    },
    {
      name: 'States on the Pacific or Atlantic Ocean',
      sparql: `
        SELECT DISTINCT ?state ?stateLabel WHERE {
          VALUES ?state { ${VALUES} }
          VALUES ?ocean { wd:Q98 wd:Q97 }
          ?state wdt:P206 ?ocean .
          SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
        }
      `,
    },
  ];
}

async function fetchConstraintResults(constraints) {
  const results = [];
  for (const c of constraints) {
    console.log(`Querying: ${c.name}`);
    const rows = await sparqlQuery(c.sparql);
    const entities = rows.map((r) => ({ qid: qidFromUri(r.state.value), label: r.stateLabel.value }));
    console.log(`  -> ${entities.length} result(s)`);

    if (entities.length < MIN_CONSTRAINT_ITEMS) {
      console.log(`  -> skipping "${c.name}": too few results to form a category (needs >=${MIN_CONSTRAINT_ITEMS})`);
      continue;
    }
    results.push({ name: c.name, entities });
  }
  return results;
}

function findCollidingPairs(constraintResults) {
  const pairs = [];
  for (let i = 0; i < constraintResults.length; i++) {
    for (let j = i + 1; j < constraintResults.length; j++) {
      const a = constraintResults[i];
      const b = constraintResults[j];
      const aQids = new Set(a.entities.map((e) => e.qid));
      const shared = b.entities.filter((e) => aQids.has(e.qid));
      if (shared.length > 0) {
        pairs.push({ a, b, shared });
      }
    }
  }
  return pairs;
}

function assembleCandidate(constraintResults, collidingPairs) {
  if (collidingPairs.length === 0) return null;

  const chosen = [collidingPairs[0].a, collidingPairs[0].b];
  const chosenNames = new Set(chosen.map((c) => c.name));

  // Prefer a second, independent colliding pair to fill the other two slots.
  const secondPair = collidingPairs.find(
    (p) => !chosenNames.has(p.a.name) && !chosenNames.has(p.b.name)
  );
  if (secondPair) {
    chosen.push(secondPair.a, secondPair.b);
  } else {
    for (const c of constraintResults) {
      if (chosen.length >= 4) break;
      if (!chosenNames.has(c.name)) {
        chosen.push(c);
        chosenNames.add(c.name);
      }
    }
  }

  if (chosen.length < 4) return null;

  const content = {};
  chosen.slice(0, 4).forEach((c, i) => {
    content[COLORS[i]] = {
      category_name: c.name,
      items: c.entities.map((e) => e.label),
    };
  });
  return content;
}

function ymd(date) {
  return date.toISOString().slice(0, 10);
}

async function findNextFreeDates(supabase, count) {
  const { data, error } = await supabase.from('games').select('game_date');
  if (error) throw error;
  const taken = new Set((data ?? []).map((r) => r.game_date));

  const dates = [];
  const cursor = new Date();
  cursor.setUTCHours(0, 0, 0, 0);
  cursor.setUTCDate(cursor.getUTCDate() + 1); // start from tomorrow

  while (dates.length < count) {
    const candidate = ymd(cursor);
    if (!taken.has(candidate)) {
      dates.push(candidate);
      taken.add(candidate);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  console.log('Fetching US states...');
  const states = await fetchUsStates();
  console.log(`  -> ${states.length} states`);

  const constraints = buildConstraints(states);
  const constraintResults = await fetchConstraintResults(constraints);

  const collidingPairs = findCollidingPairs(constraintResults);
  console.log(`\nFound ${collidingPairs.length} colliding constraint pair(s):`);
  for (const p of collidingPairs) {
    console.log(`  "${p.a.name}" x "${p.b.name}": ${p.shared.map((s) => s.label).join(', ')}`);
  }

  const candidate = assembleCandidate(constraintResults, collidingPairs);
  if (!candidate) {
    console.log('\nNo usable candidate this run (no colliding pairs, or not enough constraints).');
    return;
  }

  const [gameDate] = await findNextFreeDates(supabase, 1);
  const { error } = await supabase.from('games').insert({
    game_date: gameDate,
    content: candidate,
    source: 'Wikidata (wikidata.org), CC0',
    status: 'pending',
  });
  if (error) throw error;

  console.log(`\nInserted 1 pending candidate for ${gameDate}. Review at /#/admin.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
