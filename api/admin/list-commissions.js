// /api/admin/list-commissions.js
export const config = { runtime: 'nodejs' };
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://tpwkptzlhxitllugmlho.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

    const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!ADMIN_TOKEN || auth !== ADMIN_TOKEN) return res.status(401).json({ error: 'unauthorized' });

    const page  = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit || '50', 10)));
    const from  = (page - 1) * limit;
    const to    = from + limit - 1;

    const { status } = req.query;

    let q = supabase.from('v_commissions_detailed').select('*', { count: 'exact' })
      .order('commission_created_at', { ascending: false })
      .range(from, to);

    if (status) q = q.eq('status', status);

    const { data, error, count } = await q;
    if (error) return res.status(500).json({ error: 'query failed', detail: error.message });

    const total = count || 0;
    const hasMore = page * limit < total;

    res.status(200).json({ items: data || [], page, limit, total, hasMore });
  } catch (e) {
    console.error('list-commissions fatal:', e);
    res.status(500).json({ error: 'server error' });
  }
}
