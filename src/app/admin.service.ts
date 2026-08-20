import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../environments/environment';

export interface PendingGame {
  id: number;
  game_date: string;
  content: any;
  source: string | null;
  status: string;
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private http = inject(HttpClient);
  private apiBase = environment.apiBaseUrl;

  login(password: string): Observable<boolean> {
    return this.http
      .post<{ data: boolean }>(`${this.apiBase}/admin/login`, { password })
      .pipe(map((res) => !!res.data));
  }

  getPendingGames(): Observable<PendingGame[]> {
    return this.http
      .get<{ data: PendingGame[] }>(`${this.apiBase}/admin/pending-games`)
      .pipe(map((res) => res.data ?? []));
  }

  reviewGame(id: number, action: 'approve' | 'reject'): Observable<PendingGame> {
    return this.http
      .post<{ data: PendingGame }>(`${this.apiBase}/admin/pending-games`, { id, action })
      .pipe(map((res) => res.data));
  }
}
