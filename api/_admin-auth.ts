import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const cookieName = 'cvar-control';
const sessionLifetimeSeconds = 8 * 60 * 60;

export function adminAuthIsConfigured() {
  return Boolean(process.env.CVAR_ADMIN_PASSWORD && process.env.CVAR_INGEST_SECRET);
}

export function adminPasswordMatches(candidate: string) {
  const expected = process.env.CVAR_ADMIN_PASSWORD;
  if (!expected) return false;
  return safeEqual(sha256(candidate), sha256(expected));
}

export function createAdminSession() {
  const expiresAt = Math.floor(Date.now() / 1_000) + sessionLifetimeSeconds;
  return `${expiresAt}.${signature(String(expiresAt))}`;
}

export function adminRequestIsAuthorized(request: Request) {
  const token = readCookie(request.headers.get('cookie') || '', cookieName);
  if (!token) return false;
  const [expiresAt, suppliedSignature, extra] = token.split('.');
  if (extra || !/^\d+$/.test(expiresAt) || !suppliedSignature) return false;
  const expiresAtSeconds = Number(expiresAt);
  const now = Math.floor(Date.now() / 1_000);
  if (expiresAtSeconds <= now || expiresAtSeconds > now + sessionLifetimeSeconds) return false;
  return safeEqual(suppliedSignature, signature(expiresAt));
}

export function adminSessionCookie(token: string) {
  return `${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${sessionLifetimeSeconds}`;
}

export function clearAdminSessionCookie() {
  return `${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function loginRateLimitKey(request: Request) {
  const address = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
  return `cvar:admin-login:${sha256(address).slice(0, 24)}`;
}

function signature(value: string) {
  const secret = process.env.CVAR_INGEST_SECRET || '';
  return createHmac('sha256', secret).update(value).digest('hex');
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function readCookie(header: string, name: string) {
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return '';
}
