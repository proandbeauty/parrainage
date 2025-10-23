// /api/admin/list-sales.js
export const config = { runtime: 'nodejs' };
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// On s'appuie sur la vue v_commissions_detailed (déjà utilisée côté user/admin)
// et on sélectionne les métadonnées de vente.
export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

    // Auth admin
    const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!ADMIN_TOKEN || auth !== ADMIN_TOKEN) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const q = req.query || {};
    const search = String(q.search || '').trim();
    const limit = Math.min(parseInt(q.limit || '50', 10), 200);
    const offset = parseInt(q.offset || '0', 10);

    const date_from = q.date_from ? new Date(q.date_from) : null; // ISO YYYY-MM-DD
    const date_to = q.date_to ? new Date(q.date_to) : null;
    const postal = String(q.postal || '').trim();
    const amtMin = q.amount_min != null && q.amount_min !== '' ? Number(q.amount_min) : null;
    const amtMax = q.amount_max != null && q.amount_max !== '' ? Number(q.amount_max) : null;

    // On récupère un "super-set" de lignes depuis la vue; on filtrera/agrégera en JS.
    let sel = supabase
      .from('v_commissions_detailed')
      .select(`
        sale_id,
        order_id:sale_order_id,
        sale_created_at,
        sale_amount,
        sale_currency,
        institute_name,
        pro_name,
        postal_code,
        beneficiary_email
      `)
      .order('sale_created_at', { ascending: false })
      .range(offset, offset + limit * 3 - 1); // on tire un peu plus large pour dédoublonner

    if (search) {
      // recherche "large" côté vue (sur institut / pro / order / postal)
      sel = sel.or(`sale_order_id.ilike.%${search}%,institute_name.ilike.%${search}%,pro_name.ilike.%${search}%,postal_code.ilike.%${search}%`);
    }

    // (Les filtres fins seront appliqués côté JS; si tu veux, on peut aussi les pousser en SQL)

    const { data, error } = await sel;
    if (error) {
      console.error(error);
      return res.status(500).json({ error: 'supabase_select_failed' });
    }

    // Dédoublonnage par order_id, puis filtres JS
    const map = new Map();
    for (const r of data || []) {
      const key = r.order_id || r.sale_id || null;
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, {
          order_id: r.order_id || '',
          created_at: r.sale_created_at || null,
          institute_name: r.institute_name || null,
          pro_name: r.pro_name || null,
          postal_code: r.postal_code || null,
          amount: r.sale_amount != null ? Number(r.sale_amount) : null,
          currency: r.sale_currency || 'EUR'
        });
      }
    }

    let rows = Array.from(map.values());

    // Filtres
    if (date_from) rows = rows.filter(x => x.created_at && new Date(x.created_at) >= date_from);
    if (date_to)   rows = rows.filter(x => x.created_at && new Date(x.created_at) <= date_to);
    if (postal) {
      const p = postal.toLowerCase();
      rows = rows.filter(x => String(x.postal_code || '').toLowerCase().includes(p));
    }
    if (amtMin != null) rows = rows.filter(x => x.amount != null && x.amount >= amtMin);
    if (amtMax != null) rows = rows.filter(x => x.amount != null && x.amount <= amtMax);

    // Tri desc par date
    rows.sort((a,b) => (new Date(b.created_at)) - (new Date(a.created_at)));

    // Pagination finale sur les lignes dédoublonnées/filtrées
    const sliced = rows.slice(0, limit);

    return res.status(200).json({
      ok: true,
      items: sliced,
      total_in_page: sliced.length,
      nextOffset: offset + sliced.length
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'server' });
  }
}
