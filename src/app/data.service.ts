// src/app/services/data.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../environments/environment';
import { PlayState} from './play-state.store';

type ApiOk<T> = { data: T };
export type ApiErr = { error: string };

export interface Game {
  id: number;
  game_date: string; // 'YYYY-MM-DD'
  content: any;
  source: string;
}

@Injectable({ providedIn: 'root' })
export class DataService {
  private http = inject(HttpClient);
  private apiBase = environment.apiBaseUrl;    
  private jsonFallbackUrl = 'assets/data.json'; 

  //for local dev
  // private jsonUrl = 'assets/data.json'; constructor(private http: HttpClient) { } getData(): Observable<any> { return this.http.get<any>(this.jsonUrl); }

  getGameToday() {
    return this.http
      .get<{ data: Game }>(`${this.apiBase}/games.php`)
      .pipe(map(res => res.data));
  }

  getAllGameDates() {
    return this.http
      .get<ApiOk<string[]>>(`${this.apiBase}/games.php`, { params: { dates: '1' } })
      .pipe(map(res => res.data ?? []));
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
    return this.http
      .get<{ data: Game[] }>(`${this.apiBase}/games.php`, { params: { game_date: date } })
      .pipe(
        map(res => res.data?.[0] as Game), // API returns an array for date queries
      );
  }

  /** Content-only for a specific day (keeps your existing component shape). */
  getDataByDate(date: string) {
    return this.getGameByDate(date).pipe(map(g => g?.content ?? {}));
  }


  getData(opts?: { date?: string; id?: number }): Observable<any> {
    return this.getGame(opts).pipe(
      map(game => game?.content ?? {}),
      catchError(() => this.http.get<any>(this.jsonFallbackUrl))
    );
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
    let params = new HttpParams();
    if (opts?.id != null) params = params.set('id', String(opts.id));
    if (opts?.date) params = params.set('game_date', opts.date);
    if (opts?.id != null) {
      return this.http.get<ApiOk<Game>>(`${this.apiBase}/games.php`, { params })
        .pipe(map(res => res.data));
    } else {
      return this.http.get<ApiOk<Game[]>>(`${this.apiBase}/games.php`, { params })
        .pipe(map(res => (res.data?.[0] as Game)));
    }
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
