// /api/me/_auth.js
import crypto from 'crypto';
const USER_JWT_SECRET = process.env.USER_JWT_SECRET || 'dev-secret-change-me';

export function verifyAuth(req) {
  const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!auth) return null;
  const [h,b,sig] = auth.split('.');
  if (!h || !b || !sig) return null;
  const data = `${h}.${b}`;
  const expected = crypto.createHmac('sha256', USER_JWT_SECRET).update(data).digest('base64url');
  if (expected !== sig) return null;
  const payload = JSON.parse(Buffer.from(b, 'base64url').toString('utf8'));
  if (payload.exp && payload.exp < Math.floor(Date.now()/1000)) return null;
  return payload; // { sub, email, exp }
}
