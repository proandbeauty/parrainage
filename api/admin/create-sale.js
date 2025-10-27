// api/admin/create-sale.js
export const config = { runtime: 'nodejs' };

const { ensureAdmin }  = require('./_auth');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL        = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY= process.env.SUPABASE_SERVICE_KEY || '';
const supa                = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  // Auth via Authorization: Bearer <ADMIN_TOKEN>
  if (ensureAdmin(req, res) !== true) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const {
    order_id,
    institute_name,
    pro_name,
    postal_code,
    amount,
    currency,
    referral_code,
    created_at
  } = req.body || {};

  if (!institute_name || !pro_name || !postal_code || !amount || !currency || !referral_code) {
    return res.status(400).json({ error: 'champs requis manquants' });
  }

  try {
    // 1) retrouver le bénéficiaire par code (⚠️ colonne cohérente avec le reste du projet)
    const { data: ref, error: e1 } = await supa
      .from('referrers')
      .select('id, referral_code')
      .eq('referral_code', referral_code)
      .single();
    if (e1 || !ref) return res.status(404).json({ error: 'code parrain introuvable' });

    // 2) insérer la vente
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
    if (e2) return res.status(400).json({ error: e2.message });

    // 3) (optionnel) RPC/trigger commissions
    // await supa.rpc('compute_commissions_for_sale', { sale_id_input: sale.id });

    return res.json({ ok: true, sale_id: sale.id });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
