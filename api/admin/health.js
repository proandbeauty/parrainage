export const config = { runtime: 'nodejs' };
import { createClient } from '@supabase/supabase-js';
import { ensureAdmin } from './_auth';

export default async function handler(req, res) {
  // Protège la route et renvoie un JSON propre même en erreur
  const ok = ensureAdmin(req, res);
  if (ok !== true) return;

  try {
    const SUPABASE_URL = process.env.SUPABASE_URL || '';
    const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY || '';

    const env = {
      has_SUPABASE_URL: !!SUPABASE_URL,
      has_SERVICE_KEY : !!SERVICE_KEY,
      has_ADMIN_TOKEN : !!(process.env.ADMIN_TOKEN || process.env.NEXT_PUBLIC_ADMIN_TOKEN)
    };
    if (!env.has_SUPABASE_URL || !env.has_SERVICE_KEY) {
      return res.status(500).json({ ok:false, env, where:'env' });
    }

    const supa = createClient(SUPABASE_URL, SERVICE_KEY);
    const { error } = await supa.from('referrers').select('id').limit(1);
    if (error) return res.status(500).json({ ok:false, env, where:'supabase', detail:error.message });

    return res.status(200).json({ ok:true, env, where:'ok' });
  } catch (e) {
    return res.status(500).json({ ok:false, where:'exception', detail:String(e?.message||e) });
  }
}
