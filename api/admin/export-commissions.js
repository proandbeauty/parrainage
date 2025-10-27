// api/admin/export-commissions.js
export const config = { runtime: 'nodejs' };

const { ensureAdmin }  = require('./_auth');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL        = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY= process.env.SUPABASE_SERVICE_KEY || '';
const supabase            = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Helpers
function csvEscape(val) {
  if (val == null) return '';
  const s = String(val).replace(/"/g, '""');
  return `"${s}"`;
}

export default async function handler(req, res) {
  // Auth via Authorization: Bearer <ADMIN_TOKEN>
  if (ensureAdmin(req, res) !== true) return;

  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const status = req.query.status ? String(req.query.status).trim() : '';
    const from   = req.query.from   ? String(req.query.from).trim()   : '';
    const to     = req.query.to     ? String(req.query.to).trim()     : '';

    let query = supabase
      .from('v_commissions_detailed')
      .select(`
        commission_id, commission_created_at, status, role,
        commission_amount, commission_currency,
        sale_id, order_id, sale_amount, sale_currency, sale_created_at,
        beneficiary_id, first_name, last_name, email, referral_code
      `)
      .order('commission_created_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (from)   query = query.gte('commission_created_at', from);
    if (to)     query = query.lte('commission_created_at', to);

    const { data, error } = await query.limit(50000);
    if (error) {
      return res.status(500).json({ error: 'query failed', detail: error.message });
    }

    // Construit CSV
    const headers = [
      'commission_id','commission_created_at','status','role',
      'commission_amount','commission_currency',
      'sale_id','order_id','sale_amount','sale_currency','sale_created_at',
      'beneficiary_id','first_name','last_name','email','referral_code'
    ];
    const lines = [headers.map(csvEscape).join(',')];

    for (const r of (data || [])) {
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
    return res.status(200).send(csv);

  } catch (e) {
    console.error('export-commissions fatal:', e);
    return res.status(500).json({ error: 'server error' });
  }
}
