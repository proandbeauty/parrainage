// api/admin/list-commissions.js  (CommonJS)
const { ensureAdmin } = require('./_auth');
const { createClient } = require('@supabase/supabase-js');

module.exports.config = { runtime: 'nodejs' };

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

module.exports = async (req, res) => {
  if (ensureAdmin(req, res) !== true) return;

  try {
    const page   = parseInt(req.query.page||'0',10);
    const limit  = Math.min(parseInt(req.query.limit||'50',10), 200);
    const offset = parseInt(req.query.offset||'0',10);
    const status = String(req.query.status||'').trim().toLowerCase();
    const search = String(req.query.search||'').trim();

    let q = supa
      .from('v_commissions_detailed')
      .select(`
        commission_id:id,
        commission_amount:amount,
        commission_currency:currency,
        status, role, commission_created_at:created_at,
        beneficiary_id,
        first_name,last_name,email,referral_code,
        sale_id, order_id, sale_amount, sale_currency, sale_created_at
      `)
      .order('created_at', { ascending:false });

    if (status && status!=='all') q = q.eq('status', status);

    if (search) {
      const term = search.replace(/[%,"']/g,'');
      q = q.or([
        `first_name.ilike.%${term}%`,
        `last_name.ilike.%${term}%`,
        `email.ilike.%${term}%`,
        `referral_code.ilike.%${term}%`,
        `order_id.ilike.%${term}%`
      ].join(','));
    }

    if (page > 0) {
      const from=(page-1)*limit, to=from+limit-1;
      q = q.range(from,to);
    } else {
      q = q.range(offset, offset+limit-1);
    }

    const { data, error } = await q;
    if (error) return res.status(500).json({ error:'Erreur base de données (commissions).', detail:error.message });

    if (page>0) return res.status(200).json({ items:data||[], hasMore:(data?.length||0)===limit });
    return res.status(200).json({ items:data||[], nextOffset: offset + (data?.length||0) });
  } catch (e) {
    return res.status(500).json({ error:'Erreur serveur (commissions).', detail:String(e.message||e) });
  }
};
