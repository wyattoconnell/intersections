// src/app/services/play-state.store.ts
export type StringArrayMap = { [key: string]: string[] };

const GAME_VERSION = 'movies-v2';

export interface PlayState {
  guesses: string[];
  answers: string[];
  intersections: StringArrayMap;
  found: StringArrayMap;
  missed: StringArrayMap;
  gameover: boolean;
  used: boolean;
  startedAt: string;   // ISO timestamp
  lastSavedAt: string; // ISO timestamp
}

function keyFor(dateYmd: string) {
  return `gameState:${GAME_VERSION}:${dateYmd}`;
}

export function loadPlayState(dateYmd: string): PlayState | null {
  try {
    const raw = localStorage.getItem(keyFor(dateYmd));
    return raw ? (JSON.parse(raw) as PlayState) : null;
  } catch {
    return null;
  }
}

export function savePlayState(dateYmd: string, state: PlayState): void {
  try {
    localStorage.setItem(
      keyFor(dateYmd),
      JSON.stringify({ ...state, lastSavedAt: new Date().toISOString() })
    );
  } catch {
    // storage full or blocked – ignore or show a toast
  }
}

export function clearPlayState(dateYmd: string): void {
  localStorage.removeItem(keyFor(dateYmd));
}

/** Optional: clean up older days (keeps latest N states) */
export function pruneOldStates(maxToKeep = 30) {
  const keys = Object.keys(localStorage).filter(k => k.startsWith(`gameState:${GAME_VERSION}:`));
  const sorted = keys.sort().reverse(); // YYYY-MM-DD sorts lexicographically
  for (const k of sorted.slice(maxToKeep)) localStorage.removeItem(k);
}
