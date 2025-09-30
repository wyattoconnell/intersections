// src/app/services/data.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../environments/environment';

type ApiOk<T> = { data: T };

export interface Game {
  id: number;
  game_date: string; // 'YYYY-MM-DD'
  content: any;
  source: string;
}

@Injectable({ providedIn: 'root' })
export class DataService {
  //private http = inject(HttpClient);
  private apiBase = environment.apiBaseUrl;    
  private jsonFallbackUrl = 'assets/data.json'; 

  //for local dev
  private jsonUrl = 'assets/data.json'; constructor(private http: HttpClient) { } getData(): Observable<any> { return this.http.get<any>(this.jsonUrl); }

  // getGameToday() {
  //   return this.http
  //     .get<{ data: Game }>(`${this.apiBase}/games.php`)
  //     .pipe(map(res => res.data));
  // }

  // getDataToday() {
  //   return this.getGameToday().pipe(map(g => g.content));
  // }


  //FOR ARCHIVE VIEW: //
  /** USAGE: // e.g., archive.component.ts
    this.dataService.getGameByDate('2025-09-15').subscribe(game => {
    if (!game) { this.error = 'No game for that date'; return; }
    this.gameDate = game.game_date;
    this.source = game.source;
    this.data = game.content;

    const res = this.itemSelector.selectEfficientItems(this.data);
    this.answers = res.selectedItems;
    this.intersections = res.intersections;
    this.missed = this.intersections;
    this.par = this.answers.length;
  });*/


/** Full row for a specific calendar day (YYYY-MM-DD). */
  // getGameByDate(date: string) {
  //   return this.http
  //     .get<{ data: Game[] }>(`${this.apiBase}/games.php`, { params: { game_date: date } })
  //     .pipe(
  //       map(res => res.data?.[0] as Game), // API returns an array for date queries
  //     );
  // }

  // /** Content-only for a specific day (keeps your existing component shape). */
  // getDataByDate(date: string) {
  //   return this.getGameByDate(date).pipe(map(g => g?.content ?? {}));
  // }


  // getData(opts?: { date?: string; id?: number }): Observable<any> {
  //   return this.getGame(opts).pipe(
  //     map(game => game?.content ?? {}),
  //     catchError(() => this.http.get<any>(this.jsonFallbackUrl))
  //   );
  // }

  // /** returns the full game row: { id, game_date, source, content } */
  // getGame(opts?: { date?: string; id?: number }): Observable<Game> {
  //   let params = new HttpParams();
  //   if (opts?.id != null) params = params.set('id', String(opts.id));
  //   if (opts?.date) params = params.set('game_date', opts.date);
  //   if (opts?.id != null) {
  //     return this.http.get<ApiOk<Game>>(`${this.apiBase}/games.php`, { params })
  //       .pipe(map(res => res.data));
  //   } else {
  //     return this.http.get<ApiOk<Game[]>>(`${this.apiBase}/games.php`, { params })
  //       .pipe(map(res => (res.data?.[0] as Game)));
  //   }
  // }
}
