#!/usr/bin/env python3
"""
Build a Top-1000 movie dataset (English-only) with top-25 billed actors.

Inputs: IMDb TSV dumps (gzipped) in a directory.
Required files:
  - title.basics.tsv.gz
  - title.ratings.tsv.gz
  - title.principals.tsv.gz
  - name.basics.tsv.gz
  - title.akas.tsv.gz

Output:
  - JSON file with movie metadata + actors (names + IDs)

Scoring:
  score = rating * log10(numVotes)

English-only filter:
  - Keep movies that have at least one AKA with language == "en"
    or region in ENGLISH_REGIONS.
"""
import argparse
import csv
import sys
import gzip
import json
import math
from collections import defaultdict
from pathlib import Path
from typing import Dict, Iterable, List, Set, Tuple

ENGLISH_REGIONS = {"US", "GB", "CA", "AU", "NZ", "IE"}


def gz_tsv_rows(path: Path) -> Iterable[Dict[str, str]]:
    # Some IMDb rows exceed default CSV field size.
    csv.field_size_limit(sys.maxsize)
    with gzip.open(path, "rt", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f, delimiter="\t")
        for row in reader:
            yield row


def load_ratings(path: Path) -> Dict[str, Tuple[float, int]]:
    ratings: Dict[str, Tuple[float, int]] = {}
    for row in gz_tsv_rows(path):
        tconst = row["tconst"]
        try:
            rating = float(row["averageRating"])
            votes = int(row["numVotes"])
        except ValueError:
            continue
        ratings[tconst] = (rating, votes)
    return ratings


def load_english_titles(path: Path) -> Set[str]:
    english: Set[str] = set()
    for row in gz_tsv_rows(path):
        tconst = row["titleId"]
        lang = row.get("language") or ""
        region = row.get("region") or ""
        if lang == "en" or region in ENGLISH_REGIONS:
            english.add(tconst)
    return english


def compute_top_movies(
    basics_path: Path,
    ratings: Dict[str, Tuple[float, int]],
    english_titles: Set[str],
    limit: int = 1000,
) -> List[Dict[str, object]]:
    candidates: List[Dict[str, object]] = []
    for row in gz_tsv_rows(basics_path):
        if row["titleType"] != "movie":
            continue
        if row["isAdult"] == "1":
            continue
        tconst = row["tconst"]
        if tconst not in english_titles:
            continue
        if tconst not in ratings:
            continue

        rating, votes = ratings[tconst]
        if votes <= 0:
            continue

        score = rating * math.log10(votes)
        candidates.append(
            {
                "imdb_id": tconst,
                "title": row["primaryTitle"],
                "year": row.get("startYear") or None,
                "rating": rating,
                "votes": votes,
                "score": score,
            }
        )

    candidates.sort(key=lambda x: x["score"], reverse=True)
    return candidates[:limit]


def load_principals(
    principals_path: Path, top_ids: Set[str]
) -> Dict[str, List[Tuple[int, str]]]:
    by_title: Dict[str, List[Tuple[int, str]]] = defaultdict(list)
    for row in gz_tsv_rows(principals_path):
        tconst = row["tconst"]
        if tconst not in top_ids:
            continue
        cat = row.get("category") or ""
        if cat not in {"actor", "actress"}:
            continue
        try:
            ordering = int(row.get("ordering") or 0)
        except ValueError:
            ordering = 0
        nconst = row["nconst"]
        by_title[tconst].append((ordering, nconst))

    # Sort by billing order and cap to top 25
    trimmed: Dict[str, List[Tuple[int, str]]] = {}
    for tconst, entries in by_title.items():
        entries.sort(key=lambda x: x[0])
        trimmed[tconst] = entries[:25]
    return trimmed


def load_names(path: Path, needed: Set[str]) -> Dict[str, str]:
    names: Dict[str, str] = {}
    for row in gz_tsv_rows(path):
        nconst = row["nconst"]
        if nconst in needed:
            names[nconst] = row["primaryName"]
    return names


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--imdb-dir", required=True, help="Path to IMDb TSV .gz files")
    parser.add_argument("--out", required=True, help="Output JSON path")
    parser.add_argument("--limit", type=int, default=1000, help="Top N movies to keep")
    args = parser.parse_args()

    imdb_dir = Path(args.imdb_dir)
    basics = imdb_dir / "title.basics.tsv.gz"
    ratings = imdb_dir / "title.ratings.tsv.gz"
    principals = imdb_dir / "title.principals.tsv.gz"
    names = imdb_dir / "name.basics.tsv.gz"
    akas = imdb_dir / "title.akas.tsv.gz"

    missing = [p for p in [basics, ratings, principals, names, akas] if not p.exists()]
    if missing:
        raise SystemExit(f"Missing files: {', '.join(str(p) for p in missing)}")

    ratings_map = load_ratings(ratings)
    english_titles = load_english_titles(akas)
    top_movies = compute_top_movies(basics, ratings_map, english_titles, args.limit)

    top_ids = {m["imdb_id"] for m in top_movies}
    principals_map = load_principals(principals, top_ids)

    needed_names = {nconst for entries in principals_map.values() for _, nconst in entries}
    names_map = load_names(names, needed_names)

    # Attach actors (top 25 by billing order)
    for movie in top_movies:
      tconst = movie["imdb_id"]
      entries = principals_map.get(tconst, [])
      actor_ids = [nconst for _, nconst in entries]
      actors = [names_map.get(n, n) for n in actor_ids]
      movie["actor_ids"] = actor_ids
      movie["actors"] = actors

    # Build global actor list for autosuggest
    all_actor_ids = {nconst for entries in principals_map.values() for _, nconst in entries}
    all_actors = [
        {"imdb_id": nconst, "name": names_map.get(nconst, nconst)}
        for nconst in all_actor_ids
    ]
    all_actors.sort(key=lambda x: x["name"].lower())

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as f:
        json.dump(
            {
                "movies": top_movies,
                "actors": all_actors,
            },
            f,
            ensure_ascii=False,
            indent=2,
        )

    print(f"Wrote {len(top_movies)} movies and {len(all_actors)} actors to {out_path}")


if __name__ == "__main__":
    main()
