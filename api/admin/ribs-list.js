// api/admin/ribs-list.js
import { createClient } from '@supabase/supabase-js';

const TABLE_RIBS = 'bank_accounts';   // ← adapte si besoin
const TABLE_REF  = 'referrers';       // ← adapte si besoin
const PAGE_MAX   = 100;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
function requireAdmin(req) {
  const h = req.headers.get('authorization') || '';
  const tok = h.split(' ')[1] || '';
  if (!tok || tok !== process.env.ADMIN_TOKEN) {
    throw new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
}
function supa() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
}

/**
 * GET /api/admin/ribs-list?status=pending|validated|rejected|all&search=...&limit=50&offset=0
 */
export default async function handler(req) {
  try {
    requireAdmin(req);

    const url = new URL(req.url);
    const status = (url.searchParams.get('status') || 'pending').toLowerCase();
    const search = (url.searchParams.get('search') || '').trim();
    const limit  = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), PAGE_MAX);
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10), 0);

    const sb = supa();

    // 1) On part de tous les RIB (filtre statut si ≠ all)
    let q = sb.from(TABLE_RIBS)
      .select('id, referrer_id, holder_name, iban_masked, bic, doc_path, status, created_at, validated_at, validated_by, moderation_note', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (['pending', 'validated', 'rejected'].includes(status)) {
      q = q.eq('status', status);
    }

    let { data: ribs, error } = await q;
    if (error) return json({ error: 'Query error', detail: error.message }, 500);

    // 2) Si recherche, on va chercher les referrers qui matchent
    //    (nom, email, referral_code), puis on filtre les ribs par referrer_id
    if (search) {
      const { data: refs, error: e2 } = await sb
        .from(TABLE_REF)
        .select('id, first_name, last_name, email, referral_code')
        .or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,referral_code.ilike.%${search}%`);
      if (e2) return json({ error: 'Search error', detail: e2.message }, 500);
      const allowedIds = new Set((refs || []).map(r => r.id));
      ribs = ribs.filter(r => allowedIds.has(r.referrer_id));
    }

    // 3) Hydratation referrer (nom, email, code)
    const refIds = [...new Set(ribs.map(r => r.referrer_id))];
    let refsById = {};
    if (refIds.length) {
      const { data: refs, error: e3 } = await sb
        .from(TABLE_REF)
        .select('id, first_name, last_name, email, referral_code')
        .in('id', refIds);
      if (e3) return json({ error: 'Join error', detail: e3.message }, 500);
      refsById = Object.fromEntries((refs || []).map(r => [r.id, r]));
    }

    const items = ribs.map(r => ({
      ...r,
      referrer: refsById[r.referrer_id] || null,
    }));

    const nextOffset = items.length < limit ? null : offset + items.length;
    return json({ ok: true, items, nextOffset });
  } catch (e) {
    if (e instanceof Response) return e;
    return json({ error: 'Unexpected', detail: String(e) }, 500);
  }
}
