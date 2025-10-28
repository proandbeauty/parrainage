// /api/admin/referrers-update.js
const { ensureAdmin } = require('./_auth');
export const config = { runtime: 'nodejs' };
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  const ok = ensureAdmin(req, res);
  if (ok !== true) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const payload = req.body || {};
  const id = payload.id;
  if (!id) return res.status(400).json({ error: 'id manquant' });

  // on accepte "brand" (nouveau) et "marque" (legacy)
  const patch = {};
  ['first_name','last_name','email','phone','brand','code'].forEach(k => {
    if (payload[k] !== undefined) patch[k] = payload[k];
  });
  if (payload.marque !== undefined && patch.brand === undefined) {
    patch.brand = payload.marque;
  }

  if (!Object.keys(patch).length) return res.status(400).json({ error: 'aucun champ à mettre à jour' });

  const { error } = await supabase.from('referrers').update(patch).eq('id', id);
  if (error) return res.status(400).json({ error: error.message });

  return res.status(200).json({ ok: true });
}
