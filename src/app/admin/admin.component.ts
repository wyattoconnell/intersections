import { Component, OnInit } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { AdminService, PendingGame } from '../admin.service';

interface CategoryView {
  color: string;
  name: string;
  items: string[];
}

@Component({
  selector: 'app-admin',
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.css',
})
export class AdminComponent implements OnInit {
  checkingAuth = true;
  authenticated = false;
  password = '';
  loginError = '';
  loadError = '';
  pendingGames: PendingGame[] = [];

  constructor(private adminService: AdminService) {}

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.checkingAuth = true;
    this.adminService.getPendingGames().subscribe({
      next: (games) => {
        this.authenticated = true;
        this.pendingGames = games;
        this.checkingAuth = false;
      },
      error: (err: HttpErrorResponse) => {
        this.checkingAuth = false;
        if (err.status === 401) {
          this.authenticated = false;
        } else {
          this.loadError = 'Failed to load pending games.';
        }
      },
    });
  }

  login(): void {
    this.loginError = '';
    this.adminService.login(this.password).subscribe({
      next: () => {
        this.password = '';
        this.refresh();
      },
      error: () => {
        this.loginError = 'Incorrect password.';
      },
    });
  }

  review(game: PendingGame, action: 'approve' | 'reject'): void {
    this.adminService.reviewGame(game.id, action).subscribe({
      next: () => {
        this.pendingGames = this.pendingGames.filter((g) => g.id !== game.id);
      },
      error: () => {
        this.loadError = 'Failed to update that game.';
      },
    });
  }

  categoriesOf(game: PendingGame): CategoryView[] {
    const content = game.content ?? {};
    return ['blue', 'red', 'yellow', 'green'].map((color) => ({
      color,
      name: content[color]?.category_name ?? '',
      items: content[color]?.items ?? [],
    }));
  }
}
