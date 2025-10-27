// api/admin/health.js
// ─────────────────────────────────────────────────────────────
export const config = { runtime: 'nodejs' }; // force Node (pas Edge)

const { readAdminToken } = require('./_auth');
const { createClient } = require('@supabase/supabase-js');

export default async function handler(req, res) {
  // 1) Vérif réception du header + présence du token env
  const gotToken   = readAdminToken(req);
  const envToken   = process.env.ADMIN_TOKEN || process.env.NEXT_PUBLIC_ADMIN_TOKEN || '';
  const SUPA_URL   = process.env.SUPABASE_URL || '';
  const SERVICEKEY = process.env.SUPABASE_SERVICE_KEY || '';

  const diag = {
    ok: false,
    receivedHeader: Boolean(gotToken),
    headerLen: gotToken ? gotToken.length : 0,
    envLen: envToken.length,
    match: Boolean(gotToken && envToken && gotToken === envToken),
    has_SUPABASE_URL:   Boolean(SUPA_URL),
    has_SERVICE_KEY:    Boolean(SERVICEKEY),
    where: 'init'
  };

  // 2) Si variables manquantes → on retourne le diag
  if (!diag.has_SUPABASE_URL || !diag.has_SERVICE_KEY) {
    diag.where = 'env';
    return res.status(200).json(diag);
  }

  // 3) Ping Supabase (sélect simple)
  try {
    const supabase = createClient(SUPA_URL, SERVICEKEY);
    const { error } = await supabase.from('referrers').select('id').limit(1);
    if (error) {
      diag.where  = 'supabase';
      diag.detail = error.message;
      return res.status(200).json(diag);
    }
    diag.ok    = true;
    diag.where = 'ok';
    return res.status(200).json(diag);
  } catch (e) {
    diag.where  = 'exception';
    diag.detail = String(e?.message || e);
    return res.status(200).json(diag);
  }
}
