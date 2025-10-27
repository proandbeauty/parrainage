// api/admin/referrers-update.js
const { getAdminClient, assertAdmin } = require('../_lib/supabaseAdmin');

module.exports = async (req, res) => {
  if (!assertAdmin(req, res)) return;
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const { id, first_name, last_name, email, phone, brand, code } = req.body || {};
  if (!id) return res.status(400).json({ error: 'id manquant' });

  const patch = {};
  if (first_name !== undefined) patch.first_name = first_name;
  if (last_name  !== undefined) patch.last_name  = last_name;
  if (email      !== undefined) patch.email      = email;
  if (phone      !== undefined) patch.phone      = phone;
  if (brand      !== undefined) patch.brand      = brand;
  if (code       !== undefined) patch.code       = code; // enlève cette ligne si code non-modifiable

  try {
    const supa = getAdminClient();
    const { error } = await supa.from('referrers').update(patch).eq('id', id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
};
