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

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
    const { userId } = verifyTokenFromHeader(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const {
      titulaire, iban, bic, banque,
      justificatif_path, rgpd_consent
    } = (req.body || {});

    if (!titulaire || !iban) {
      return res.status(400).json({ error: 'titulaire et iban requis' });
    }

    // upsert dans bank_accounts pour ce referrer
    const { data: existing, error: eSel } = await supabase
      .from('bank_accounts')
      .select('id')
      .eq('referrer_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (eSel) {
      console.error('save-rib select bank_accounts error:', eSel);
      return res.status(500).json({ error: 'db error' });
    }

    const patch = {
      referrer_id: userId,
      holder_name: titulaire,
      iban: iban,
      bic: bic || null,
      banque: banque || null,
      iban_masked: maskIban(iban),
      status: 'pending',                 // à chaque modif utilisateur, on repasse en "pending"
      rgpd_consent: !!rgpd_consent
    };
    if (justificatif_path) patch.doc_path = justificatif_path;

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
        return res.status(500).json({ error: 'db error' });
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
        return res.status(500).json({ error: 'db error' });
      }
      row = ins;
    }

    // (Optionnel) écrire aussi dans la table legacy "rib" pour archive/compat
    try {
      await supabase.from('rib').upsert({
        id: row.id,                      // on réutilise l’id si possible
        user_id: userId,
        titulaire: titulaire,
        iban: iban,
        bic: bic || null,
        banque: banque || null,
        created_at: row.created_at || new Date().toISOString()
      }, { onConflict: 'id' });
    } catch (e) {
      // no-op si la table rib n'existe pas / pas critique
    }

    return res.status(200).json({ ok: true, rib_id: row.id, status: row.status });
  } catch (e) {
    console.error('save-rib server error:', e);
    return res.status(401).json({ error: 'unauthorized' });
  }
}
