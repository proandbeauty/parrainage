// /api/admin/list-referrers.js
export const config = { runtime: 'nodejs' };
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

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

    const ribFilter = String(q.rib || 'all').toLowerCase(); // approved|pending|rejected|missing|all
    const date_from = q.date_from ? new Date(q.date_from) : null;
    const date_to   = q.date_to ? new Date(q.date_to) : null;

    // 1) On récupère les referrers (paged)
    let sel = supabase
      .from('referrers')
      .select('id, first_name, last_name, email, referral_code, created_at')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      sel = sel.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,referral_code.ilike.%${search}%`
      );
    }

    const { data: refs, error: errRefs } = await sel;
    if (errRefs) {
      console.error(errRefs);
      return res.status(500).json({ error: 'supabase_referrers_failed' });
    }
    const ids = (refs || []).map(r => r.id);
    if (ids.length === 0) {
      return res.status(200).json({ ok: true, items: [], nextOffset: offset }); // page vide
    }

    // 2) On récupère tous les bank_accounts pour ces referrers et on garde le plus récent par referrer_id
    const { data: banks, error: errBanks } = await supabase
      .from('bank_accounts')
      .select('id, referrer_id, status, created_at')
      .in('referrer_id', ids)
      .order('created_at', { ascending: false });
    if (errBanks) {
      console.error(errBanks);
      return res.status(500).json({ error: 'supabase_bank_accounts_failed' });
    }
    const latestByRef = new Map(); // referrer_id -> status
    for (const b of banks || []) {
      if (!latestByRef.has(b.referrer_id)) {
        latestByRef.set(b.referrer_id, { status: (b.status || '').toLowerCase(), created_at: b.created_at });
      }
    }

    // 3) On récupère l'activité (max created_at) dans commissions pour beneficiary_id in ids
    const { data: acts, error: errActs } = await supabase
      .from('commissions')
      .select('beneficiary_id, created_at')
      .in('beneficiary_id', ids)
      .order('created_at', { ascending: false }); // on triera en JS
    if (errActs) {
      console.error(errActs);
      return res.status(500).json({ error: 'supabase_commissions_failed' });
    }
    const lastAct = new Map(); // referrer_id -> last_created_at
    for (const a of acts || []) {
      const prev = lastAct.get(a.beneficiary_id);
      if (!prev || new Date(a.created_at) > new Date(prev)) {
        lastAct.set(a.beneficiary_id, a.created_at);
      }
    }

    // 4) Composition + filtres RIB/date
    let rows = (refs || []).map(r => {
      const rib = latestByRef.get(r.id);
      const rib_status = rib ? rib.status : 'missing';
      const last_activity = lastAct.get(r.id) || null;
      return {
        id: r.id,
        first_name: r.first_name,
        last_name: r.last_name,
        email: r.email,
        code: r.referral_code,
        created_at: r.created_at,
        rib_status,
        last_activity
      };
    });

    // Filtre RIB
    if (ribFilter !== 'all') {
      rows = rows.filter(x => (x.rib_status || 'missing') === ribFilter);
    }
    // Filtre sur date d’activité
    if (date_from) rows = rows.filter(x => !x.last_activity || new Date(x.last_activity) >= date_from);
    if (date_to)   rows = rows.filter(x => !x.last_activity || new Date(x.last_activity) <= date_to);

    // Tri: dernière activité desc, fallback created_at
    rows.sort((a,b)=>{
      const da = a.last_activity ? new Date(a.last_activity) : new Date(0);
      const db = b.last_activity ? new Date(b.last_activity) : new Date(0);
      if (db - da !== 0) return db - da;
      return (new Date(b.created_at)) - (new Date(a.created_at));
    });

    return res.status(200).json({
      ok: true,
      items: rows,
      nextOffset: offset + rows.length
    });

  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'server' });
  }
}
