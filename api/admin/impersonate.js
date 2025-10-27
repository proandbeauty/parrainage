// api/admin/impersonate.js
const { getAdminClient, assertAdmin } = require('../_lib/supabaseAdmin');

module.exports = async (req, res) => {
  if (!assertAdmin(req, res)) return;

  const referrer_id = req.query?.referrer_id || req.body?.referrer_id;
  if (!referrer_id) return res.status(400).json({ error: 'referrer_id manquant' });

  try {
    const supa = getAdminClient();

    const { data: ref, error: e1 } = await supa
      .from('referrers')
      .select('email')
      .eq('id', referrer_id)
      .single();

    if (e1 || !ref?.email) return res.status(404).json({ error: 'email introuvable' });

    const siteUrl = process.env.SITE_PUBLIC_URL || 'https://example.com';
    const { data, error } = await supa.auth.admin.generateLink({
      type: 'magiclink',
      email: ref.email,
      options: { redirectTo: siteUrl }
    });

    if (error || !data?.properties?.action_link) {
      return res.status(400).json({ error: error?.message || 'magic link impossible' });
    }

    res.json({ url: data.properties.action_link });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
};
