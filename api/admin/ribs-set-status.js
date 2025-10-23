// /api/admin/ribs-set-status.js
export const config = { runtime: 'nodejs' };
import { createClient } from '@supabase/supabase-js';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_TOKEN  = process.env.ADMIN_TOKEN || '';
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

function bad(res, msg, code=400, detail=''){ return res.status(code).json({ error: msg, detail }); }
function authed(req){ const t=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim(); return t && t===ADMIN_TOKEN; }

export default async function handler(req, res){
  try{
    if(req.method!=='POST') return bad(res,'Method Not Allowed',405);
    if(!authed(req))        return bad(res,'Unauthorized',401);
    const { id, status } = req.body || {};
    if(!id || !status) return bad(res,'id et status requis');

    let newStatus = String(status).toLowerCase();
    if(newStatus==='validated') newStatus='approved';
    if(!['approved','rejected','pending'].includes(newStatus))
      return bad(res,'Statut invalide',400);

    const { data, error } = await supabase
      .from('bank_accounts')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id,status')
      .maybeSingle();

    if(error){
      console.error('[ribs-set-status] supabase error:', error);
      return bad(res, 'Erreur base de données (maj RIB).', 500, error.message || String(error));
    }
    if(!data) return bad(res,'RIB introuvable',404);
    return res.status(200).json({ ok:true, id:data.id, status:data.status });
  }catch(e){
    console.error('[ribs-set-status] server error:', e);
    return bad(res,'Erreur serveur (maj RIB).',500, e.message || String(e));
  }
}
