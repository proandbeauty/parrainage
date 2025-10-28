export const config = { runtime: 'nodejs' };
import { ensureAdmin } from './_auth';
import { createClient } from '@supabase/supabase-js';

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  const ok = ensureAdmin(req, res);
  if (ok !== true) return;

  try {
    const referrer_id = req.query?.referrer_id || req.body?.referrer_id;
    if (!referrer_id) return res.status(400).json({ error:'referrer_id manquant' });

    const { data: ref, error: e1 } = await supa
      .from('referrers')
      .select('email')
      .eq('id', referrer_id)
      .single();

    if (e1 || !ref?.email) return res.status(404).json({ error:'email introuvable' });

    const siteUrl = process.env.SITE_PUBLIC_URL || 'https://example.com';
    const { data, error } = await supa.auth.admin.generateLink({
      type: 'magiclink',
      email: ref.email,
      options: { redirectTo: siteUrl }
    });

    if (error || !data?.properties?.action_link) {
      return res.status(400).json({ error: error?.message || 'magic link impossible' });
    }

    res.status(200).json({ url: data.properties.action_link });
  } catch (e) {
    res.status(500).json({ error:'Server error (impersonate)', detail:String(e?.message||e) });
  }
}
