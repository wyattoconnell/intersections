import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sendOk, sendErr } from '../_supabase.js';
import { checkPassword, setSessionCookie } from '../_admin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return sendErr(res, 'Method not allowed', 405);
  }

  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (!checkPassword(body['password'])) {
      return sendErr(res, 'Invalid password', 401);
    }

    setSessionCookie(res);
    return sendOk(res, true);
  } catch (e) {
    console.error(e);
    return sendErr(res, 'Server error', 500);
  }
}
