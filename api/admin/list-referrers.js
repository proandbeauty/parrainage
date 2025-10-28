// /api/admin/list-referrers.js
export const config = { runtime: 'nodejs' };

const { ensureAdmin } = require('./_auth');
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;
const supabase     = createClient(SUPABASE_URL, SERVICE_KEY);

const ok  = (res, body) => res.status(200).json(body);
const bad = (res, msg, code = 400, detail) =>
  res.status(code).json({ error: msg, detail });

export default async function handler(req, res) {
  const isAdmin = ensureAdmin(req, res);
  if (isAdmin !== true) return;

  if (req.method !== 'GET') return bad(res, 'Method Not Allowed', 405);

  try {
    const limit  = Math.min(parseInt(req.query.limit || '100', 10), 500);
    const offset = parseInt(req.query.offset || '0', 10);
    const idEq   = String(req.query.id || '').trim();
    const search = idEq ? '' : String(req.query.search || '').trim();
    const rib    = String(req.query.rib || 'all').toLowerCase();
    const dateFrom = String(req.query.date_from || '').trim();
    const dateTo   = String(req.query.date_to   || '').trim();

    // 1) lire referrers (+ colonnes utiles)
    let q = supabase
      .from('referrers')
      .select(`
        id, first_name, last_name, email, phone,
        brand, code, referral_code,
        parent_id, parent_code,
        created_at, updated_at
      `)
      .order('updated_at', { ascending: false })
      .limit(2000);

    if (idEq)     q = q.eq('id', idEq);
    if (dateFrom) q = q.gte('created_at', dateFrom);
    if (dateTo)   q = q.lte('created_at', dateTo + 'T23:59:59');

    if (search) {
      const term = search.replace(/[%,"']/g, '');
      q = q.or([
        `first_name.ilike.%${term}%`,
        `last_name.ilike.%${term}%`,
        `email.ilike.%${term}%`,
        `referral_code.ilike.%${term}%`,
        `code.ilike.%${term}%`,
        `parent_code.ilike.%${term}%`
      ].join(','));
    }

    const { data: refs, error: e1 } = await q;
    if (e1) return bad(res, 'Erreur base de données (bénéficiaires).', 500, e1.message);

    // 2) map RIB
    const { data: ribs, error: e2 } = await supabase
      .from('bank_accounts')
      .select('referrer_id, status');

    if (e2) return bad(res, 'Erreur lecture RIB (bénéficiaires).', 500, e2.message);

    const ribMap = new Map();
    ribs?.forEach(r => ribMap.set(r.referrer_id, r.status || 'pending'));

    // 3) map id -> referral_code (pour retrouver le code du parent)
    const idToReferral = new Map();
    refs?.forEach(r => idToReferral.set(r.id, r.referral_code || r.code || ''));

    // 4) projection / enrichissement
    let rows = (refs || []).map(r => {
      const role = r.parent_id ? 'filleul' : 'parrain';
      const myCode = r.referral_code || r.code || '';
      // parent_code prioritaire si déjà stocké, sinon on déduit via le parent_id
      const pCode =
        (r.parent_code || '').trim() ||
        (r.parent_id ? (idToReferral.get(r.parent_id) || '') : '');

      return {
        id: r.id,
        first_name: r.first_name,
        last_name:  r.last_name,
        email:      r.email,
        phone:      r.phone,
        brand:      r.brand,
        code:       myCode,          // ← toujours rempli à partir de referral_code si besoin
        role,                         // parrain / filleul
        parent_code: role === 'filleul' ? (pCode || '') : '',
        last_activity: r.updated_at || r.created_at,
        rib_status: ribMap.get(r.id) || 'missing',
      };
    });

    if (rib && rib !== 'all') rows = rows.filter(x => x.rib_status === rib);

    // 5) pagination
    const sliced     = rows.slice(offset, offset + limit);
    const nextOffset = offset + sliced.length;

    return ok(res, { items: sliced, nextOffset });
  } catch (e) {
    return bad(res, 'Erreur serveur (bénéficiaires).', 500, String(e?.message || e));
  }
}
