// api/admin/list-referrers.js  (CommonJS)
const { ensureAdmin } = require('./_auth');
const { createClient } = require('@supabase/supabase-js');

module.exports.config = { runtime: 'nodejs' };

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

module.exports = async (req, res) => {
  if (ensureAdmin(req, res) !== true) return;

  try {
    const limit  = Math.min(parseInt(req.query.limit||'100',10), 500);
    const offset = parseInt(req.query.offset||'0',10);
    const search = String(req.query.search||'').trim();
    const rib    = String(req.query.rib||'all').toLowerCase(); // approved|pending|rejected|missing|all
    const dateFrom = String(req.query.date_from||'').trim();
    const dateTo   = String(req.query.date_to||'').trim();

    let q = supa
      .from('referrers')
      .select('id, first_name, last_name, email, referral_code, created_at, updated_at')
      .order('updated_at', { ascending:false })
      .limit(2000);

    if (search) {
      const term = search.replace(/[%,"']/g,'');
      q = q.or([
        `first_name.ilike.%${term}%`,
        `last_name.ilike.%${term}%`,
        `email.ilike.%${term}%`,
        `referral_code.ilike.%${term}%`
      ].join(','));
    }
    if (dateFrom) q = q.gte('created_at', dateFrom);
    if (dateTo)   q = q.lte('created_at', dateTo+'T23:59:59');

    const { data: refs, error } = await q;
    if (error) return res.status(500).json({ error:'Erreur base de données (bénéficiaires).', detail:error.message });

    const { data: ribs, error: e2 } = await supa.from('bank_accounts').select('referrer_id, status, updated_at');
    if (e2) return res.status(500).json({ error:'Erreur lecture RIB (bénéficiaires).', detail:e2.message });

    const map = new Map();
    ribs?.forEach(r => map.set(r.referrer_id, r.status || 'pending'));

    let rows = (refs||[]).map(r => ({
      id: r.id,
      first_name: r.first_name,
      last_name: r.last_name,
      email: r.email,
      code: r.referral_code,
      last_activity: r.updated_at || r.created_at,
      rib_status: map.get(r.id) || 'missing'
    }));

    if (rib && rib!=='all') rows = rows.filter(x => x.rib_status === rib);

    const sliced = rows.slice(offset, offset+limit);
    return res.status(200).json({ items: sliced, nextOffset: offset + sliced.length });
  } catch (e) {
    return res.status(500).json({ error:'Erreur serveur (bénéficiaires).', detail:String(e.message||e) });
  }
};
