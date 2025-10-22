// /api/me/overview.js
export const config = { runtime: 'nodejs' };
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://tpwkptzlhxitllugmlho.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/**
 * GET /api/me/overview?code=PNB-...
 */
export default async function handler(req, res) {
  try {
    const code = (req.query.code || '').trim();
    if (!code) return res.status(400).json({ error: 'code requis' });

    const { data: me } = await supabase.from('referrers').select('id').eq('referral_code', code).maybeSingle();
    if (!me?.id) return res.status(404).json({ error: 'code inconnu' });

    const agg = async (status) => {
      const { data, error } = await supabase
        .from('commissions')
        .select('amount')
        .eq('beneficiary_id', me.id)
        .eq('status', status);
      if (error) return 0;
      return (data || []).reduce((s, r) => s + Number(r.amount), 0);
    };

    const pending  = await agg('pending');
    const approved = await agg('approved');
    const paid     = await agg('paid');

    return res.status(200).json({ ok: true, totals: { pending, approved, paid } });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'server' });
  }
}
