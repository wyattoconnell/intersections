import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabase, sendOk, sendErr } from '../_supabase.js';
import { requireAdmin } from '../_admin.js';

const GAME_COLUMNS = 'id, game_date, content, source, status';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAdmin(req, res)) return;

  const sb = getSupabase();

  try {
    if (req.method === 'GET') {
      const { data: rows, error } = await sb
        .from('games')
        .select(GAME_COLUMNS)
        .eq('status', 'pending')
        .order('game_date', { ascending: true });
      if (error) throw error;
      return sendOk(res, rows ?? []);
    }

    if (req.method === 'POST') {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const id = Number(body['id']);
      const action = body['action'];

      if (!Number.isInteger(id)) return sendErr(res, 'Valid id is required', 400);
      if (action !== 'approve' && action !== 'reject') {
        return sendErr(res, 'action must be "approve" or "reject"', 400);
      }

      const status = action === 'approve' ? 'approved' : 'rejected';
      const { data: row, error } = await sb
        .from('games')
        .update({ status })
        .eq('id', id)
        .select(GAME_COLUMNS)
        .single();
      if (error) throw error;

      return sendOk(res, row);
    }

    return sendErr(res, 'Method not allowed', 405);
  } catch (e) {
    console.error(e);
    return sendErr(res, 'Server error', 500);
  }
}
