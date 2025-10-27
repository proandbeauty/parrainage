// api/admin/list-commissions.js
// ───────────────────────────────────────────────────────────
export const config = { runtime: 'nodejs' };

const { ensureAdmin } = require('./_auth');                // vérifie Authorization: Bearer <ADMIN_TOKEN>
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY || '';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const ok  = (res, body) => res.status(200).json(body);
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });

export default async function handler(req, res) {
  // Auth (en-tête Authorization: Bearer …)
  if (ensureAdmin(req, res) !== true) return;

  try {
    if (req.method !== 'GET') return bad(res, 'Method Not Allowed', 405);
    if (!SUPABASE_URL || !SERVICE_KEY) return bad(res, 'Server not configured', 500);

    // Params
    const page   = parseInt(req.query.page   || '0', 10);
    const limit  = Math.min(parseInt(req.query.limit  || '50', 10), 200);
    const offset = parseInt(req.query.offset || '0', 10);
    const status = String(req.query.status || '').trim().toLowerCase();
    const search = String(req.query.search || '').trim();

    // Base query (vue matérialisée ou vue SQL côté Supabase)
    let q = supabase
      .from('v_commissions_detailed')
      .select(`
        id, amount, currency, status, role, created_at,
        first_name, last_name, email, referral_code,
        sale_id, order_id, sale_amount, sale_currency, sale_created_at
      `)
      .order('created_at', { ascending: false });

    if (status && status !== 'all') q = q.eq('status', status);

    if (search) {
      const term = search.replace(/[%,"']/g, '');
      q = q.or([
        `first_name.ilike.%${term}%`,
        `last_name.ilike.%${term}%`,
        `email.ilike.%${term}%`,
        `referral_code.ilike.%${term}%`,
        `order_id.ilike.%${term}%`
      ].join(','));
    }

    // Pagination (page/limit OU offset/limit)
    if (page > 0) {
      const from = (page - 1) * limit;
      const to   = from + limit - 1;
      q = q.range(from, to);
    } else {
      q = q.range(offset, offset + limit - 1);
    }

    const { data, error } = await q;
    if (error) {
      console.error('Supabase (commissions) error:', error);
      return bad(res, 'Erreur base de données (commissions).');
    }

    if (page > 0) return ok(res, { items: data || [], hasMore: (data?.length || 0) === limit });
    return ok(res, { items: data || [], nextOffset: offset + (data?.length || 0) });

  } catch (e) {
    console.error('Server (commissions) error:', e);
    return bad(res, 'Erreur serveur (commissions).', 500);
  }
}
