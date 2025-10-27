// api/admin/set-commission-status.js
const { ensureAdmin } = require('./_auth');
const { createClient } = require('@supabase/supabase-js');

module.exports.config = { runtime: 'nodejs' };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;
const supabase     = createClient(SUPABASE_URL, SERVICE_KEY);

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
    if (ensureAdmin(req,res)!==true) return;

    const { commission_id, status } = req.body || {};
    if (!commission_id || !['pending', 'approved', 'paid'].includes(status))
      return res.status(400).json({ error: 'commission_id et status requis' });

    const { data, error } = await supabase
      .from('commissions')
      .update({ status })
      .eq('id', commission_id)
      .select('*')
      .single();

    if (error) return res.status(500).json({ error: 'Erreur mise à jour', detail: error.message });
    return res.status(200).json({ ok: true, commission: data });
  } catch (e) {
    console.error('set-commission-status fatal:', e);
    return res.status(500).json({ error: 'server error' });
  }
};
