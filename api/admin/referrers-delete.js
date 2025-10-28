// api/admin/referrers-delete.js  (CommonJS)
const { ensureAdmin } = require('./_auth');
const { getAdminClient } = require('../_lib/supabaseAdmin');

module.exports.config = { runtime: 'nodejs' };

module.exports = async (req, res) => {
  if (ensureAdmin(req, res) !== true) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { id } = req.body || {};
  if (!id) return res.status(400).json({ error: 'id manquant' });

  try {
    const supa = getAdminClient();
    const { error } = await supa.from('referrers').delete().eq('id', id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
};
