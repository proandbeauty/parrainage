// /api/admin/referrers-update.js
const { getAdminClient, assertAdmin } = require('../_lib/supabaseAdmin');

module.exports = async (req, res) => {
  if (!assertAdmin(req, res)) return;
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const { id, first_name, last_name, email, phone, brand } = req.body || {};
  if (!id) return res.status(400).json({ error: 'id manquant' });

  // N’envoie à Supabase que ce qui est fourni (vide => null)
  const norm = v => (v === '' ? null : v);
  const patch = {};
  if (first_name !== undefined) patch.first_name = norm(first_name);
  if (last_name  !== undefined) patch.last_name  = norm(last_name);
  if (email      !== undefined) patch.email      = norm(email);
  if (phone      !== undefined) patch.telephone  = norm(phone);   // <-- colonne Supabase
  if (brand      !== undefined) patch.marque     = norm(brand);   // <-- colonne Supabase
  // NOTE: pas de modification du code parrain ici

  try {
    const supa = getAdminClient();
    const { error } = await supa.from('referrers').update(patch).eq('id', id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
};
