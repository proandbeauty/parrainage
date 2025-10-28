export const config = { runtime: 'nodejs' };
import { createClient } from '@supabase/supabase-js';
import { ensureAdmin } from './_auth';

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  const ok = ensureAdmin(req, res);
  if (ok !== true) return;

  try {
    if (req.method !== 'POST') return res.status(405).json({ error:'Method Not Allowed' });

    const {
      order_id, institute_name, pro_name, postal_code,
      amount, currency, referral_code, created_at
    } = req.body || {};

    if (!institute_name || !pro_name || !postal_code || !amount || !currency || !referral_code) {
      return res.status(400).json({ error:'champs requis manquants' });
    }

    const { data: ref, error: e1 } = await supa
      .from('referrers')
      .select('id, code')
      .eq('code', referral_code)
      .single();

    if (e1 || !ref) return res.status(404).json({ error:'code parrain introuvable' });

    const toInsert = {
      order_id: order_id || null,
      institute_name,
      pro_name,
      postal_code,
      amount,
      currency,
      created_at: created_at || new Date().toISOString(),
      referrer_id: ref.id,
      referral_code
    };

    const { data: sale, error: e2 } = await supa
      .from('sales')
      .insert(toInsert)
      .select('id')
      .single();

    if (e2) return res.status(400).json({ error:e2.message });

    return res.status(200).json({ ok:true, sale_id: sale.id });
  } catch (e) {
    return res.status(500).json({ error:'server error (create-sale)', detail:String(e?.message||e) });
  }
}
