// /api/admin/ribs-set-status.js
export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_TOKEN  = process.env.ADMIN_TOKEN || '';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

function bad(res, msg, code=400){ return res.status(code).json({ error: msg }); }
function ok(res, body){ return res.status(200).json(body); }
function authed(req){
  const h = String(req.headers.authorization||''); 
  const tok = h.replace(/^Bearer\s+/i,'').trim();
  return tok && tok === ADMIN_TOKEN;
}

/**
 * Body attendu: { id: <rib_id>, status: 'approved'|'rejected'|'pending', note?: string }
 * Compat: si on reçoit 'validated', on mappe vers 'approved'
 */
export default async function handler(req, res){
  try{
    if(req.method !== 'POST') return bad(res,'Method Not Allowed',405);
    if(!authed(req))          return bad(res,'Unauthorized',401);
    if(!SUPABASE_URL || !SERVICE_KEY) return bad(res,'Server not configured',500);

    const { id, status } = req.body || {};
    if (!id || !status) return bad(res,'id et status requis');

    // normalisation des statuts
    let newStatus = String(status).toLowerCase();
    if (newStatus === 'validated') newStatus = 'approved'; // compat ancien front

    if (!['approved','rejected','pending'].includes(newStatus)) {
      return bad(res, 'Statut invalide (utilisez approved | rejected | pending)');
    }

    const { data, error } = await supabase
      .from('bank_accounts')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, status')
      .maybeSingle();

    if (error) {
      console.error('Supabase update (ribs-set-status) error:', error);
      return bad(res, 'Erreur base de données (maj RIB).');
    }
    if (!data) return bad(res, 'RIB introuvable', 404);

    return ok(res, { ok: true, id: data.id, status: data.status });
  }catch(e){
    console.error('Server (ribs-set-status) error:', e);
    return bad(res,'Erreur serveur (maj RIB).',500);
  }
}
