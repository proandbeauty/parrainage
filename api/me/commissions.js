// /api/me/commissions.js
export const config = { runtime: 'nodejs' };
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://tpwkptzlhxitllugmlho.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/**
 * GET /api/me/commissions?code=PNB-...&limit=10&offset=0
 */
export default async function handler(req, res) {
  try {
    const code = (req.query.code || '').trim();
    const limit = Number(req.query.limit || 10);
    const offset = Number(req.query.offset || 0);

    if (!code) return res.status(400).json({ error: 'code requis' });

    const { data: me } = await supabase.from('referrers').select('id').eq('referral_code', code).maybeSingle();
    if (!me?.id) return res.status(404).json({ error: 'code inconnu' });

    const { data, error } = await supabase
      .from('commissions')
      .select('id, amount, currency, status, role, created_at, sale_id')
      .eq('beneficiary_id', me.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ ok: true, items: data || [] });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'server' });
  }
}
