const { ensureAdmin } = require('./_auth');

export default async function handler(req, res) {
  const ok = ensureAdmin(req, res);      // ⬅️ ajoute ces 2 lignes en tête
  if (ok !== true) return;

export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_TOKEN  = process.env.ADMIN_TOKEN || '';
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const ok  = (res, body) => res.status(200).json(body);
const bad = (res, msg, code=400) => res.status(code).json({ error: msg });
const authed = (req) => String(req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim() === ADMIN_TOKEN;

/**
 * Suppose une table/ vue "sales" avec au minimum:
 * id, created_at, order_id, institute_name, pro_name, postal_code, amount, currency
 */
export default async function handler(req, res){
  try{
    if(req.method!=='GET') return bad(res,'Method Not Allowed',405);
    if(!authed(req))       return bad(res,'Unauthorized',401);

    const limit  = Math.min(parseInt(req.query.limit||'100',10), 500);
    const offset = parseInt(req.query.offset||'0',10);
    const search = String(req.query.search||'').trim();
    const dateFrom = String(req.query.date_from||'').trim();
    const dateTo   = String(req.query.date_to||'').trim();
    const postal   = String(req.query.postal||'').trim();
    const amtMin   = req.query.amount_min? Number(req.query.amount_min) : null;
    const amtMax   = req.query.amount_max? Number(req.query.amount_max) : null;

    let q = supabase
      .from('sales')
      .select(`id, created_at, order_id, institute_name, pro_name, postal_code, amount, currency`)
      .order('created_at', {ascending:false});

    if(dateFrom) q = q.gte('created_at', dateFrom);
    if(dateTo)   q = q.lte('created_at', dateTo+'T23:59:59');
    if(postal)   q = q.ilike('postal_code', `%${postal.replace(/[%,"']/g,'')}%`);
    if(amtMin!=null) q = q.gte('amount', amtMin);
    if(amtMax!=null) q = q.lte('amount', amtMax);

    if(search){
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
    if(error){
      console.error('Supabase (sales) error:', error);
      return bad(res,'Erreur base de données (ventes).');
    }
    return ok(res,{ items: data || [], nextOffset: offset + (data?.length||0) });
  }catch(e){
    console.error('Server (sales) error:', e);
    return bad(res,'Erreur serveur (ventes).',500);
  }
}
