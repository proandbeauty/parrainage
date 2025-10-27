const { ensureAdmin } = require('./_auth');

export default async function handler(req, res) {
  const ok = ensureAdmin(req, res);      // ⬅️ ajoute ces 2 lignes en tête
  if (ok !== true) return;

// /api/admin/set-commission-status.js
export const config = { runtime: 'nodejs' };
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://tpwkptzlhxitllugmlho.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/**
 * POST /api/admin/set-commission-status
 * Headers: Authorization: Bearer <ADMIN_TOKEN>
 * Body: { commission_id: string, status: "pending" | "approved" | "paid" }
 */
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST')
      return res.status(405).json({ error: 'Method Not Allowed' });

    // --- Auth simple (token admin) ---
    const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!ADMIN_TOKEN || auth !== ADMIN_TOKEN)
      return res.status(401).json({ error: 'unauthorized' });

    const { commission_id, status } = req.body || {};
    if (!commission_id || !['pending', 'approved', 'paid'].includes(status))
      return res.status(400).json({ error: 'commission_id et status requis' });

    // --- Mise à jour ---
    const { data, error } = await supabase
      .from('commissions')
      .update({ status })
      .eq('id', commission_id)
      .select('*')
      .single();

    if (error)
      return res.status(500).json({ error: 'Erreur mise à jour', detail: error.message });

    return res.status(200).json({ ok: true, commission: data });
  } catch (e) {
    console.error('set-commission-status fatal:', e);
    return res.status(500).json({ error: 'server error' });
  }
}
