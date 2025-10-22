// /api/auth/verify-link.js
export const config = { runtime: 'nodejs' };
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const USER_JWT_SECRET = process.env.USER_JWT_SECRET || 'dev-secret-change-me';
const SUPABASE_URL = 'https://tpwkptzlhxitllugmlho.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// vérif du token court
function verifyShort(token) {
  try {
    const [h,b,sig] = String(token).split('.');
    if (!h || !b || !sig) return null;
    const data = `${h}.${b}`;
    const expected = crypto.createHmac('sha256', USER_JWT_SECRET).update(data).digest('base64url');
    if (expected !== sig) return null;
    const payload = JSON.parse(Buffer.from(b, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Math.floor(Date.now()/1000)) return null;
    return payload;
  } catch { return null; }
}

// créer un token de session long (30 jours)
function signSession(payload, expSecs = 60*60*24*30) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now()/1000) + expSecs })).toString('base64url');
  const data = `${header}.${body}`;
  const sig = crypto.createHmac('sha256', USER_JWT_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export default async function handler(req, res) {
  try{
    const token = req.query.token || '';
    const p = verifyShort(token);
    if (!p) return res.status(401).json({ error:'invalid or expired' });

    // Vérifier que l'utilisateur existe encore
    const { data: me, error } = await supabase
      .from('referrers')
      .select('id,email')
      .eq('id', p.sub)
      .eq('email', p.email)
      .single();
    if (error || !me) return res.status(401).json({ error:'account not found' });

    const session = signSession({ sub: me.id, email: me.email });
    return res.status(200).json({ token: session });
  }catch(e){ console.error(e); return res.status(500).json({ error:'server' }); }
}
