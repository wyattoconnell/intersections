// src/app/services/data.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../environments/environment';
import { PlayState} from './play-state.store';
import { ItemSelectorService } from './item-selector.service';


export interface Game {
  id: number;
  game_date: string; // 'YYYY-MM-DD'
  content: any;
  source: string;
}

type MovieEntry = {
  imdb_id: string;
  title: string;
  year?: string;
  rating?: number;
  actors: string[];
};

type MovieDataset = {
  movies: MovieEntry[];
  actors?: Array<{ imdb_id?: string; name?: string } | string>;
  graph?: {
    neighbors?: Record<string, Array<{ imdb_id: string; shared_count: number }>>;
  };
};

@Injectable({ providedIn: 'root' })
export class DataService {
  private http = inject(HttpClient);
  private itemSelector = inject(ItemSelectorService);
  private jsonFallbackUrl = 'assets/data.json'; 
  private indexedMovies: MovieEntry[] = [];
  private actorToMovies: Map<string, number[]> = new Map();
  private neighbors: Map<number, number[]> = new Map();
  private movieActors: Map<number, Set<string>> = new Map();
  private imdbToIndex: Map<string, number> = new Map();
  private indexedKey: string = '';

  //for local dev
  // private jsonUrl = 'assets/data.json'; constructor(private http: HttpClient) { } getData(): Observable<any> { return this.http.get<any>(this.jsonUrl); }

  getGameToday() {
    const today = this.formatDateYmd(new Date());
    return this.getGameByDate(today);
  }

  getAllGameDates() {
    const today = new Date();
    const days = 7;
    const dates: string[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - i);
      dates.push(this.formatDateYmd(d));
    }
    return of(dates);
  }

  getDataToday() {
    return this.getGameToday().pipe(map(g => g.content));
  }


  //FOR ARCHIVE VIEW: //
  // e.g., archive.component.ts
    // this.dataService.getGameByDate('2025-09-15').subscribe(game => {
    // if (!game) { this.error = 'No game for that date'; return; }
    // this.gameDate = game.game_date;
    // this.source = game.source;
    // this.data = game.content;

    // const res = this.itemSelector.selectEfficientItems(this.data);
    // this.answers = res.selectedItems;
    // this.intersections = res.intersections;
    // this.missed = this.intersections;
    // this.par = this.answers.length;
    // });


/** Full row for a specific calendar day (YYYY-MM-DD). */
  getGameByDate(date: string) {
    return this.http.get<MovieDataset>(this.jsonFallbackUrl).pipe(
      map(ds => this.generateGameFromDataset(ds, date)),
      catchError(() => of({
        id: 0,
        game_date: date,
        content: {},
        source: 'dataset',
      } as Game))
    );
  }

  /** Content-only for a specific day (keeps your existing component shape). */
  getDataByDate(date: string) {
    return this.getGameByDate(date).pipe(map(g => g?.content ?? {}));
  }


  getData(opts?: { date?: string; id?: number }): Observable<any> {
    return this.getGame(opts).pipe(map(game => game?.content ?? {}));
  }

  /** Global actor list for autosuggest (from assets/data.json) */
  getActorList(): Observable<string[]> {
    return this.http.get<any>(this.jsonFallbackUrl).pipe(
      map(res => {
        const raw = res?.actors ?? [];
        if (Array.isArray(raw)) {
          if (raw.length > 0 && typeof raw[0] === 'object' && raw[0] !== null) {
            return raw
              .map((r: any) => r.name ?? r.primaryName ?? r)
              .filter((v: any) => typeof v === 'string');
          }
          return raw.map((v: any) => String(v));
        }
        return [];
      }),
      catchError(() => of([]))
    );
  }

  /** returns the full game row: { id, game_date, source, content } */
  getGame(opts?: { date?: string; id?: number }): Observable<Game> {
    const date = opts?.date ?? this.formatDateYmd(new Date());
    return this.getGameByDate(date);
  }

  private generateGameFromDataset(dataset: MovieDataset, date?: string): Game {
    const movies = dataset?.movies ?? [];
    if (movies.length < 4) {
      return {
        id: 0,
        game_date: date ?? this.formatDateYmd(new Date()),
        content: {},
        source: 'dataset',
      };
    }

    this.ensureIndex(dataset);

    const colors = ['green', 'red', 'yellow', 'blue'] as const;
    const maxAttempts = 500;
    const seed = this.hashDate(date ?? this.formatDateYmd(new Date()));
    const rng = this.mulberry32(seed);
    let bestGame: any = null;
    let bestPar = Number.POSITIVE_INFINITY;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const sample = this.sampleOverlapMovies(rng);
      if (sample.length < 4) continue;
      const content: any = {};
      colors.forEach((color, idx) => {
        const m = sample[idx];
        content[color] = {
          category_name: m.title,
          items: m.actors,
          year: m.year,
          rating: m.rating,
          imdb_id: m.imdb_id,
        };
      });
      const par = this.itemSelector.selectEfficientItems(content).selectedItems.length;
      if (par < bestPar) {
        bestPar = par;
        bestGame = content;
      }
      if (par <= 7) {
        bestGame = content;
        break;
      }
    }

    return {
      id: 0,
      game_date: date ?? this.formatDateYmd(new Date()),
      content: bestPar <= 7 ? (bestGame ?? {}) : {},
      source: bestPar <= 7 ? 'dataset' : 'dataset-unfit',
    };
  }

  private ensureIndex(dataset: MovieDataset): void {
    const key = `m:${dataset.movies?.length ?? 0}`;
    if (this.indexedKey === key && this.indexedMovies.length > 0) return;

    this.indexedKey = key;
    this.indexedMovies = (dataset.movies ?? []).filter(m => Array.isArray(m.actors) && m.actors.length > 0);
    this.actorToMovies = new Map();
    this.neighbors = new Map();
    this.movieActors = new Map();
    this.imdbToIndex = new Map();

    // Build actor -> movies index
    this.indexedMovies.forEach((m, idx) => {
      this.imdbToIndex.set(m.imdb_id, idx);
      const actorSet = new Set<string>();
      for (const actor of m.actors) {
        const keyActor = actor.trim();
        if (!keyActor) continue;
        actorSet.add(keyActor.toLowerCase());
        const list = this.actorToMovies.get(keyActor) ?? [];
        list.push(idx);
        this.actorToMovies.set(keyActor, list);
      }
      this.movieActors.set(idx, actorSet);
    });

    // Build movie neighbors by shared actors (>=1)
    const graphNeighbors = dataset.graph?.neighbors;
    if (graphNeighbors && Object.keys(graphNeighbors).length > 0) {
      for (const [imdbId, neigh] of Object.entries(graphNeighbors)) {
        const srcIdx = this.imdbToIndex.get(imdbId);
        if (srcIdx === undefined) continue;
        for (const n of neigh) {
          const dstIdx = this.imdbToIndex.get(n.imdb_id);
          if (dstIdx === undefined) continue;
          const list = this.neighbors.get(srcIdx) ?? [];
          list.push(dstIdx);
          this.neighbors.set(srcIdx, list);
        }
      }
    } else {
      const pairCounts: Map<string, number> = new Map();
      for (const movieIndices of this.actorToMovies.values()) {
        if (movieIndices.length < 2) continue;
        for (let i = 0; i < movieIndices.length; i++) {
          for (let j = i + 1; j < movieIndices.length; j++) {
            const a = movieIndices[i];
            const b = movieIndices[j];
            const keyPair = a < b ? `${a}|${b}` : `${b}|${a}`;
            pairCounts.set(keyPair, (pairCounts.get(keyPair) ?? 0) + 1);
          }
        }
      }
      for (const [keyPair, count] of pairCounts.entries()) {
        if (count < 1) continue;
        const [aStr, bStr] = keyPair.split('|');
        const a = Number(aStr);
        const b = Number(bStr);
        const aList = this.neighbors.get(a) ?? [];
        const bList = this.neighbors.get(b) ?? [];
        aList.push(b);
        bList.push(a);
        this.neighbors.set(a, aList);
        this.neighbors.set(b, bList);
      }
    }
  }

  private sampleOverlapMovies(rng: () => number): MovieEntry[] {
    const actors = Array.from(this.actorToMovies.entries()).filter(([, list]) => list.length >= 2);
    if (actors.length === 0) return [];

    for (let tries = 0; tries < 50; tries++) {
      const [_, movieList] = this.pickRandom(actors, rng);
      const pair = this.pickTwoDistinct(movieList, rng);
      if (!pair) continue;
      const [aIdx, bIdx] = pair;

      const neighborSet = new Set<number>([
        ...(this.neighbors.get(aIdx) ?? []),
        ...(this.neighbors.get(bIdx) ?? []),
      ]);
      neighborSet.delete(aIdx);
      neighborSet.delete(bIdx);

      const neighborsArr = Array.from(neighborSet);
      if (neighborsArr.length < 2) continue;

      const cIdx = this.pickRandom(neighborsArr, rng);
      const neighborSet2 = new Set<number>([
        ...(this.neighbors.get(aIdx) ?? []),
        ...(this.neighbors.get(bIdx) ?? []),
        ...(this.neighbors.get(cIdx) ?? []),
      ]);
      neighborSet2.delete(aIdx);
      neighborSet2.delete(bIdx);
      neighborSet2.delete(cIdx);
      const neighborsArr2 = Array.from(neighborSet2);
      if (neighborsArr2.length < 1) continue;

      const dIdx = this.pickRandom(neighborsArr2, rng);

      const picks = [aIdx, bIdx, cIdx, dIdx];
      if (!this.isValidOverlapSet(picks)) continue;

      return [
        this.indexedMovies[aIdx],
        this.indexedMovies[bIdx],
        this.indexedMovies[cIdx],
        this.indexedMovies[dIdx],
      ];
    }
    return [];
  }

  private pickRandom<T>(arr: T[], rng: () => number): T {
    const idx = Math.floor(rng() * arr.length);
    return arr[idx];
  }

  private pickTwoDistinct(arr: number[], rng: () => number): [number, number] | null {
    if (arr.length < 2) return null;
    const first = this.pickRandom(arr, rng);
    let second = this.pickRandom(arr, rng);
    let guard = 0;
    while (second === first && guard < 10) {
      second = this.pickRandom(arr, rng);
      guard++;
    }
    if (second === first) return null;
    return [first, second];
  }

  private isValidOverlapSet(indices: number[]): boolean {
    // No franchise-like pairs
    for (let i = 0; i < indices.length; i++) {
      for (let j = i + 1; j < indices.length; j++) {
        if (this.isFranchisePair(this.indexedMovies[indices[i]], this.indexedMovies[indices[j]])) {
          return false;
        }
      }
    }

    // Each movie must share an actor with at least one other movie in the set
    for (let i = 0; i < indices.length; i++) {
      let hasOverlap = false;
      for (let j = 0; j < indices.length; j++) {
        if (i === j) continue;
        if (this.hasActorOverlap(indices[i], indices[j])) {
          hasOverlap = true;
          break;
        }
      }
      if (!hasOverlap) return false;
    }
    return true;
  }

  private hasActorOverlap(aIdx: number, bIdx: number): boolean {
    const aSet = this.movieActors.get(aIdx);
    const bSet = this.movieActors.get(bIdx);
    if (!aSet || !bSet) return false;
    for (const a of aSet) {
      if (bSet.has(a)) return true;
    }
    return false;
  }


  private isFranchisePair(a: MovieEntry, b: MovieEntry): boolean {
    const aBase = this.normalizeTitle(a.title);
    const bBase = this.normalizeTitle(b.title);
    if (aBase && bBase && aBase === bBase) return true;

    const aTokens = this.titleTokens(a.title);
    const bTokens = this.titleTokens(b.title);
    if (aTokens.length >= 2 && bTokens.length >= 2) {
      const aSet = new Set(aTokens);
      const bSet = new Set(bTokens);
      let inter = 0;
      for (const t of aSet) if (bSet.has(t)) inter++;
      const union = aSet.size + bSet.size - inter;
      const jaccard = union > 0 ? inter / union : 0;
      if (jaccard >= 0.6) return true;
    }
    return false;
  }

  private normalizeTitle(title: string): string {
    return this.titleTokens(title).join(' ');
  }

  private titleTokens(title: string): string[] {
    const stop = new Set([
      'the','a','an','of','and','to','in','on','for','with','from',
      'part','chapter','episode','return','returns','rise','rises','revenge',
      'ii','iii','iv','v','vi','vii','viii','ix','x'
    ]);
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t && !stop.has(t) && !/^\d+$/.test(t));
  }

  private hashDate(dateYmd: string): number {
    let h = 2166136261;
    for (let i = 0; i < dateYmd.length; i++) {
      h ^= dateYmd.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  private mulberry32(seed: number): () => number {
    let t = seed;
    return () => {
      t += 0x6D2B79F5;
      let x = Math.imul(t ^ (t >>> 15), t | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  private formatDateYmd(date: Date, timeZone: string = 'America/Los_Angeles'): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const y = parts.find(p => p.type === 'year')!.value;
    const m = parts.find(p => p.type === 'month')!.value;
    const d = parts.find(p => p.type === 'day')!.value;
    return `${y}-${m}-${d}`;
  }
}

@Injectable({ providedIn: 'root' })
export class DataSaver {
  private apiBase = environment.apiBaseUrl; 

  constructor(private http: HttpClient) {}

  savePlayState(userKey: string, gameDate: string, state: PlayState) {
    userKey = getOrCreateUserKey();
    return this.http.post(`${environment.apiBaseUrl}/game_data.php?_method=PUT`, {
      user_key: userKey,
      game_date: gameDate,
      state,
      started_at: state.startedAt ?? null,
      last_saved_at: state.lastSavedAt ?? null
    }, {
      headers: { 'X-HTTP-Method-Override': 'PUT' }
    });
  }
  
  loadPlayState(userKey: string, gameDate: string) {
    return this.http.get<{data:any}>(`${environment.apiBaseUrl}/game_data.php`, {
      params: { user_key: userKey, game_date: gameDate }
    });
  }
}

// user-key.ts
export function getOrCreateUserKey(storageKey = 'user_key'): string {
  let k = localStorage.getItem(storageKey);
  if (k) return k;

  // Generate a UUID (modern browsers)
  if ('randomUUID' in crypto) {
    k = crypto.randomUUID();
  } else {
    // simple fallback UUID v4-ish
    k = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
  localStorage.setItem(storageKey, k);
  return k;
}
