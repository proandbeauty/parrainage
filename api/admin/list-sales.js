// api/admin/list-sales.js  (CommonJS)
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
    const dateFrom = String(req.query.date_from||'').trim();
    const dateTo   = String(req.query.date_to||'').trim();
    const postal   = String(req.query.postal||'').trim();
    const amtMin   = req.query.amount_min? Number(req.query.amount_min) : null;
    const amtMax   = req.query.amount_max? Number(req.query.amount_max) : null;

    let q = supa
      .from('sales')
      .select(`id, created_at, order_id, institute_name, pro_name, postal_code, amount, currency`)
      .order('created_at', { ascending:false });

    if (dateFrom) q = q.gte('created_at', dateFrom);
    if (dateTo)   q = q.lte('created_at', dateTo+'T23:59:59');
    if (postal)   q = q.ilike('postal_code', `%${postal.replace(/[%,"']/g,'')}%`);
    if (amtMin!=null) q = q.gte('amount', amtMin);
    if (amtMax!=null) q = q.lte('amount', amtMax);

    if (search) {
      const term = search.replace(/[%,"']/g,'');
      q = q.or([
        `order_id.ilike.%${term}%`,
        `institute_name.ilike.%${term}%`,
        `pro_name.ilike.%${term}%`,
        `postal_code.ilike.%${term}%`
      ].join(','));
    }

    q = q.range(offset, offset+limit-1);
    const { data, error } = await q;
    if (error) return res.status(500).json({ error:'Erreur base de données (ventes).', detail:error.message });

    return res.status(200).json({ items:data||[], nextOffset: offset + (data?.length||0) });
  } catch (e) {
    return res.status(500).json({ error:'Erreur serveur (ventes).', detail:String(e.message||e) });
  }
};
