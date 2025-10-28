// api/admin/create-sale.js  (CommonJS)
const { ensureAdmin } = require('./_auth');
const { getAdminClient } = require('../_lib/supabaseAdmin');

module.exports.config = { runtime: 'nodejs' };

module.exports = async (req, res) => {
  if (ensureAdmin(req, res) !== true) return;
  if (req.method !== 'POST') return res.status(405).json({ error:'Method Not Allowed' });

  const {
    order_id, institute_name, pro_name, postal_code,
    amount, currency, referral_code, created_at
  } = req.body || {};

  if (!institute_name || !pro_name || !postal_code || !amount || !currency || !referral_code) {
    return res.status(400).json({ error:'champs requis manquants' });
    }

  try {
    const supa = getAdminClient();

    const { data: ref, error: e1 } = await supa
      .from('referrers').select('id, code').eq('code', referral_code).single();
    if (e1 || !ref) return res.status(404).json({ error:'code parrain introuvable' });

    const toInsert = {
      order_id: order_id || null,
      institute_name, pro_name, postal_code,
      amount, currency,
      created_at: created_at || new Date().toISOString(),
      referrer_id: ref.id,
      referral_code
    };

    const { data: sale, error: e2 } = await supa.from('sales').insert(toInsert).select('id').single();
    if (e2) return res.status(400).json({ error: e2.message });

    // éventuelle RPC pour commissions ici
    // await supa.rpc('compute_commissions_for_sale', { sale_id_input: sale.id });

    res.json({ ok:true, sale_id: sale.id });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
};
