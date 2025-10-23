// /api/admin/list-commissions.js
export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_TOKEN  = process.env.ADMIN_TOKEN || '';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// Helpers
function ok(res, body) { return res.status(200).json(body); }
function bad(res, msg, code = 400) { return res.status(code).json({ error: msg }); }
function auth(req) {
  const h = String(req.headers.authorization || '');
  const token = h.replace(/^Bearer\s+/i, '').trim();
  return token && token === ADMIN_TOKEN;
}

/**
 * Supporte:
 * - pagination page/limit (préférence) ou offset/limit (fallback)
 * - status: pending|approved|paid
 * - search: filtre large (nom, email, code, order_id)
 *
 * Source: vue SQL v_commissions_detailed avec colonnes:
 * id, amount, currency, status, role, created_at,
 * first_name, last_name, email, referral_code,
 * sale_id, order_id, sale_amount, sale_currency, sale_created_at
 */
export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return bad(res, 'Method Not Allowed', 405);
    if (!auth(req)) return bad(res, 'Unauthorized', 401);
    if (!SUPABASE_URL || !SERVICE_KEY) return bad(res, 'Server not configured', 500);

    // ---- params
    const page  = parseInt(req.query.page || '0', 10);
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
    const offset = parseInt(req.query.offset || '0', 10);
    const status = String(req.query.status || '').trim().toLowerCase();
    const search = String(req.query.search || '').trim();

    // ---- base query
    let q = supabase
      .from('v_commissions_detailed')
      .select(`
        id, amount, currency, status, role, created_at,
        first_name, last_name, email, referral_code,
        sale_id, order_id, sale_amount, sale_currency, sale_created_at
      `)
      .order('created_at', { ascending: false });

    if (status && status !== 'all') q = q.eq('status', status);

    // ---- search
    if (search) {
      const term = search.replace(/[%,"']/g, '');
      // OR sur plusieurs colonnes
      q = q.or([
        `first_name.ilike.%${term}%`,
        `last_name.ilike.%${term}%`,
        `email.ilike.%${term}%`,
        `referral_code.ilike.%${term}%`,
        `order_id.ilike.%${term}%`,
      ].join(','));
    }

    // ---- pagination
    if (page > 0) {
      const from = (page - 1) * limit;
      const to   = from + limit - 1;
      q = q.range(from, to);
    } else {
      q = q.range(offset, offset + limit - 1);
    }

    const { data, error } = await q;
    if (error) {
      console.error('Supabase select error (commissions):', error);
      return bad(res, 'Erreur base de données (commissions).');
    }

    // Heuristique "hasMore" si page/limit
    if (page > 0) {
      return ok(res, { items: data || [], hasMore: (data?.length || 0) === limit });
    }
    // Fallback offset/limit
    return ok(res, { items: data || [], nextOffset: offset + (data?.length || 0) });

  } catch (e) {
    console.error('Server error (list-commissions):', e);
    return bad(res, 'Erreur serveur (commissions).', 500);
  }
}
