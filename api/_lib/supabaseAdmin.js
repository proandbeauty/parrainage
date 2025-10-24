// /api/_lib/supabaseAdmin.js
const { createClient } = require('@supabase/supabase-js');

function getAdminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE manquants');
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

function assertAdmin(req, res) {
  const hdr = req.headers?.authorization || req.headers?.Authorization || '';
  const got = String(hdr).replace(/^Bearer\s+/i, '').trim();
  if (!got || got !== process.env.ADMIN_TOKEN) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

module.exports = { getAdminClient, assertAdmin };
