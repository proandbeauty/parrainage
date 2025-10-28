// /api/admin/create-sale.js
const { getAdminClient, assertAdmin } = require('../_lib/supabaseAdmin');

module.exports = async (req, res) => {
  if (!assertAdmin(req, res)) return;
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const {
    order_id,
    institute_name,
    pro_name,
    postal_code,
    amount,
    currency,
    referral_code, // saisi dans le formulaire
    created_at
  } = req.body || {};

  if (!institute_name || !pro_name || !postal_code || !amount || !currency || !referral_code) {
    return res.status(400).json({ error: 'champs requis manquants' });
  }

  try {
    const supa = getAdminClient();

    // 1) Retrouver le bénéficiaire par code (prend en compte "code" OU "referral_code")
    const { data: ref, error: e1 } = await supa
      .from('referrers')
      .select('id, code, referral_code')
      .or(`code.eq.${referral_code},referral_code.eq.${referral_code}`)
      .single();

    if (e1 || !ref?.id) {
      return res.status(404).json({ error: 'code parrain introuvable' });
    }

    // 2) Insérer la vente – IMPORTANT: seller_id (et pas referrer_id)
    const toInsert = {
      order_id: order_id || null,
      institute_name,
      pro_name,
      postal_code,
      amount,
      currency,
      created_at: created_at || new Date().toISOString(),
      seller_id: ref.id,              // <-- clé étrangère requise
      referral_code: referral_code    // utile pour l’historique/filtrage si tu l’as dans la table
    };

    const { data: sale, error: e2 } = await supa
      .from('sales')
      .insert(toInsert)
      .select('id')
      .single();

    if (e2) return res.status(400).json({ error: e2.message });

    // 3) (optionnel) déclencher une RPC de calcul de commissions ici
    // await supa.rpc('compute_commissions_for_sale', { sale_id_input: sale.id });

    res.json({ ok: true, sale_id: sale.id });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
};
