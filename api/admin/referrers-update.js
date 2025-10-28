export const config = { runtime: 'nodejs' };
import { createClient } from '@supabase/supabase-js';
import { ensureAdmin } from './_auth';

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  const ok = ensureAdmin(req, res);
  if (ok !== true) return;

  try {
    if (req.method !== 'POST') return res.status(405).json({ error:'Method Not Allowed' });

    const { id, first_name, last_name, email, phone, brand, code } = req.body || {};
    if (!id) return res.status(400).json({ error:'id manquant' });

    const patch = {};
    if (first_name !== undefined) patch.first_name = first_name;
    if (last_name  !== undefined) patch.last_name  = last_name;
    if (email      !== undefined) patch.email      = email;
    if (phone      !== undefined) patch.phone      = phone;
    if (brand      !== undefined) patch.brand      = brand;
    if (code       !== undefined) patch.code       = code;

    const { error } = await supa.from('referrers').update(patch).eq('id', id);
    if (error) return res.status(400).json({ error:error.message });

    return res.status(200).json({ ok:true });
  } catch (e) {
    return res.status(500).json({ error:'Server error (referrers-update)', detail:String(e?.message||e) });
  }
}
