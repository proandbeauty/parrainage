// api/admin/referrers-update.js  (CommonJS)
const { ensureAdmin } = require('./_auth');
const { getAdminClient } = require('../_lib/supabaseAdmin');

module.exports.config = { runtime: 'nodejs' };

module.exports = async (req, res) => {
  if (ensureAdmin(req, res) !== true) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { id, first_name, last_name, email, phone, brand, code } = req.body || {};
  if (!id) return res.status(400).json({ error: 'id manquant' });

  const patch = {};
  if (first_name !== undefined) patch.first_name = first_name;
  if (last_name  !== undefined) patch.last_name  = last_name;
  if (email      !== undefined) patch.email      = email;
  if (phone      !== undefined) patch.phone      = phone;
  if (brand      !== undefined) patch.brand      = brand;
  if (code       !== undefined) patch.code       = code; // sera ignoré côté SQL si non autorisé

  try {
    const supa = getAdminClient();
    const { error } = await supa.from('referrers').update(patch).eq('id', id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
};
