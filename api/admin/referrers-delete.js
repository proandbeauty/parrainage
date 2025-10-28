export const config = { runtime: 'nodejs' };
import { createClient } from '@supabase/supabase-js';
import { ensureAdmin } from './_auth';

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  const ok = ensureAdmin(req, res);
  if (ok !== true) return;

  try {
    if (req.method !== 'POST') return res.status(405).json({ error:'Method Not Allowed' });

    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error:'id manquant' });

    const { error } = await supa.from('referrers').delete().eq('id', id);
    if (error) return res.status(400).json({ error:error.message });

    return res.status(200).json({ ok:true });
  } catch (e) {
    return res.status(500).json({ error:'Server error (referrers-delete)', detail:String(e?.message||e) });
  }
}
