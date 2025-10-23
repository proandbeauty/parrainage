// /api/me/save-rib.js
export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;
const USER_JWT_SECRET = process.env.USER_JWT_SECRET || 'dev-secret-change-me';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// Auth
function verifyTokenFromHeader(req) {
  const h = String(req.headers.authorization || '');
  const tok = h.replace(/^Bearer\s+/i, '').trim();
  if (!tok) throw new Error('missing token');
  const [h64, p64, s] = tok.split('.');
  const data = `${h64}.${p64}`;
  const sig = crypto.createHmac('sha256', USER_JWT_SECRET).update(data).digest('base64url');
  if (sig !== s) throw new Error('bad signature');
  const payload = JSON.parse(Buffer.from(p64, 'base64url').toString('utf8'));
  if (payload.exp && payload.exp < Math.floor(Date.now()/1000)) throw new Error('token expired');
  return { userId: payload.sub, email: payload.email };
}

function maskIban(iban) {
  if (!iban) return null;
  const clean = String(iban).replace(/\s+/g, '');
  if (clean.length <= 8) return clean;
  return clean.slice(0,4) + ' •••• •••• •••• ' + clean.slice(-4);
}

function bad(res, msg, code=400, detail){ 
  return res.status(code).json({ error: msg, detail }); 
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return bad(res,'Method Not Allowed',405);
    const { userId } = verifyTokenFromHeader(req);
    if (!userId) return bad(res,'unauthorized',401);

    const body = (req.body || {});
    const titulaire = (body.titulaire || '').trim();
    const iban      = (body.iban || '').trim().replace(/\s+/g,'');
    const bic       = (body.bic || null) ? String(body.bic).trim() : null;
    const banque    = (body.banque || null) ? String(body.banque).trim() : null;
    const justificatif_path = body.justificatif_path || body.justificatif || null;
    const rgpd_consent = !!body.rgpd_consent;

    if (!titulaire || !iban) {
      return bad(res, 'titulaire et iban requis');
    }

    // Existe déjà ?
    const { data: existing, error: eSel } = await supabase
      .from('bank_accounts')
      .select('id')
      .eq('referrer_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (eSel) {
      console.error('save-rib select error:', eSel);
      return bad(res, 'db error (select)', 500, eSel.message || String(eSel));
    }

    const patch = {
      referrer_id: userId,
      holder_name: titulaire,
      iban,
      bic,
      banque,
      iban_masked: maskIban(iban),
      status: 'pending'
    };
    if (justificatif_path) patch.doc_path = justificatif_path;
    // on ne met rgpd_consent que si fourni (pour éviter les bases encore sans colonne)
    if (body.hasOwnProperty('rgpd_consent')) patch.rgpd_consent = rgpd_consent;

    let row;
    if (existing && existing.id) {
      const { data: upd, error: eUpd } = await supabase
        .from('bank_accounts')
        .update(patch)
        .eq('id', existing.id)
        .select()
        .maybeSingle();
      if (eUpd) {
        console.error('save-rib update error:', eUpd);
        return bad(res, 'db error (update)', 500, eUpd.message || String(eUpd));
      }
      row = upd;
    } else {
      const { data: ins, error: eIns } = await supabase
        .from('bank_accounts')
        .insert([patch])
        .select()
        .maybeSingle();
      if (eIns) {
        console.error('save-rib insert error:', eIns);
        return bad(res, 'db error (insert)', 500, eIns.message || String(eIns));
      }
      row = ins;
    }

    // (optionnel) écriture “legacy” dans rib si la table existe
    try {
      await supabase.from('rib').upsert({
        id: row.id,
        user_id: userId,
        titulaire,
        iban,
        bic,
        banque,
        created_at: row.created_at || new Date().toISOString()
      }, { onConflict: 'id' });
    } catch {}

    return res.status(200).json({ ok: true, rib_id: row.id, status: row.status });
  } catch (e) {
    console.error('save-rib server error:', e);
    return bad(res,'unauthorized',401, e.message || String(e));
  }
}
