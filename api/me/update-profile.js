// api/me/update-profile.js
import { requireAuth, send } from './_auth.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

    const { supabase, user } = await requireAuth(req);
    const { first_name, last_name, phone } = req.body || {};

    const { error } = await supabase
      .from('referrers')
      .update({
        first_name: first_name ?? null,
        last_name:  last_name  ?? null,
        phone:      phone      ?? null
      })
      .eq('id', user.id);

    if (error) return send(res, 500, { error: 'Update failed' });

    return send(res, 200, { ok: true });
  } catch (e) {
    if (Array.isArray(e)) return send(res, e[0], { error: e[1] });
    console.error(e);
    return send(res, 500, { error: 'Server error' });
  }
}
