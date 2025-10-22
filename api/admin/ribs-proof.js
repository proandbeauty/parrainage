// api/admin/ribs-proof.js
import { createClient } from '@supabase/supabase-js';

const TABLE_RIBS = 'bank_accounts'; // ← adapte si besoin
const BUCKET     = 'kyc';            // ← ton bucket Supabase où sont stockés les justificatifs
const EXPIRES    = 3600;             // 1h

function json(d, s = 200) {
  return new Response(JSON.stringify(d), {
    status: s,
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
 * GET /api/admin/ribs-proof?id=<rib_id>
 * -> { ok:true, url:"https://..." } (lien signé valable 1h)
 */
export default async function handler(req) {
  try {
    requireAdmin(req);

    const url = new URL(req.url);
    const id  = url.searchParams.get('id');
    if (!id) return json({ error: 'Missing id' }, 400);

    const sb = supa();
    const { data: rib, error } = await sb
      .from(TABLE_RIBS)
      .select('id, doc_path')
      .eq('id', id)
      .single();

    if (error) return json({ error: 'Not found', detail: error.message }, 404);
    if (!rib?.doc_path) return json({ error: 'No document for this RIB' }, 404);

    // doc_path = chemin relatif dans le bucket (ex: "ribs/abcd1234.pdf")
    const { data: signed, error: e2 } = await sb
      .storage
      .from(BUCKET)
      .createSignedUrl(rib.doc_path, EXPIRES);

    if (e2) return json({ error: 'Signed URL error', detail: e2.message }, 500);

    return json({ ok: true, url: signed?.signedUrl || null, expiresIn: EXPIRES });
  } catch (e) {
    if (e instanceof Response) return e;
    return json({ error: 'Unexpected', detail: String(e) }, 500);
  }
}
