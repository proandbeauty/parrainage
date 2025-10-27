const { ensureAdmin } = require('./_auth');

export default async function handler(req, res) {
  const ok = ensureAdmin(req, res);      // ⬅️ ajoute ces 2 lignes en tête
  if (ok !== true) return;

// /api/admin/health.js
export const config = { runtime: 'nodejs' };
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const SUPABASE_URL = process.env.SUPABASE_URL || '';
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY || '';
  const ADMIN_TOKEN  = process.env.ADMIN_TOKEN || '';

  const env = {
    has_SUPABASE_URL: !!SUPABASE_URL,
    has_SERVICE_KEY:  !!SERVICE_KEY,
    has_ADMIN_TOKEN:  !!ADMIN_TOKEN
  };

  // Pas de secrets dans la réponse, juste des booléens
  if (!env.has_SUPABASE_URL || !env.has_SERVICE_KEY) {
    return res.status(500).json({ ok:false, env, where: 'env' });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data, error } = await supabase.rpc('now'); // marche même sans RPC, sinon fallback
    if (error) {
      // fallback: select simple
      const test = await supabase.from('referrers').select('id').limit(1);
      if (test.error) {
        return res.status(500).json({ ok:false, env, where:'supabase', detail:test.error.message });
      }
    }
    return res.status(200).json({ ok:true, env, where:'ok' });
  } catch (e) {
    return res.status(500).json({ ok:false, env, where:'exception', detail: String(e.message || e) });
  }
}
