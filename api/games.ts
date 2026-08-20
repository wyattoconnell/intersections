import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabase, sendOk, sendErr, isDateYmd, todayInTZ, q } from './_supabase.js';

const GAME_COLUMNS = 'id, game_date, content, source';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return sendErr(res, 'Method not allowed', 405);
  }

  const sb = getSupabase();

  try {
    const id = q(req.query, 'id');
    if (id) {
      const idNum = Number(id);
      if (!Number.isInteger(idNum)) return sendErr(res, 'Invalid id', 400);

      const { data: row, error } = await sb
        .from('games')
        .select(GAME_COLUMNS)
        .eq('id', idNum)
        .eq('status', 'approved')
        .maybeSingle();
      if (error) throw error;
      if (!row) return sendErr(res, 'Not found', 404);
      return sendOk(res, row);
    }

    const gameDate = q(req.query, 'game_date');
    if (gameDate) {
      if (!isDateYmd(gameDate)) return sendErr(res, 'Invalid game_date (expected YYYY-MM-DD)', 400);

      const { data: rows, error } = await sb
        .from('games')
        .select(GAME_COLUMNS)
        .eq('game_date', gameDate)
        .eq('status', 'approved')
        .order('id', { ascending: false });
      if (error) throw error;

      if (rows && rows.length > 0) {
        return sendOk(res, rows);
      }

      // No games for that exact date -> fall back to a random existing game
      // (mirrors games.php's "ORDER BY RAND() LIMIT 1" fallback).
      const { count, error: countErr } = await sb
        .from('games')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'approved');
      if (countErr) throw countErr;
      if (!count) return sendErr(res, 'No games in database', 404);

      const offset = Math.floor(Math.random() * count);
      const { data: randomRows, error: randomErr } = await sb
        .from('games')
        .select(GAME_COLUMNS)
        .eq('status', 'approved')
        .range(offset, offset);
      if (randomErr) throw randomErr;
      if (!randomRows || randomRows.length === 0) return sendErr(res, 'No games in database', 404);

      return sendOk(res, randomRows);
    }

    const dates = q(req.query, 'dates');
    if (dates) {
      const today = todayInTZ();
      const { data: rows, error } = await sb
        .from('games')
        .select('game_date')
        .eq('status', 'approved')
        .lte('game_date', today)
        .order('game_date', { ascending: false })
        .limit(365);
      if (error) throw error;

      const out = Array.from(new Set((rows ?? []).map((r) => r['game_date'] as string)));
      return sendOk(res, out);
    }

    // Default: today's puzzle.
    const today = todayInTZ();
    const { data: row, error } = await sb
      .from('games')
      .select(GAME_COLUMNS)
      .eq('game_date', today)
      .eq('status', 'approved')
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (row) return sendOk(res, row);
    return sendErr(res, 'No game for today', 404);
  } catch (e) {
    console.error(e);
    return sendErr(res, 'Server error', 500);
  }
}
