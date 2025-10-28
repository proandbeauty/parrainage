// api/admin/health.js  (CommonJS)
const { ensureAdmin } = require('./_auth');
const { createClient } = require('@supabase/supabase-js');

module.exports.config = { runtime: 'nodejs' };

module.exports = async (req, res) => {
  if (ensureAdmin(req, res) !== true) return;

  const SUPABASE_URL = process.env.SUPABASE_URL || '';
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY || '';
  const ADMIN_TOKEN  = process.env.ADMIN_TOKEN || '';

  const env = {
    has_SUPABASE_URL: !!SUPABASE_URL,
    has_SERVICE_KEY:  !!SERVICE_KEY,
    has_ADMIN_TOKEN:  !!ADMIN_TOKEN
  };
  if (!env.has_SUPABASE_URL || !env.has_SERVICE_KEY) {
    return res.status(500).json({ ok:false, env, where: 'env' });
  }

  try {
    const supa = createClient(SUPABASE_URL, SERVICE_KEY);
    // petit ping : lecture d'une table connue
    const { error } = await supa.from('referrers').select('id').limit(1);
    if (error) return res.status(500).json({ ok:false, env, where:'supabase', detail:error.message });
    return res.status(200).json({ ok:true, env, where:'ok' });
  } catch (e) {
    return res.status(500).json({ ok:false, env, where:'exception', detail:String(e.message||e) });
  }
};
