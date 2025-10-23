// /api/me/get-rib.js
export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// ---- ENV
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;
const USER_JWT_SECRET = process.env.USER_JWT_SECRET || 'dev-secret-change-me';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ---- Auth: vérifie le JWT "maison" (HS256) renvoyé par /api/auth/verify-link
function verifyTokenFromHeader(req) {
  const h = String(req.headers.authorization || '');
  const tok = h.replace(/^Bearer\s+/i, '').trim();
  if (!tok) throw new Error('missing token');

  const [h64, p64, s] = tok.split('.');
  const data = `${h64}.${p64}`;
  const sig = crypto.createHmac('sha256', USER_JWT_SECRET).update(data).digest('base64url');
  if (sig !== s) throw new Error('bad signature');

  const payload = JSON.parse(Buffer.from(p64, 'base64url').toString('utf8'));
  if (payload.exp && payload.exp < Math.floor(Date.now()/1000)) {
    throw new Error('token expired');
  }
  // payload.sub = referrer_id
  return { userId: payload.sub, email: payload.email };
}

// ---- util
function maskIban(iban) {
  if (!iban) return null;
  const clean = String(iban).replace(/\s+/g, '');
  if (clean.length <= 8) return clean;
  return clean.slice(0,4) + ' •••• •••• •••• ' + clean.slice(-4);
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
    const { userId } = verifyTokenFromHeader(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    // 1) Cherche dans bank_accounts
    let { data: ba, error: e1 } = await supabase
      .from('bank_accounts')
      .select('id, referrer_id, holder_name, iban, iban_masked, bic, banque, doc_path, status, updated_at, created_at, rgpd_consent')
      .eq('referrer_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (e1) {
      console.error('get-rib bank_accounts select error:', e1);
      return res.status(500).json({ error: 'db error' });
    }

    // 2) Si pas trouvé, tenter migration "legacy" depuis table rib
    if (!ba) {
      const { data: legacy, error: eLegacy } = await supabase
        .from('rib')
        .select('id, user_id, titulaire, iban, bic, banque, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (eLegacy) {
        console.error('get-rib legacy rib select error:', eLegacy);
      }

      if (legacy) {
        // insère dans bank_accounts (status = pending)
        const insertObj = {
          id: legacy.id,                    // on reprend l’id si possible
          referrer_id: legacy.user_id,
          holder_name: legacy.titulaire || null,
          iban: legacy.iban || null,
          bic: legacy.bic || null,
          banque: legacy.banque || null,
          iban_masked: maskIban(legacy.iban || ''),
          status: 'pending'
        };
        const { data: ins, error: eIns } = await supabase
          .from('bank_accounts')
          .insert([insertObj])
          .select()
          .maybeSingle();
        if (eIns) {
          console.error('get-rib migrate insert error:', eIns);
        } else {
          ba = ins;
        }
      }
    }

    // 3) Réponse compatible avec ton front (titulaire/iban/bic/banque/doc/status…)
    return res.status(200).json({
      ok: true,
      rib: ba ? {
        id: ba.id,
        titulaire: ba.holder_name || null,
        iban: ba.iban || null,
        iban_masked: ba.iban_masked || maskIban(ba.iban || ''),
        bic: ba.bic || null,
        banque: ba.banque || null,
        justificatif_path: ba.doc_path || null,
        status: ba.status || 'pending',
        rgpd_consent: !!ba.rgpd_consent,
        updated_at: ba.updated_at, created_at: ba.created_at
      } : null
    });
  } catch (e) {
    console.error('get-rib server error:', e);
    return res.status(401).json({ error: 'unauthorized' });
  }
}
