import { Component, OnInit } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { AdminService, PendingGame } from '../admin.service';

interface ItemView {
  text: string;
  overlap: boolean;
}

interface CategoryView {
  color: string;
  name: string;
  items: ItemView[];
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
    const overlaps = this.overlapItems(content);
    return ['blue', 'red', 'yellow', 'green'].map((color) => ({
      color,
      name: content[color]?.category_name ?? '',
      items: (content[color]?.items ?? []).map((text: string) => ({
        text,
        overlap: overlaps.has(text.toLowerCase()),
      })),
    }));
  }

  // Same rule item-selector.service.ts uses to detect intersections: any
  // item text (case-insensitive) that appears in 2+ of the four
  // categories. Mirrored here just for display so pending candidates are
  // easy to eyeball -- not used for any gameplay logic.
  private overlapItems(content: Record<string, { items?: string[] }>): Set<string> {
    const seenInCategory = new Map<string, number>();
    for (const category of Object.values(content)) {
      const seen = new Set<string>();
      for (const item of category.items ?? []) {
        const key = item.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        seenInCategory.set(key, (seenInCategory.get(key) ?? 0) + 1);
      }
    }
    const overlaps = new Set<string>();
    for (const [key, count] of seenInCategory) {
      if (count > 1) overlaps.add(key);
    }
    return overlaps;
  }
}
