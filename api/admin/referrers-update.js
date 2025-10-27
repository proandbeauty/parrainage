// api/admin/referrers-update.js
export const config = { runtime: 'nodejs' };

const { ensureAdmin }   = require('./_auth');
const { createClient }  = require('@supabase/supabase-js');

const SUPABASE_URL         = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const supa                 = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  if (ensureAdmin(req, res) !== true) return;
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const { id, first_name, last_name, email, phone, brand /*, code*/ } = req.body || {};
  if (!id) return res.status(400).json({ error: 'id manquant' });

  // ⚠️ Le code parrain NE DOIT PAS être modifié depuis l’admin.
  const patch = {};
  if (first_name !== undefined) patch.first_name = first_name;
  if (last_name  !== undefined) patch.last_name  = last_name;
  if (email      !== undefined) patch.email      = email;
  if (phone      !== undefined) patch.phone      = phone;
  if (brand      !== undefined) patch.brand      = brand;
  // if (code !== undefined) { /* NE PAS toucher au referral_code */ }

  try {
    const { error } = await supa.from('referrers').update(patch).eq('id', id);
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
