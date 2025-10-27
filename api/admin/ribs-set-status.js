// api/admin/ribs-set-status.js
export const config = { runtime: 'nodejs' };

const { ensureAdmin }  = require('./_auth');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY || '';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

function bad(res, msg, code = 400, detail = '') {
  return res.status(code).json({ error: msg, detail });
}

export default async function handler(req, res) {
  // Auth admin (via header Authorization: Bearer <ADMIN_TOKEN> ou x-admin-token)
  if (ensureAdmin(req, res) !== true) return;

  try {
    if (req.method !== 'POST') return bad(res, 'Method Not Allowed', 405);

    const { id, status } = req.body || {};
    if (!id || !status) return bad(res, 'id et status requis', 400);

    let newStatus = String(status).toLowerCase();
    if (newStatus === 'validated') newStatus = 'approved';
    if (!['approved', 'rejected', 'pending'].includes(newStatus)) {
      return bad(res, 'Statut invalide', 400);
    }

    const { data, error } = await supabase
      .from('bank_accounts')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id,status')
      .maybeSingle();

    if (error) {
      console.error('[ribs-set-status] supabase error:', error);
      return bad(res, 'Erreur base de données (maj RIB).', 500, error.message || String(error));
    }
    if (!data) return bad(res, 'RIB introuvable', 404);

    return res.status(200).json({ ok: true, id: data.id, status: data.status });
  } catch (e) {
    console.error('[ribs-set-status] server error:', e);
    return bad(res, 'Erreur serveur (maj RIB).', 500, e.message || String(e));
  }
}
