// Wikidata-sourced semantic-overlap game generator (v1).
//
// One or more "base classes" (e.g. US states) each get narrowed by several
// independent constraints (e.g. "borders Canada", "population over 10M").
// Two constraints "collide" when the same entity qualifies for both --
// that's the game's intersection mechanic. No stripping/label-matching
// needed: matching is by Wikidata QID, since it's the same real-world
// entity.
//
// Constraints are built from a small set of reusable *pattern* functions
// (numericThreshold, dateThreshold, ...) rather than hand-written SPARQL
// per constraint. Each base class supplies a `properties` map (which PID
// backs "population," "founding date," etc. for its entities) and a list
// of pattern instances built from those properties -- so adding a new base
// class means declaring its properties + constraint list, not writing new
// SPARQL shapes.
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

function valuesClause(entities) {
  return entities.map((e) => `wd:${e.qid}`).join(' ');
}

async function fetchBaseClassEntities(qid) {
  const rows = await sparqlQuery(`
    SELECT ?item ?itemLabel WHERE {
      ?item wdt:P31 wd:${qid} .
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    } ORDER BY ?itemLabel
  `);
  return rows.map((r) => ({ qid: qidFromUri(r.item.value), label: r.itemLabel.value }));
}

// --- Reusable constraint patterns -------------------------------------
// Each takes the base class's entity universe (to bound the query) plus
// pattern-specific parameters, and returns a { name, sparql } constraint.
// Property PIDs and specific thresholds/targets are supplied by each base
// class's config below -- these functions only know the query *shape*.

function numericThreshold(entities, { name, property, comparator, value }) {
  return {
    name,
    sparql: `
      SELECT DISTINCT ?item ?itemLabel WHERE {
        VALUES ?item { ${valuesClause(entities)} }
        ?item wdt:${property} ?value .
        FILTER(?value ${comparator} ${value})
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      }
    `,
  };
}

function dateThreshold(entities, { name, property, comparator, year }) {
  return {
    name,
    sparql: `
      SELECT DISTINCT ?item ?itemLabel WHERE {
        VALUES ?item { ${valuesClause(entities)} }
        ?item wdt:${property} ?date .
        FILTER(YEAR(?date) ${comparator} ${year})
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      }
    `,
  };
}

// "?item --relationProperty--> ?related, and ?related is in country X" --
// e.g. states bordering a Canadian province, via P47 (shares border with).
function relatedEntityInCountry(entities, { name, relationProperty, countryQid }) {
  return {
    name,
    sparql: `
      SELECT DISTINCT ?item ?itemLabel WHERE {
        VALUES ?item { ${valuesClause(entities)} }
        ?item wdt:${relationProperty} ?related .
        ?related wdt:P17 wd:${countryQid} .
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      }
    `,
  };
}

// "?item --property--> one of these specific target QIDs" -- e.g. states
// adjacent to the Pacific or Atlantic Ocean, via P206.
function hasPropertyValueIn(entities, { name, property, valueQids }) {
  return {
    name,
    sparql: `
      SELECT DISTINCT ?item ?itemLabel WHERE {
        VALUES ?item { ${valuesClause(entities)} }
        VALUES ?target { ${valueQids.map((q) => `wd:${q}`).join(' ')} }
        ?item wdt:${property} ?target .
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      }
    `,
  };
}

// --- Base classes --------------------------------------------------------
// Adding a new base class means: its Wikidata class QID, the PIDs backing
// whichever generic properties its entities actually have, and a list of
// pattern instances built from those PIDs. No new SPARQL shapes needed
// unless a genuinely new *kind* of pattern comes up.

const BASE_CLASSES = [
  {
    name: 'US states',
    qid: 'Q35657',
    properties: {
      population: 'P1082',
      inceptionDate: 'P571',
      sharesBorderWith: 'P47',
      locatedNextToBodyOfWater: 'P206',
    },
    buildConstraints(entities, props) {
      return [
        numericThreshold(entities, {
          name: 'States with Population Over 10 Million',
          property: props.population,
          comparator: '>',
          value: 10000000,
        }),
        dateThreshold(entities, {
          name: 'States Admitted to the Union Before 1800',
          property: props.inceptionDate,
          comparator: '<',
          year: 1800,
        }),
        relatedEntityInCountry(entities, {
          name: 'States Bordering Canada',
          relationProperty: props.sharesBorderWith,
          countryQid: 'Q16',
        }),
        relatedEntityInCountry(entities, {
          name: 'States Bordering Mexico',
          relationProperty: props.sharesBorderWith,
          countryQid: 'Q96',
        }),
        hasPropertyValueIn(entities, {
          name: 'States on the Pacific or Atlantic Ocean',
          property: props.locatedNextToBodyOfWater,
          valueQids: ['Q98', 'Q97'],
        }),
      ];
    },
  },
];

async function fetchConstraintResults(constraints) {
  const results = [];
  for (const c of constraints) {
    console.log(`Querying: ${c.name}`);
    const rows = await sparqlQuery(c.sparql);
    const entities = rows.map((r) => ({ qid: qidFromUri(r.item.value), label: r.itemLabel.value }));
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

async function generateCandidateForBaseClass(baseClass) {
  console.log(`\n=== ${baseClass.name} ===`);
  console.log(`Fetching ${baseClass.name}...`);
  const entities = await fetchBaseClassEntities(baseClass.qid);
  console.log(`  -> ${entities.length} entities`);

  const constraints = baseClass.buildConstraints(entities, baseClass.properties);
  const constraintResults = await fetchConstraintResults(constraints);

  const collidingPairs = findCollidingPairs(constraintResults);
  console.log(`Found ${collidingPairs.length} colliding constraint pair(s):`);
  for (const p of collidingPairs) {
    console.log(`  "${p.a.name}" x "${p.b.name}": ${p.shared.map((s) => s.label).join(', ')}`);
  }

  return assembleCandidate(constraintResults, collidingPairs);
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const candidates = [];
  for (const baseClass of BASE_CLASSES) {
    const candidate = await generateCandidateForBaseClass(baseClass);
    if (candidate) {
      candidates.push(candidate);
    } else {
      console.log(`No usable candidate for ${baseClass.name} this run.`);
    }
  }

  if (candidates.length === 0) {
    console.log('\nNo candidates generated this run.');
    return;
  }

  const dates = await findNextFreeDates(supabase, candidates.length);
  for (let i = 0; i < candidates.length; i++) {
    const { error } = await supabase.from('games').insert({
      game_date: dates[i],
      content: candidates[i],
      source: 'Wikidata (wikidata.org), CC0',
      status: 'pending',
    });
    if (error) throw error;
    console.log(`Inserted pending candidate for ${dates[i]}.`);
  }
  console.log(`\nReview at /#/admin.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
