// api/_lib/supabaseAdmin.js  (CommonJS)
const { createClient } = require('@supabase/supabase-js');
const { ensureAdmin }  = require('../admin/_auth');

function getAdminClient() {
  const url  = process.env.SUPABASE_URL;
  const key  = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_KEY manquants');
  return createClient(url, key);
}

// simple pont si tu en avais besoin
function assertAdmin(req, res) {
  return ensureAdmin(req, res) === true;
}

module.exports = { getAdminClient, assertAdmin };
