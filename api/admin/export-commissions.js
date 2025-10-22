// /api/admin/export-commissions.js
export const config = { runtime: 'nodejs' };
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://tpwkptzlhxitllugmlho.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Helpers
function csvEscape(val) {
  if (val == null) return '';
  const s = String(val).replace(/"/g, '""');
  return `"${s}"`;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

    // Admin auth
    const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!ADMIN_TOKEN || auth !== ADMIN_TOKEN) return res.status(401).json({ error: 'unauthorized' });

    // Filtres optionnels
    const { status, from, to } = req.query;
    let query = supabase.from('v_commissions_detailed').select('*').order('commission_created_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (from)   query = query.gte('commission_created_at', from);
    if (to)     query = query.lte('commission_created_at', to);

    // On exporte “beaucoup” (tu peux ajuster)
    const { data, error } = await query.limit(50000);
    if (error) return res.status(500).json({ error: 'query failed', detail: error.message });

    // Construit CSV
    const headers = [
      'commission_id','commission_created_at','status','role',
      'commission_amount','commission_currency',
      'sale_id','order_id','sale_amount','sale_currency','sale_created_at',
      'beneficiary_id','first_name','last_name','email','referral_code'
    ];
    const lines = [headers.map(csvEscape).join(',')];

    for (const r of data || []) {
      lines.push([
        r.commission_id, r.commission_created_at, r.status, r.role,
        r.commission_amount, r.commission_currency,
        r.sale_id, r.order_id, r.sale_amount, r.sale_currency, r.sale_created_at,
        r.beneficiary_id, r.first_name, r.last_name, r.email, r.referral_code
      ].map(csvEscape).join(','));
    }

    const csv = lines.join('\r\n');
    const filename = `export-commissions-${new Date().toISOString().slice(0,10)}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(csv);
  } catch (e) {
    console.error('export-commissions fatal:', e);
    res.status(500).json({ error: 'server error' });
  }
}
