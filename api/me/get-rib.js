// api/me/get-rib.js
import { requireAuth, send } from './_auth.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });

    const { supabase, user } = await requireAuth(req);

    const { data, error } = await supabase
      .from('rib')
      .select('titulaire, iban, bic, banque, justificatif_path, rgpd_consent, status, updated_at, created_at')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) return send(res, 500, { error: 'Lecture impossible' });

    return send(res, 200, { ok: true, rib: data || null });
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: 'Server error' });
  }
}
