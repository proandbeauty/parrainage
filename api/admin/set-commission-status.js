export const config = { runtime: 'nodejs' };
import { createClient } from '@supabase/supabase-js';
import { ensureAdmin } from './_auth';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;
const supabase     = createClient(SUPABASE_URL, SERVICE_KEY);

export default async function handler(req, res) {
  const ok = ensureAdmin(req, res);
  if (ok !== true) return;

  try {
    if (req.method !== 'POST') return res.status(405).json({ error:'Method Not Allowed' });

    const { commission_id, status } = req.body || {};
    if (!commission_id || !['pending','approved','paid'].includes(status)) {
      return res.status(400).json({ error:'commission_id et status requis' });
    }

    const { data, error } = await supabase
      .from('commissions')
      .update({ status })
      .eq('id', commission_id)
      .select('*')
      .single();

    if (error) return res.status(500).json({ error:'DB error (maj commission)', detail:error.message });

    return res.status(200).json({ ok:true, commission:data });
  } catch (e) {
    return res.status(500).json({ error:'Server error (set-commission)', detail:String(e?.message||e) });
  }
}
