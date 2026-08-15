import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabase, sendOk, sendErr, isDateYmd, q, type Json } from './_supabase';

const STATE_COLUMNS = 'id, user_key, game_date, state, started_at, last_saved_at, created_at, updated_at';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const sb = getSupabase();

  try {
    if (req.method === 'GET') {
      const userKey = q(req.query, 'user_key');
      const gameDate = q(req.query, 'game_date');

      if (!userKey) return sendErr(res, 'user_key is required', 400);
      if (!gameDate || !isDateYmd(gameDate)) {
        return sendErr(res, 'Valid game_date (YYYY-MM-DD) is required', 400);
      }

      const { data: row, error } = await sb
        .from('game_data')
        .select(STATE_COLUMNS)
        .eq('user_key', userKey)
        .eq('game_date', gameDate)
        .maybeSingle();
      if (error) throw error;

      return sendOk(res, row ?? null);
    }

    if (req.method === 'PUT') {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const userKey = body['user_key'];
      const gameDate = body['game_date'];
      const state = body['state'];
      const startedAt = (body['started_at'] as string | null | undefined) ?? null;
      const lastSavedAt = (body['last_saved_at'] as string | null | undefined) ?? null;

      if (!userKey || typeof userKey !== 'string') return sendErr(res, 'user_key is required', 400);
      if (!gameDate || typeof gameDate !== 'string' || !isDateYmd(gameDate)) {
        return sendErr(res, 'Valid game_date (YYYY-MM-DD) is required', 400);
      }
      if (typeof state !== 'object' || state === null) return sendErr(res, 'state must be an object', 400);

      const { data: existing } = await sb
        .from('game_data')
        .select('started_at')
        .eq('user_key', userKey)
        .eq('game_date', gameDate)
        .maybeSingle();

      // Keep the original started_at unless the caller explicitly sent a new one
      // (mirrors game_data.php's COALESCE(VALUES(started_at), started_at)).
      const resolvedStartedAt = startedAt ?? (existing as any)?.started_at ?? null;

      const { data: row, error } = await sb
        .from('game_data')
        .upsert(
          {
            user_key: userKey,
            game_date: gameDate,
            state: state as Json,
            started_at: resolvedStartedAt,
            last_saved_at: lastSavedAt,
          },
          { onConflict: 'user_key,game_date' }
        )
        .select(STATE_COLUMNS)
        .single();
      if (error) throw error;

      return sendOk(res, row, existing ? 200 : 201);
    }

    return sendErr(res, 'Method not allowed', 405);
  } catch (e) {
    console.error(e);
    return sendErr(res, 'Server error', 500);
  }
}
