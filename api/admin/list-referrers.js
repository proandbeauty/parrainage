// /api/admin/list-referrers.js
const { ensureAdmin } = require('./_auth');
export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_TOKEN  = process.env.ADMIN_TOKEN || '';
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const ok  = (res, body) => res.status(200).json(body);
const bad = (res, msg, code=400) => res.status(code).json({ error: msg });
const authed = (req) => String(req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim() === ADMIN_TOKEN;

export default async function handler(req, res){
  if (ensureAdmin(req, res) !== true) return;
  try{
    if(req.method!=='GET') return bad(res,'Method Not Allowed',405);

    const limit  = Math.min(parseInt(req.query.limit||'100',10), 500);
    const offset = parseInt(req.query.offset||'0',10);
    const search = String(req.query.search||'').trim();
    const rib    = String(req.query.rib||'all').toLowerCase();
    const dateFrom = String(req.query.date_from||'').trim();
    const dateTo   = String(req.query.date_to||'').trim();

    let q = supabase
      .from('referrers')
      .select(`id, first_name, last_name, email, phone, referral_code, source_brand, brand, created_at, updated_at`)
      .order('updated_at',{ascending:false})
      .limit(2000);

    if(search){
      const term = search.replace(/[%,"']/g,'');
      q = q.or([
        `first_name.ilike.%${term}%`,
        `last_name.ilike.%${term}%`,
        `email.ilike.%${term}%`,
        `referral_code.ilike.%${term}%`,
        `id.eq.${term}`
      ].join(','));
    }
    if(dateFrom) q = q.gte('created_at', dateFrom);
    if(dateTo)   q = q.lte('created_at', dateTo+'T23:59:59');

    const { data: refs, error } = await q;
    if(error) return bad(res,'Erreur base de données (bénéficiaires).',500);

    // RIB status
    const { data: ribs, error: e2 } = await supabase
      .from('bank_accounts')
      .select('referrer_id, status, updated_at');
    if(e2) return bad(res,'Erreur lecture RIB (bénéficiaires).',500);

    const map = new Map();
    ribs?.forEach(r=> map.set(r.referrer_id, r.status || 'pending'));

    let rows = (refs||[]).map(r=>({
      id: r.id,
      first_name: r.first_name,
      last_name:  r.last_name,
      email:      r.email,
      phone:      r.phone,                                // <- affichage téléphone
      brand:      r.brand ?? r.source_brand ?? '',        // <- compatibilité
      code:       r.referral_code,                        // <- bon champ
      last_activity: r.updated_at || r.created_at,
      rib_status: map.get(r.id) || 'missing'
    }));

    if(rib && rib!=='all'){ rows = rows.filter(x => x.rib_status === rib); }

    const sliced = rows.slice(offset, offset+limit);
    return ok(res,{ items: sliced, nextOffset: offset + sliced.length });
  }catch(e){
    console.error('Server (list-referrers) error:', e);
    return bad(res,'Erreur serveur (bénéficiaires).',500);
  }
}
