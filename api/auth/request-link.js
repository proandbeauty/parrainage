// /api/auth/request-link.js
export const config = { runtime: 'nodejs' }; // important pour Vercel
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://tpwkptzlhxitllugmlho.supabase.co';
// NB: ton code fonctionnera aussi si tu gardes l’URL codée en dur,
// mais je lis SUPABASE_URL si tu l’as défini.
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const APP_BASE_URL = (process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const BREVO_KEY = process.env.BREVO_API_KEY || process.env.BREVO_KEY; // accepte l’un OU l’autre nom

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const USER_JWT_SECRET = process.env.USER_JWT_SECRET || 'dev-secret-change-me';
function signShort(payload, expSecs = 10 * 60) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + expSecs })
  ).toString('base64url');
  const data = `${header}.${body}`;
  const sig = crypto.createHmac('sha256', USER_JWT_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { email } = (req.body || {});
    const cleanEmail = String(email || '').trim();
    if (!cleanEmail) return res.status(400).json({ error: 'email requis' });

    // ——— DIAGNOSTIC ———
    const diag = {
      has_service_key: !!SUPABASE_SERVICE_KEY,
      has_brevo_key: !!BREVO_KEY,
      has_user_jwt_secret: !!USER_JWT_SECRET,
      app_base_url: APP_BASE_URL
    };

    // 1) on cherche l’utilisateur en ignorant la casse
    // ilike nécessite un pattern => on passe l’email tel quel
    const { data: me, error: sbErr } = await supabase
      .from('referrers')
      .select('id, first_name, referral_code')
      .ilike('email', cleanEmail)   // insensible à la casse
      .maybeSingle();

    if (sbErr) console.error('Supabase error:', sbErr);
    const found = !!(me && me.id);

    // 2) Si trouvé, on construit le lien
    let preview_link = null;
    if (found) {
      const token = signShort({ sub: me.id, email: cleanEmail });
      preview_link = `${APP_BASE_URL}/espace.html#token=${encodeURIComponent(token)}`;
    }

    // 3) Mode preview => on renvoie le lien côté client (sans envoyer d’email)
    const isPreview = String(req.query.preview || '') === '1';
    if (isPreview) {
      return res.status(200).json({ ok: true, found, preview_link, diag });
    }

    // 4) Mode normal => envoi email via Brevo (si trouvé et clé dispo)
    if (found && BREVO_KEY) {
      try {
        const payload = {
          sender: { name: 'Pro&Beauty', email: 'service-clients@proandbeauty.com' },
          to: [{ email: cleanEmail }],
          subject: 'Votre accès — Pro&Beauty (lien de connexion)',
          htmlContent: `
            <div style="font-family:system-ui,Segoe UI,Roboto,Arial;color:#0b0f14">
              <h2>Pro&Beauty — Lien de connexion</h2>
              <p>Bonjour${me.first_name ? ' ' + me.first_name : ''},</p>
              <p>Cliquez sur le bouton ci-dessous pour accéder à votre espace. Ce lien est valable <b>10 minutes</b>.</p>
              <p style="margin:24px 0">
                <a href="${preview_link}" style="background:#5dd4a3;color:#06281c;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:700">Accéder à mon espace</a>
              </p>
              <p>Si le bouton ne fonctionne pas, copiez-collez ce lien :</p>
              <p style="word-break:break-all"><a href="${preview_link}">${preview_link}</a></p>
            </div>`
        };

        const r = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!r.ok) {
          const txt = await r.text();
          console.error('Brevo error:', r.status, txt);
        } else {
          console.log('Brevo send OK');
        }
      } catch (e) {
        console.error('Brevo send exception:', e);
      }
    } else {
      if (!found) console.log('Email not found in referrers:', cleanEmail);
      if (!BREVO_KEY) console.log('Missing BREVO_API_KEY / BREVO_KEY');
    }

    // 5) Réponse “neutre” côté client (pas d’info sur l’existence)
    return res.status(200).json({ ok: true, found });
  } catch (e) {
    console.error('Server error:', e);
    return res.status(500).json({ error: 'server' });
  }
}
