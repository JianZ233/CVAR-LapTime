import { adminAuthIsConfigured, adminPasswordMatches, adminSessionCookie, clearAdminSessionCookie, createAdminSession, loginRateLimitKey } from './_admin-auth.js';
import { redisCommand, redisIsConfigured } from './_redis.js';

export async function POST(request: Request) {
  if (!adminAuthIsConfigured() || !redisIsConfigured()) return Response.json({ error: 'Control room access is not configured' }, { status: 503, headers: noStoreHeaders });

  try {
    const attempts = Number(await redisCommand(['INCR', loginRateLimitKey(request)]));
    if (attempts === 1) await redisCommand(['EXPIRE', loginRateLimitKey(request), 600]);
    if (attempts > 10) return Response.json({ error: 'Too many attempts. Try again in 10 minutes.' }, { status: 429, headers: noStoreHeaders });

    const raw = await request.text();
    if (raw.length > 4_096) return Response.json({ error: 'Invalid request' }, { status: 400, headers: noStoreHeaders });
    const body = JSON.parse(raw) as { password?: unknown };
    if (typeof body.password !== 'string' || !adminPasswordMatches(body.password)) return Response.json({ error: 'Incorrect control room password' }, { status: 401, headers: noStoreHeaders });

    return Response.json({ ok: true }, {
      headers: { ...noStoreHeaders, 'set-cookie': adminSessionCookie(createAdminSession()) },
    });
  } catch (error) {
    console.error('Control room login failed', error);
    return Response.json({ error: 'Unable to sign in right now' }, { status: 502, headers: noStoreHeaders });
  }
}

export function DELETE() {
  return Response.json({ ok: true }, { headers: { ...noStoreHeaders, 'set-cookie': clearAdminSessionCookie() } });
}

const noStoreHeaders = { 'cache-control': 'private, no-store, max-age=0' };
