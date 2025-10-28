// /api/admin/list-commissions.js
const { ensureAdmin } = require('./_auth');
export const config = { runtime: 'nodejs' };
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

export default async function handler(req, res) {
  const ok = ensureAdmin(req, res);     // <-- lit x-admin-token OU Authorization
  if (ok !== true) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const limit  = Math.min(parseInt(req.query.limit || '50', 10), 200);
  const offset = parseInt(req.query.offset || '0', 10);
  const page   = parseInt(req.query.page || '0', 10);
  const status = String(req.query.status || '').trim().toLowerCase();
  const search = String(req.query.search || '').trim();

  let q = supabase
    .from('v_commissions_detailed')
    .select(`
      commission_id, commission_created_at, status, role,
      commission_amount, commission_currency,
      sale_id, order_id, sale_amount, sale_currency, sale_created_at,
      beneficiary_id, first_name, last_name, email, referral_code
    `)
    .order('commission_created_at', { ascending: false });

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

  if (page > 0) {
    const from = (page - 1) * limit, to = from + limit - 1;
    q = q.range(from, to);
  } else {
    q = q.range(offset, offset + limit - 1);
  }

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: 'db', detail: error.message });

  // Normalisation attendue par admin.html
  const items = (data || []).map(r => ({
    id: r.commission_id,
    created_at: r.commission_created_at,
    status: r.status,
    role: r.role,
    amount: r.commission_amount,
    currency: r.commission_currency,
    beneficiary: {
      first_name: r.first_name,
      last_name:  r.last_name,
      email:      r.email,
      referral_code: r.referral_code
    },
    sale: {
      id: r.sale_id,
      order_id: r.order_id,
      amount: r.sale_amount,
      currency: r.sale_currency,
      created_at: r.sale_created_at
    }
  }));

  if (page > 0) return res.status(200).json({ items, hasMore: items.length === limit });
  return res.status(200).json({ items, nextOffset: offset + items.length });
}
