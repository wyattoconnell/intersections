// Wikidata-sourced game generator (v2): semantic-overlap + lexical-collision.
//
// Semantic-overlap mode: one or more "base classes" (e.g. US states) each
// get narrowed by several independent constraints (e.g. "borders Canada",
// "population over the 75th percentile"). Two constraints "collide" when
// the same entity qualifies for both -- matching is by Wikidata QID, since
// it's the same real-world entity.
//
// Lexical-collision mode: several independent entity lists from unrelated
// domains (e.g. US states, chemical elements) "collide" when two different
// entities happen to share a bare name (e.g. "Georgia" the US state and
// "Georgia" the country) -- matching is by stripped, lowercased label
// instead of QID, since these are genuinely different entities.
//
// Both modes share the same collision-detection, assembly, dedup-against-
// existing-games, date-assignment, and insert logic -- only how each
// "constraint"/"template" is fetched and what key its entities are matched
// on differs. See findCollidingPairs's `keyFn` parameter.
//
// Constraint *values* (thresholds, comparison years) are derived from the
// actual data at generation time -- a percentile of the real distribution,
// rounded to a "nice" number -- rather than a hand-picked constant, and
// relational constraints (borders X, located next to Y) are discovered by
// finding which values of a property actually occur often enough across
// the base class, rather than a human hand-picking specific targets. This
// mirrors the same "try broadly, keep what empirically works" approach
// already used for pairwise-overlap discovery and the sparsity filter --
// applied one level earlier, at parameter discovery.
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
// constraint/template that comes back thinner than this isn't usable --
// whether because it genuinely doesn't apply (e.g. "borders" queried
// against college mascots) or just happened to match few entities. Either
// way, empirically too sparse is empirically too sparse.
const MIN_CONSTRAINT_ITEMS = 3;
// Reject a candidate if its best available combination still shares this
// many (or more) of its 4 categories with an existing pending/approved/
// rejected game -- i.e. it's basically the same puzzle again.
const MAX_ACCEPTABLE_CATEGORY_OVERLAP = 2;
// How many auto-discovered relational constraints (e.g. distinct bordering
// countries) to generate per property, at most.
const AUTO_DISCOVERY_LIMIT = 3;

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

// --- Parameter auto-derivation --------------------------------------------
// Instead of a hand-picked threshold/target, ask the data what's actually
// there: a percentile of the real value distribution for thresholds, or
// the most common actual values for relational properties.

function roundToNiceNumber(n) {
  if (!Number.isFinite(n) || n === 0) return n;
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(n))));
  return Math.round(n / magnitude) * magnitude;
}

function roundToNiceYear(y) {
  return Math.round(y / 25) * 25;
}

async function fetchNumericPercentile(entities, property, percentile) {
  const rows = await sparqlQuery(`
    SELECT ?item ?value WHERE {
      VALUES ?item { ${valuesClause(entities)} }
      ?item wdt:${property} ?value .
    }
  `);
  const values = rows
    .map((r) => Number(r.value.value))
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b);
  if (values.length === 0) return null;
  const idx = Math.min(values.length - 1, Math.floor(percentile * values.length));
  return roundToNiceNumber(values[idx]);
}

async function fetchYearPercentile(entities, property, percentile) {
  const rows = await sparqlQuery(`
    SELECT ?item ?date WHERE {
      VALUES ?item { ${valuesClause(entities)} }
      ?item wdt:${property} ?date .
    }
  `);
  const years = rows
    .map((r) => new Date(r.date.value).getUTCFullYear())
    .filter((y) => Number.isFinite(y))
    .sort((a, b) => a - b);
  if (years.length === 0) return null;
  const idx = Math.min(years.length - 1, Math.floor(percentile * years.length));
  return roundToNiceYear(years[idx]);
}

// Distinct values a property actually takes across the base class, most
// common first, restricted to ones that clear MIN_CONSTRAINT_ITEMS -- so
// only relational constraints likely to produce a usable category are ever
// attempted.
async function fetchDistinctPropertyValues(entities, property, limit) {
  const rows = await sparqlQuery(`
    SELECT ?target ?targetLabel (COUNT(DISTINCT ?item) as ?count) WHERE {
      VALUES ?item { ${valuesClause(entities)} }
      ?item wdt:${property} ?target .
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    GROUP BY ?target ?targetLabel
    HAVING (COUNT(DISTINCT ?item) >= ${MIN_CONSTRAINT_ITEMS})
    ORDER BY DESC(?count)
    LIMIT ${limit}
  `);
  return rows.map((r) => ({ qid: qidFromUri(r.target.value), label: r.targetLabel.value }));
}

// Same idea, but one hop further: "?item --relationProperty--> ?related",
// grouped by ?related's *country* (P17) rather than ?related itself -- e.g.
// which countries a state's bordering provinces actually belong to.
async function fetchDistinctRelatedCountries(entities, relationProperty, limit) {
  const rows = await sparqlQuery(`
    SELECT ?country ?countryLabel (COUNT(DISTINCT ?item) as ?count) WHERE {
      VALUES ?item { ${valuesClause(entities)} }
      ?item wdt:${relationProperty} ?related .
      ?related wdt:P17 ?country .
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    GROUP BY ?country ?countryLabel
    HAVING (COUNT(DISTINCT ?item) >= ${MIN_CONSTRAINT_ITEMS})
    ORDER BY DESC(?count)
    LIMIT ${limit}
  `);
  return rows.map((r) => ({ qid: qidFromUri(r.country.value), label: r.countryLabel.value }));
}

// --- Reusable constraint patterns -------------------------------------
// Each takes the base class's entity universe (to bound the query) plus
// pattern-specific parameters, and returns a { name, sparql } constraint.
// The category_name is computed from those same parameters (entity noun,
// property label, comparator, value/target labels) rather than being a
// separately hand-typed string -- change a threshold and the name updates
// with it. These functions only know the query *shape* and how to phrase
// it in English; the *Auto wrappers below resolve the actual threshold/
// target values from real data before calling these.

const NUMERIC_COMPARATOR_WORDS = { '>': 'Over', '<': 'Under', '>=': 'At Least', '<=': 'At Most' };
const DATE_COMPARATOR_WORDS = { '<': 'Before', '>': 'After', '<=': 'By', '>=': 'Since' };

function numericThreshold(entities, { entityNoun, propertyLabel, property, comparator, value }) {
  const name = `${entityNoun} with ${propertyLabel} ${NUMERIC_COMPARATOR_WORDS[comparator]} ${value.toLocaleString('en-US')}`;
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

function dateThreshold(entities, { entityNoun, eventPhrase, property, comparator, year }) {
  const name = `${entityNoun} ${eventPhrase} ${DATE_COMPARATOR_WORDS[comparator]} ${year}`;
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
function relatedEntityInCountry(entities, { entityNoun, relationLabel, relationProperty, countryQid, countryLabel }) {
  const name = `${entityNoun} ${relationLabel} ${countryLabel}`;
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
// adjacent to a specific ocean, via P206. `values` is [{ qid, label }, ...].
function hasPropertyValueIn(entities, { entityNoun, prepositionPhrase, property, values }) {
  const name = `${entityNoun} ${prepositionPhrase} ${values.map((v) => v.label).join(' or ')}`;
  return {
    name,
    sparql: `
      SELECT DISTINCT ?item ?itemLabel WHERE {
        VALUES ?item { ${valuesClause(entities)} }
        VALUES ?target { ${values.map((v) => `wd:${v.qid}`).join(' ')} }
        ?item wdt:${property} ?target .
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      }
    `,
  };
}

// --- Auto-parameterized wrappers ------------------------------------------
// These resolve real threshold/target values first, then delegate to the
// pattern functions above. Each returns an array (possibly empty) so
// buildConstraints can just concatenate results without caring whether a
// given call produced zero, one, or several constraints.

async function numericThresholdAuto(entities, { entityNoun, propertyLabel, property, comparator, percentile }) {
  const value = await fetchNumericPercentile(entities, property, percentile);
  if (value == null) return [];
  return [numericThreshold(entities, { entityNoun, propertyLabel, property, comparator, value })];
}

async function dateThresholdAuto(entities, { entityNoun, eventPhrase, property, comparator, percentile }) {
  const year = await fetchYearPercentile(entities, property, percentile);
  if (year == null) return [];
  return [dateThreshold(entities, { entityNoun, eventPhrase, property, comparator, year })];
}

async function relatedEntityInCountryAuto(entities, { entityNoun, relationLabel, relationProperty, limit = AUTO_DISCOVERY_LIMIT }) {
  const countries = await fetchDistinctRelatedCountries(entities, relationProperty, limit);
  return countries.map((c) =>
    relatedEntityInCountry(entities, { entityNoun, relationLabel, relationProperty, countryQid: c.qid, countryLabel: c.label })
  );
}

async function hasPropertyValueInAuto(entities, { entityNoun, prepositionPhrase, property, limit = AUTO_DISCOVERY_LIMIT }) {
  const targets = await fetchDistinctPropertyValues(entities, property, limit);
  return targets.map((t) => hasPropertyValueIn(entities, { entityNoun, prepositionPhrase, property, values: [t] }));
}

// --- Base classes (semantic-overlap mode) ---------------------------------
// Adding a new base class means: its Wikidata class QID, an English noun
// for its entities, the PIDs backing whichever generic properties its
// entities actually have, and which auto-parameterized patterns to run
// against those properties. No hand-picked thresholds/targets, no new
// SPARQL shapes, unless a genuinely new *kind* of pattern comes up.

const BASE_CLASSES = [
  {
    name: 'US states',
    qid: 'Q35657',
    entityNoun: 'States',
    properties: {
      population: 'P1082',
      inceptionDate: 'P571',
      sharesBorderWith: 'P47',
      locatedNextToBodyOfWater: 'P206',
    },
    async buildConstraints(entities, props, entityNoun) {
      const constraints = [];
      constraints.push(
        ...(await numericThresholdAuto(entities, { entityNoun, propertyLabel: 'Population', property: props.population, comparator: '>', percentile: 0.75 }))
      );
      constraints.push(
        ...(await numericThresholdAuto(entities, { entityNoun, propertyLabel: 'Population', property: props.population, comparator: '<', percentile: 0.25 }))
      );
      constraints.push(
        ...(await dateThresholdAuto(entities, { entityNoun, eventPhrase: 'Admitted to the Union', property: props.inceptionDate, comparator: '<', percentile: 0.25 }))
      );
      constraints.push(
        ...(await dateThresholdAuto(entities, { entityNoun, eventPhrase: 'Admitted to the Union', property: props.inceptionDate, comparator: '>', percentile: 0.75 }))
      );
      constraints.push(
        ...(await relatedEntityInCountryAuto(entities, { entityNoun, relationLabel: 'Bordering', relationProperty: props.sharesBorderWith }))
      );
      constraints.push(
        ...(await hasPropertyValueInAuto(entities, { entityNoun, prepositionPhrase: 'On the', property: props.locatedNextToBodyOfWater }))
      );
      return constraints;
    },
  },
  {
    name: 'Countries of the world',
    qid: 'Q6256',
    entityNoun: 'Countries',
    properties: {
      population: 'P1082',
      inceptionDate: 'P571',
      sharesBorderWith: 'P47',
      locatedNextToBodyOfWater: 'P206',
    },
    async buildConstraints(entities, props, entityNoun) {
      const constraints = [];
      constraints.push(
        ...(await numericThresholdAuto(entities, { entityNoun, propertyLabel: 'Population', property: props.population, comparator: '>', percentile: 0.75 }))
      );
      constraints.push(
        ...(await dateThresholdAuto(entities, { entityNoun, eventPhrase: 'Formed', property: props.inceptionDate, comparator: '<', percentile: 0.25 }))
      );
      constraints.push(
        ...(await hasPropertyValueInAuto(entities, { entityNoun, prepositionPhrase: 'Bordering', property: props.sharesBorderWith }))
      );
      constraints.push(
        ...(await hasPropertyValueInAuto(entities, { entityNoun, prepositionPhrase: 'On the', property: props.locatedNextToBodyOfWater }))
      );
      return constraints;
    },
  },
];

// --- Lexical-collision templates -------------------------------------------
// Each is just a Wikidata class to fetch, plus regexes to strip a domain
// qualifier off the label before comparing (e.g. " University" -> bare
// school name). Matching happens on the stripped, lowercased label instead
// of QID -- these are genuinely different entities that just share a name.
// `strip: []` is fine when the label is already bare (e.g. state names).

const LEXICAL_TEMPLATES = [
  { name: 'US States', qid: 'Q35657', strip: [] },
  { name: 'Countries of the World', qid: 'Q6256', strip: [] },
  { name: 'Chemical Elements', qid: 'Q11344', strip: [] },
  { name: 'Constellations', qid: 'Q8928', strip: [] },
];

function applyStrip(label, stripRules) {
  let s = label;
  for (const re of stripRules) s = s.replace(re, '');
  return s.trim().toLowerCase();
}

async function fetchLexicalTemplateEntities(template) {
  const rows = await sparqlQuery(`
    SELECT ?item ?itemLabel WHERE {
      ?item wdt:P31 wd:${template.qid} .
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    } ORDER BY ?itemLabel
  `);
  return rows.map((r) => {
    const label = r.itemLabel.value;
    return { qid: qidFromUri(r.item.value), label, bareKey: applyStrip(label, template.strip) };
  });
}

// --- Shared pipeline: collision detection, assembly, dedup ----------------

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

// `keyFn` is what makes this work for both modes: QID for semantic overlap
// (same entity, two constraints), stripped label for lexical collision
// (different entities, same name).
function findCollidingPairs(constraintResults, keyFn = (e) => e.qid) {
  const pairs = [];
  for (let i = 0; i < constraintResults.length; i++) {
    for (let j = i + 1; j < constraintResults.length; j++) {
      const a = constraintResults[i];
      const b = constraintResults[j];
      const aKeys = new Set(a.entities.map(keyFn));
      const shared = b.entities.filter((e) => aKeys.has(keyFn(e)));
      if (shared.length > 0) {
        pairs.push({ a, b, shared });
      }
    }
  }
  return pairs;
}

// Builds one candidate 4-category assembly anchored on a specific colliding
// pair, preferring a second independent colliding pair to fill the other
// two slots (falls back to any other constraint if none exists).
function buildAssemblyFromAnchorPair(anchorPair, collidingPairs, constraintResults) {
  const chosen = [anchorPair.a, anchorPair.b];
  const chosenNames = new Set(chosen.map((c) => c.name));

  const secondPair = collidingPairs.find(
    (p) => p !== anchorPair && !chosenNames.has(p.a.name) && !chosenNames.has(p.b.name)
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

  return chosen.length >= 4 ? chosen.slice(0, 4) : null;
}

// How many of `names` already appear together in some existing game --
// the worst (highest) match against any single existing game, since that's
// what "this feels like a repeat" actually means.
function overlapWithExisting(names, existingCategorySets) {
  let worst = 0;
  for (const existing of existingCategorySets) {
    let count = 0;
    for (const n of names) if (existing.has(n)) count++;
    worst = Math.max(worst, count);
  }
  return worst;
}

function assembleCandidate(constraintResults, collidingPairs, existingCategorySets) {
  if (collidingPairs.length === 0) return null;

  const candidates = [];
  const seen = new Set();
  for (const anchorPair of collidingPairs) {
    const chosen = buildAssemblyFromAnchorPair(anchorPair, collidingPairs, constraintResults);
    if (!chosen) continue;

    const names = chosen.map((c) => c.name).sort();
    const key = names.join('|');
    if (seen.has(key)) continue;
    seen.add(key);

    candidates.push({ chosen, overlap: overlapWithExisting(names, existingCategorySets) });
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => a.overlap - b.overlap);
  const best = candidates[0];

  if (best.overlap > MAX_ACCEPTABLE_CATEGORY_OVERLAP) {
    console.log(
      `  -> best available combination still shares ${best.overlap}/4 categories with an existing game; ` +
        `skipping (add more constraints for variety)`
    );
    return null;
  }

  const content = {};
  best.chosen.forEach((c, i) => {
    content[COLORS[i]] = {
      category_name: c.name,
      items: c.entities.map((e) => e.label),
    };
  });
  return content;
}

function categoryNameSet(content) {
  return new Set(Object.values(content).map((c) => c.category_name));
}

async function fetchExistingCategoryNameSets(supabase) {
  const { data, error } = await supabase.from('games').select('content');
  if (error) throw error;
  return (data ?? []).map((row) => categoryNameSet(row.content));
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

async function generateCandidateForBaseClass(baseClass, existingCategorySets) {
  console.log(`\n=== ${baseClass.name} ===`);
  console.log(`Fetching ${baseClass.name}...`);
  const entities = await fetchBaseClassEntities(baseClass.qid);
  console.log(`  -> ${entities.length} entities`);

  const constraints = await baseClass.buildConstraints(entities, baseClass.properties, baseClass.entityNoun);
  const constraintResults = await fetchConstraintResults(constraints);

  const collidingPairs = findCollidingPairs(constraintResults);
  console.log(`Found ${collidingPairs.length} colliding constraint pair(s):`);
  for (const p of collidingPairs) {
    console.log(`  "${p.a.name}" x "${p.b.name}": ${p.shared.map((s) => s.label).join(', ')}`);
  }

  return assembleCandidate(constraintResults, collidingPairs, existingCategorySets);
}

async function generateLexicalCandidate(existingCategorySets) {
  console.log(`\n=== Lexical collision (${LEXICAL_TEMPLATES.map((t) => t.name).join(', ')}) ===`);

  const constraintResults = [];
  for (const t of LEXICAL_TEMPLATES) {
    console.log(`Fetching: ${t.name}`);
    const entities = await fetchLexicalTemplateEntities(t);
    console.log(`  -> ${entities.length} entities`);
    if (entities.length < MIN_CONSTRAINT_ITEMS) {
      console.log(`  -> skipping "${t.name}": too few entities`);
      continue;
    }
    constraintResults.push({ name: t.name, entities });
  }

  const collidingPairs = findCollidingPairs(constraintResults, (e) => e.bareKey);
  console.log(`Found ${collidingPairs.length} colliding template pair(s):`);
  for (const p of collidingPairs) {
    console.log(`  "${p.a.name}" x "${p.b.name}": ${p.shared.map((s) => s.label).join(', ')}`);
  }

  return assembleCandidate(constraintResults, collidingPairs, existingCategorySets);
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // Checked against every existing game regardless of status: a pending
  // near-duplicate is still a near-duplicate, and no point re-offering
  // something already rejected either.
  const existingCategorySets = await fetchExistingCategoryNameSets(supabase);

  const candidates = [];
  for (const baseClass of BASE_CLASSES) {
    const candidate = await generateCandidateForBaseClass(baseClass, existingCategorySets);
    if (candidate) {
      candidates.push(candidate);
      existingCategorySets.push(categoryNameSet(candidate)); // avoid duplicating within this same run too
    } else {
      console.log(`No usable candidate for ${baseClass.name} this run.`);
    }
  }

  const lexicalCandidate = await generateLexicalCandidate(existingCategorySets);
  if (lexicalCandidate) {
    candidates.push(lexicalCandidate);
    existingCategorySets.push(categoryNameSet(lexicalCandidate));
  } else {
    console.log('No usable lexical candidate this run.');
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
