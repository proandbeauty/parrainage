// /api/admin/ribs-list.js
export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_TOKEN  = process.env.ADMIN_TOKEN || '';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

function ok(res, body) { return res.status(200).json(body); }
function bad(res, msg, code = 400) { return res.status(code).json({ error: msg }); }
function auth(req) {
  const h = String(req.headers.authorization || '');
  const token = h.replace(/^Bearer\s+/i, '').trim();
  return token && token === ADMIN_TOKEN;
}

/**
 * Supporte:
 * - status: pending|approved|rejected|all
 * - search: nom, email, code, iban, titulaire
 * - sort_by: created_at|holder_name ; order: asc|desc
 * - limit/offset
 *
 * On récupère large puis on filtre côté Node (fiable quel que soit l’alias de jointure).
 */
export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return bad(res, 'Method Not Allowed', 405);
    if (!auth(req)) return bad(res, 'Unauthorized', 401);
    if (!SUPABASE_URL || !SERVICE_KEY) return bad(res, 'Server not configured', 500);

    const status = String(req.query.status || 'all').toLowerCase();
    const limit  = Math.min(parseInt(req.query.limit || '50', 10), 200);
    const offset = parseInt(req.query.offset || '0', 10);
    const search = String(req.query.search || '').trim();
    const sortBy = (req.query.sort_by || 'created_at').toString();
    const order  = (req.query.order || 'desc').toString().toLowerCase() === 'asc' ? {ascending:true} : {ascending:false};

    // On tire "large" (jusqu’à 1000) pour permettre le filtrage en mémoire
    let q = supabase
      .from('bank_accounts')
      .select(`
        id, status, created_at, iban, bic, holder_name, doc_path,
        referrer:referrers ( first_name, last_name, email, referral_code )
      `)
      .order(sortBy === 'holder_name' ? 'holder_name' : 'created_at', order)
      .limit(1000);

    if (status && status !== 'all') {
      q = q.eq('status', status);
    }

    const { data, error } = await q;
    if (error) {
      console.error('Supabase select error (ribs):', error);
      return bad(res, 'Erreur base de données (RIB).');
    }

    let rows = Array.isArray(data) ? data : [];

    // Filtrage "search" côté Node (champ multiples)
    if (search) {
      const term = search.toLowerCase();
      rows = rows.filter(r => {
        const ref = r.referrer || {};
        return (
          String(ref.first_name || '').toLowerCase().includes(term) ||
          String(ref.last_name  || '').toLowerCase().includes(term) ||
          String(ref.email      || '').toLowerCase().includes(term) ||
          String(ref.referral_code || '').toLowerCase().includes(term) ||
          String(r.holder_name || '').toLowerCase().includes(term) ||
          String(r.iban        || '').toLowerCase().includes(term)
        );
      });
    }

    // Pagination finale côté Node
    const sliced = rows.slice(offset, offset + limit);
    const nextOffset = offset + sliced.length;

    // CSV ?
    if ((req.query.format || '').toString().toLowerCase() === 'csv') {
      const head = ['id','status','created_at','titulaire','iban','bic','email','code'];
      const lines = [head.join(';')];
      for (const r of rows) {
        const ref = r.referrer || {};
        const line = [
          r.id,
          r.status,
          r.created_at || '',
          r.holder_name || '',
          r.iban || '',
          r.bic || '',
          ref.email || '',
          ref.referral_code || ''
        ].map(v => `"${String(v ?? '').replace(/"/g,'""')}"`).join(';');
        lines.push(line);
      }
      const csv = lines.join('\n');
      res.setHeader('Content-Type','text/csv; charset=utf-8');
      res.setHeader('Content-Disposition','attachment; filename="export-ribs.csv"');
      return res.status(200).send(csv);
    }

    return ok(res, { items: sliced, nextOffset });
  } catch (e) {
    console.error('Server error (ribs-list):', e);
    return bad(res, 'Erreur serveur (RIB).', 500);
  }
}
