import { createHmac, timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const COOKIE_NAME = 'admin_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

function getSessionSecret(): string {
  const secret = process.env['ADMIN_SESSION_SECRET'];
  if (!secret) throw new Error('ADMIN_SESSION_SECRET is not set');
  return secret;
}

export function setSessionCookie(res: VercelResponse): void {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const token = `${expiresAt}.${sign(String(expiresAt), getSessionSecret())}`;
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`
  );
}

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

export function isAdminRequest(req: VercelRequest): boolean {
  try {
    const token = parseCookie(req.headers.cookie, COOKIE_NAME);
    if (!token) return false;

    const dotIndex = token.indexOf('.');
    if (dotIndex === -1) return false;
    const expiresAtStr = token.slice(0, dotIndex);
    const signature = token.slice(dotIndex + 1);

    const expiresAt = Number(expiresAtStr);
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;

    const expected = sign(expiresAtStr, getSessionSecret());
    const a = Buffer.from(signature, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch (e) {
    console.error(e);
    return false;
  }
}

export function requireAdmin(req: VercelRequest, res: VercelResponse): boolean {
  if (isAdminRequest(req)) return true;
  res.status(401).json({ error: 'Unauthorized' });
  return false;
}

export function checkPassword(candidate: unknown): boolean {
  const expected = process.env['ADMIN_PASSWORD'];
  if (!expected || typeof candidate !== 'string') return false;

  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
