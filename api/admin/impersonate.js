// api/admin/impersonate.js
export const config = { runtime: 'nodejs' };

const { ensureAdmin }  = require('./_auth');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY || '';
const SITE_URL     = process.env.SITE_PUBLIC_URL || 'https://example.com';

const supaAdmin = createClient(SUPABASE_URL, SERVICE_KEY);

export default async function handler(req, res) {
  if (ensureAdmin(req, res) !== true) return;
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const referrer_id = req.query?.referrer_id || req.body?.referrer_id;
  if (!referrer_id) return res.status(400).json({ error: 'referrer_id manquant' });

  try {
    // 1) email du bénéficiaire
    const { data: ref, error: e1 } = await supaAdmin
      .from('referrers')
      .select('email')
      .eq('id', referrer_id)
      .single();
    if (e1 || !ref?.email) return res.status(404).json({ error: 'email introuvable' });

    // 2) magic link admin
    const { data, error } = await supaAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: ref.email,
      options: { redirectTo: SITE_URL }
    });
    if (error || !data?.properties?.action_link) {
      return res.status(400).json({ error: error?.message || 'magic link impossible' });
    }

    return res.json({ url: data.properties.action_link });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
