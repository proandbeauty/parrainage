const { ensureAdmin } = require('./_auth');

export default async function handler(req, res) {
  const ok = ensureAdmin(req, res);      // ⬅️ ajoute ces 2 lignes en tête
  if (ok !== true) return;

// /api/admin/referrers-set-status.js
const { getAdminClient, assertAdmin } = require('../_lib/supabaseAdmin');

module.exports = async (req, res) => {
  if (!assertAdmin(req, res)) return;
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const { id, status } = req.body || {};
  if (!id || !['suspended', 'active'].includes(status)) {
    return res.status(400).json({ error: 'payload invalide' });
  }

  try {
    const supa = getAdminClient();
    const is_suspended = status === 'suspended';
    const { error } = await supa.from('referrers').update({ is_suspended }).eq('id', id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
};
