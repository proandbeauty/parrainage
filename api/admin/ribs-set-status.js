// api/admin/ribs-set-status.js
import { createClient } from '@supabase/supabase-js';

const TABLE_RIBS = 'bank_accounts'; // ← adapte si besoin
const ALLOWED    = ['pending', 'validated', 'rejected'];

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
 * POST /api/admin/ribs-set-status
 * body: { id: string, status: "validated"|"rejected"|"pending", note?: string }
 */
export default async function handler(req) {
  try {
    requireAdmin(req);
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const { id, status, note } = await req.json().catch(() => ({}));
    if (!id || !ALLOWED.includes(status)) {
      return json({ error: 'Invalid payload' }, 400);
    }

    const now = new Date().toISOString();
    const sb = supa();

    const patch = {
      status,
      moderation_note: note ?? null,
    };
    if (status === 'validated') {
      patch.validated_at = now;
      patch.validated_by = 'admin'; // ← tu peux mettre l’email de l’admin connecté si tu gères ça
    }
    if (status === 'pending') {
      patch.validated_at = null;
      patch.validated_by = null;
    }

    const { data, error } = await sb
      .from(TABLE_RIBS)
      .update(patch)
      .eq('id', id)
      .select()
      .single();

    if (error) return json({ error: 'Update error', detail: error.message }, 500);
    return json({ ok: true, item: data });
  } catch (e) {
    if (e instanceof Response) return e;
    return json({ error: 'Unexpected', detail: String(e) }, 500);
  }
}
