// api/admin/set-commission-status.js  (CommonJS)
const { ensureAdmin } = require('./_auth');
const { createClient } = require('@supabase/supabase-js');

module.exports.config = { runtime: 'nodejs' };

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

module.exports = async (req, res) => {
  if (ensureAdmin(req, res) !== true) return;

  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { commission_id, status } = req.body || {};
    if (!commission_id || !['pending','approved','paid'].includes(status)) {
      return res.status(400).json({ error: 'commission_id et status requis' });
    }

    const { data, error } = await supa
      .from('commissions')
      .update({ status })
      .eq('id', commission_id)
      .select('*')
      .single();

    if (error) return res.status(500).json({ error: 'Erreur mise à jour', detail: error.message });
    return res.status(200).json({ ok: true, commission: data });
  } catch (e) {
    return res.status(500).json({ error: 'server error', detail:String(e.message||e) });
  }
};
