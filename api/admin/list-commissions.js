export const config = { runtime: 'nodejs' };
import { createClient } from '@supabase/supabase-js';
import { ensureAdmin } from './_auth';

const SUPABASE_URL   = process.env.SUPABASE_URL;
const SERVICE_KEY    = process.env.SUPABASE_SERVICE_KEY;
const supabase       = createClient(SUPABASE_URL, SERVICE_KEY);

export default async function handler(req, res) {
  const ok = ensureAdmin(req, res);
  if (ok !== true) return;

  try {
    if (req.method !== 'GET') return res.status(405).json({ error:'Method Not Allowed' });
    if (!SUPABASE_URL || !SERVICE_KEY) return res.status(500).json({ error:'Server not configured' });

    const page   = parseInt(req.query.page||'0',10);
    const limit  = Math.min(parseInt(req.query.limit||'50',10), 200);
    const offset = parseInt(req.query.offset||'0',10);
    const status = String(req.query.status||'').trim().toLowerCase();
    const search = String(req.query.search||'').trim();

    let q = supabase
      .from('v_commissions_detailed')
      .select(`
        id, amount, currency, status, role, created_at,
        first_name, last_name, email, referral_code,
        sale_id, order_id, sale_amount, sale_currency, sale_created_at
      `)
      .order('created_at',{ascending:false});

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

    if (page>0) {
      const from=(page-1)*limit, to=from+limit-1;
      q = q.range(from,to);
    } else {
      q = q.range(offset, offset+limit-1);
    }

    const { data, error } = await q;
    if (error) return res.status(500).json({ error:'DB error (commissions)', detail:error.message });

    if (page>0) return res.status(200).json({ items:data||[], hasMore:(data?.length||0)===limit });
    return res.status(200).json({ items:data||[], nextOffset: offset + (data?.length||0) });
  } catch (e) {
    return res.status(500).json({ error:'Server error (commissions)', detail:String(e?.message||e) });
  }
}
