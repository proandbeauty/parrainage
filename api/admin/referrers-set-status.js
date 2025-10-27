// api/admin/referrers-set-status.js
export const config = { runtime: 'nodejs' };

const { ensureAdmin }  = require('./_auth');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL        = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY= process.env.SUPABASE_SERVICE_KEY || '';
const supa                = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  // Auth via Authorization: Bearer <ADMIN_TOKEN>
  if (ensureAdmin(req, res) !== true) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { id, status } = req.body || {};
  if (!id || !['suspended', 'active'].includes(status)) {
    return res.status(400).json({ error: 'payload invalide' });
  }

  try {
    const is_suspended = status === 'suspended';
    const { error } = await supa
      .from('referrers')
      .update({ is_suspended })
      .eq('id', id);
    if (error) return res.status(400).json({ error: error.message });

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
