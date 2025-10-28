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
  const adminOk = ensureAdmin(req, res);
  if (adminOk !== true) return;

  try{
    if(req.method!=='GET') return bad(res,'Method Not Allowed',405);
    if(!authed(req))       return bad(res,'Unauthorized',401);

    const limit   = Math.min(parseInt(req.query.limit||'100',10), 500);
    const offset  = parseInt(req.query.offset||'0',10);
    const search  = String(req.query.search||'').trim();
    const rib     = String(req.query.rib||'all').toLowerCase(); // approved|pending|rejected|missing|all
    const dateFrom= String(req.query.date_from||'').trim();
    const dateTo  = String(req.query.date_to||'').trim();

    // 1) Referrers (on récupère tout ce qu’il faut)
    let q = supabase
      .from('referrers')
      .select(`
        id, first_name, last_name, email, phone, brand,
        code, referral_code, role, parent_id, parent_code,
        created_at, updated_at
      `)
      .order('updated_at',{ascending:false})
      .limit(2000);

    if(search){
      const term = search.replace(/[%,"']/g,'');
      q = q.or([
        `first_name.ilike.%${term}%`,
        `last_name.ilike.%${term}%`,
        `email.ilike.%${term}%`,
        `referral_code.ilike.%${term}%`,
        `code.ilike.%${term}%`
      ].join(','));
    }
    if(dateFrom) q = q.gte('created_at', dateFrom);
    if(dateTo)   q = q.lte('created_at', dateTo+'T23:59:59');

    const { data: refs, error } = await q;
    if(error) return bad(res,'Erreur base de données (bénéficiaires).',500);

    // 2) RIB status map
    const { data: ribs, error: e2 } = await supabase
      .from('bank_accounts')
      .select('referrer_id, status');
    if(e2) return bad(res,'Erreur lecture RIB (bénéficiaires).',500);

    const ribMap = new Map();
    ribs?.forEach(r=> ribMap.set(r.referrer_id, r.status || 'pending'));

    // 3) Si parent_code absent, on tente de le retrouver via parent_id -> code
    const needParentIds = Array.from(new Set((refs||[])
      .filter(r => !r.parent_code && r.parent_id)
      .map(r => r.parent_id)));

    let parentCodeMap = new Map();
    if (needParentIds.length){
      const { data: parents } = await supabase
        .from('referrers')
        .select('id, code, referral_code')
        .in('id', needParentIds);
      parents?.forEach(p => parentCodeMap.set(p.id, p.code || p.referral_code || null));
    }

    // 4) Normalisation + filtre RIB
    let rows = (refs||[]).map(r=>{
      const role = r.role || (r.parent_id ? 'seller' : 'parent'); // déduction si role manquant
      const parent_code = r.parent_code || (r.parent_id ? (parentCodeMap.get(r.parent_id) || null) : null);
      return {
        id: r.id,
        first_name: r.first_name,
        last_name: r.last_name,
        email: r.email,
        phone: r.phone,
        brand: r.brand,
        code: r.code || r.referral_code,
        role,
        parent_code: parent_code,
        last_activity: r.updated_at || r.created_at,
        rib_status: ribMap.get(r.id) || 'missing'
      };
    });

    if(rib && rib!=='all'){
      rows = rows.filter(x => x.rib_status === rib);
    }

    const sliced = rows.slice(offset, offset+limit);
    const nextOffset = offset + sliced.length;
    return ok(res,{ items: sliced, nextOffset });
  }catch(e){
    console.error('Server (list-referrers) error:', e);
    return bad(res,'Erreur serveur (bénéficiaires).',500);
  }
}
