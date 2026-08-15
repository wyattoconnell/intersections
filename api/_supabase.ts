import { createClient } from '@supabase/supabase-js';

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

interface Database {
  public: {
    Tables: {
      games: {
        Row: { id: number; game_date: string; content: Json; source: string | null };
        Insert: { id?: number; game_date: string; content: Json; source?: string | null };
        Update: Partial<{ id: number; game_date: string; content: Json; source: string | null }>;
        Relationships: [];
      };
      game_data: {
        Row: {
          id: number;
          user_key: string;
          game_date: string;
          state: Json;
          started_at: string | null;
          last_saved_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          user_key: string;
          game_date: string;
          state: Json;
          started_at?: string | null;
          last_saved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<{
          id: number;
          user_key: string;
          game_date: string;
          state: Json;
          started_at: string | null;
          last_saved_at: string | null;
          created_at: string;
          updated_at: string;
        }>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}

let client: ReturnType<typeof createClient<Database>> | null = null;

export function getSupabase() {
  if (client) return client;

  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set');
  }

  client = createClient<Database>(url, key, {
    auth: { persistSession: false },
  });
  return client;
}

export function sendOk(res: { status: (c: number) => any }, payload: unknown, code = 200) {
  return res.status(code).json({ data: payload });
}

export function sendErr(res: { status: (c: number) => any }, message: string, code: number) {
  return res.status(code).json({ error: message });
}

export function isDateYmd(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

/** Current date (YYYY-MM-DD) in the given IANA time zone. */
export function todayInTZ(timeZone = 'America/Los_Angeles'): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')!.value;
  const m = parts.find((p) => p.type === 'month')!.value;
  const d = parts.find((p) => p.type === 'day')!.value;
  return `${y}-${m}-${d}`;
}

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function q(query: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const v = firstParam(query[key]);
  return v !== undefined ? v.trim() : undefined;
}
