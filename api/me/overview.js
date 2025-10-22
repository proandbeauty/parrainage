// /api/me/overview.js
export const config = { runtime: 'nodejs' };
import { createClient } from '@supabase/supabase-js';
import { verifyAuth } from './_auth';

const SUPABASE_URL = 'https://tpwkptzlhxitllugmlho.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  try{
    const user = verifyAuth(req);
    if (!user) return res.status(401).json({ error:'unauthorized' });

    // Profil
    const { data: me, error: e1 } = await supabase
      .from('referrers')
      .select('id, first_name, last_name, email, phone, referral_code, created_at')
      .eq('id', user.sub)
      .single();
    if (e1 || !me) return res.status(404).json({ error:'not found' });

    // Commissions (dernières)
    const { data: coms, error: e2 } = await supabase
      .from('commissions')
      .select('amount, currency, status, created_at, role, sale:sales(order_id)')
      .eq('beneficiary_id', me.id)
      .order('created_at', { ascending:false })
      .limit(25);
    if (e2) return res.status(500).json({ error:e2.message });

    const totals = { pending:0, approved:0, paid:0 };
    let currency = 'EUR';
    const latest = [];
    for (const c of (coms||[])) {
      currency = c.currency || currency;
      totals[c.status] = (totals[c.status] || 0) + Number(c.amount || 0);
      latest.push({
        amount: c.amount, currency: c.currency, status: c.status, role: c.role,
        created_at: c.created_at, sale: { order_id: c.sale?.order_id || null }
      });
    }

    // Filleuls
    const { data: kids, error: e3 } = await supabase
      .from('referrers')
      .select('id, first_name, last_name, email, referral_code, created_at')
      .eq('parent_id', me.id)
      .order('created_at', { ascending:false })
      .limit(100);
    if (e3) return res.status(500).json({ error:e3.message });

    let childrenSales = 0;
    if ((kids||[]).length > 0) {
      const kidIds = kids.map(k=>k.id);
      const { count } = await supabase
        .from('sales')
        .select('id', { count:'exact', head:true })
        .in('seller_id', kidIds);
      childrenSales = count || 0;
    }

    const share_url = 'https://www.proandbeauty.com';

    return res.status(200).json({
      ok:true,
      me,
      share_url,
      totals,
      currency,
      latest_commissions: latest,
      children: {
        count: kids?.length || 0,
        sales_count: childrenSales || 0,
        list: kids || []
      }
    });
  }catch(e){ console.error(e); return res.status(500).json({ error:'server' }); }
}
