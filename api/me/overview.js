// api/me/overview.js
// ⚠️ NOTE: imports RELATIFS avec extension .js
import { requireAuth, send } from './_auth.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });

    const { supabase, user } = await requireAuth(req);

    // --- Totaux par statut ---
    const { data: rowsTot, error: errTot } = await supabase
      .from('commissions')
      .select('status, amount, currency')
      .eq('beneficiary_id', user.id);

    if (errTot) return send(res, 500, { error: 'Totals query error' });

    const totals = { pending: 0, approved: 0, paid: 0 };
    let currency = 'EUR';
    for (const r of rowsTot || []) {
      currency = r.currency || currency;
      if (r.status === 'pending')  totals.pending  += Number(r.amount || 0);
      if (r.status === 'approved') totals.approved += Number(r.amount || 0);
      if (r.status === 'paid')     totals.paid     += Number(r.amount || 0);
    }

    // --- Dernières commissions (avec info vente) ---
    const { data: lastCom, error: errCom } = await supabase
      .from('commissions')
      .select('id, created_at, status, role, amount, currency, sale_id')
      .eq('beneficiary_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (errCom) return send(res, 500, { error: 'Commissions query error' });

    // On récupère les ventes liées
    const saleIds = [...new Set((lastCom || []).map(c => c.sale_id).filter(Boolean))];
    let saleMap = {};
    if (saleIds.length) {
      const { data: sales } = await supabase
        .from('sales')
        .select('id, order_id, amount, currency, created_at')
        .in('id', saleIds);
      for (const s of sales || []) saleMap[s.id] = s;
    }

    const latest_commissions = (lastCom || []).map(c => ({
      id: c.id,
      created_at: c.created_at,
      status: c.status,
      role: c.role,
      amount: c.amount,
      currency: c.currency,
      sale: saleMap[c.sale_id] || null
    }));

    // --- Filleuls + stats ---
    const { data: children, error: errKids } = await supabase
      .from('referrers')
      .select('id, first_name, last_name, email, referral_code, created_at')
      .eq('parent_id', user.id);

    if (errKids) return send(res, 500, { error: 'Children query error' });

    const childIds = children.map(k => k.id);
    let children_sales_count = 0;
    if (childIds.length) {
      const { count } = await supabase
        .from('sales')
        .select('id', { count: 'exact', head: true })
        .in('seller_id', childIds);
      children_sales_count = count || 0;
    }

    // URL de partage (ex : page d’inscription publique)
    const share_url = process.env.APP_BASE_URL || req.headers.origin || '';

    return send(res, 200, {
      ok: true,
      me: {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        phone: user.phone,
        referral_code: user.referral_code
      },
      totals,
      currency,
      latest_commissions,
      children: {
        count: children.length,
        sales_count: children_sales_count,
        list: children
      },
      share_url
    });
  } catch (e) {
    if (Array.isArray(e)) return send(res, e[0], { error: e[1] });
    console.error(e);
    return send(res, 500, { error: 'Server error' });
  }
}
