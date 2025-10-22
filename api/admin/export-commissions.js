// /api/admin/export-commissions.js
export const config = { runtime: 'nodejs' };
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://tpwkptzlhxitllugmlho.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/**
 * GET /api/admin/export-commissions?status=all|pending|approved|paid
 * Headers: Authorization: Bearer <ADMIN_TOKEN>
 * Renvoie un CSV.
 */
export default async function handler(req, res) {
  try {
    const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!ADMIN_TOKEN || auth !== ADMIN_TOKEN) return res.status(401).end('unauthorized');

    const status = (req.query.status || 'all').toString();

    let q = supabase
      .from('commissions')
      .select(`
        id, amount, currency, status, role, created_at,
        sale:sales(id, amount, currency, order_id, created_at),
        beneficiary:referrers(id, first_name, last_name, email, referral_code)
      `)
      .order('created_at', { ascending: false })
      .limit(5000);

    if (status !== 'all') q = q.eq('status', status);

    const { data, error } = await q;
    if (error) return res.status(500).end(error.message);

    const rows = (data || []).map(r => ({
      commission_id: r.id,
      created_at: r.created_at,
      status: r.status,
      role: r.role,
      amount: Number(r.amount).toFixed(2),
      currency: r.currency,
      sale_id: r.sale?.id || '',
      order_id: r.sale?.order_id || '',
      sale_amount: r.sale ? Number(r.sale.amount).toFixed(2) : '',
      beneficiary_name: `${r.beneficiary?.first_name || ''} ${r.beneficiary?.last_name || ''}`.trim(),
      beneficiary_email: r.beneficiary?.email || '',
      referral_code: r.beneficiary?.referral_code || ''
    }));

    const header = Object.keys(rows[0] || {
      commission_id:'', created_at:'', status:'', role:'', amount:'', currency:'',
      sale_id:'', order_id:'', sale_amount:'', beneficiary_name:'', beneficiary_email:'', referral_code:''
    });

    const csv = [
      header.join(','),
      ...rows.map(obj => header.map(k => String(obj[k]).replace(/"/g,'""')).map(v=>`"${v}"`).join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="commissions_${status}.csv"`);
    return res.status(200).send(csv);
  } catch (e) {
    console.error(e);
    return res.status(500).end('server');
  }
}
