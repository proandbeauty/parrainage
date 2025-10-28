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

    const { id, status } = req.body || {};
    if (!id || !status) return res.status(400).json({ error:'id et status requis' });

    let newStatus = String(status).toLowerCase();
    if (newStatus === 'validated') newStatus = 'approved';
    if (!['approved','rejected','pending'].includes(newStatus)) {
      return res.status(400).json({ error:'Statut invalide' });
    }

    const { data, error } = await supabase
      .from('bank_accounts')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id,status')
      .maybeSingle();

    if (error) return res.status(500).json({ error:'DB error (maj RIB)', detail:error.message });
    if (!data)  return res.status(404).json({ error:'RIB introuvable' });

    return res.status(200).json({ ok:true, id:data.id, status:data.status });
  } catch (e) {
    return res.status(500).json({ error:'Server error (maj RIB)', detail:String(e?.message||e) });
  }
}
