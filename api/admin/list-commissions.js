// /api/admin/list-commissions.js
export const config = { runtime: 'nodejs' };
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://tpwkptzlhxitllugmlho.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/**
 * GET /api/admin/list-commissions?status=all|pending|approved|paid&limit=50&offset=0&search=dupont
 * Headers: Authorization: Bearer <ADMIN_TOKEN>
 */
export default async function handler(req, res) {
  try {
    // Auth simple par Bearer token
    const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!ADMIN_TOKEN || auth !== ADMIN_TOKEN) return res.status(401).json({ error: 'unauthorized' });

    const status = (req.query.status || 'all').toString();
    const limit = Math.min(200, Number(req.query.limit || 50));
    const offset = Math.max(0, Number(req.query.offset || 0));
    const search = (req.query.search || '').trim();

    // On charge commissions + infos vente + infos bénéficiaire
    let q = supabase
      .from('commissions')
      .select(`
        id, amount, currency, status, role, created_at,
        sale:sales(id, amount, currency, order_id, created_at),
        beneficiary:referrers(id, first_name, last_name, email, referral_code)
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status !== 'all') q = q.eq('status', status);

    // Recherche texte côté client (simple)
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });

    let items = data || [];
    if (search) {
      const s = search.toLowerCase();
      items = items.filter((r) => {
        const b = r.beneficiary || {};
        const hay = [
          b.first_name, b.last_name, b.email, b.referral_code,
          r.sale?.order_id, r.role, r.status
        ].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(s);
      });
    }

    return res.status(200).json({ ok: true, items, nextOffset: offset + items.length });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'server' });
  }
}
