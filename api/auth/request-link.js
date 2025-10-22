// /api/auth/request-link.js
export const config = { runtime: 'nodejs' };
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://tpwkptzlhxitllugmlho.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';
const BREVO_KEY = process.env.BREVO_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// mini-JWT court pour lien magique (10 min)
import crypto from 'crypto';
const USER_JWT_SECRET = process.env.USER_JWT_SECRET || 'dev-secret-change-me';
function signShort(payload, expSecs = 10*60) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now()/1000) + expSecs })).toString('base64url');
  const data = `${header}.${body}`;
  const sig = crypto.createHmac('sha256', USER_JWT_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export default async function handler(req, res) {
  try{
    if (req.method !== 'POST') return res.status(405).json({ error:'Method Not Allowed' });
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error:'email requis' });

    // Vérifier que l'email correspond à un commercial existant
    const { data: me, error } = await supabase
      .from('referrers')
      .select('id, first_name, last_name, referral_code')
      .eq('email', email)
      .maybeSingle();

    // Pour ne pas révéler si l'email existe ou pas : on renvoie "OK" même si introuvable.
    if (error || !me) return res.status(200).json({ ok:true });

    const token = signShort({ sub: me.id, email });

    const link = `${APP_BASE_URL.replace(/\/$/,'')}/espace.html#token=${encodeURIComponent(token)}`;

    // Envoi du mail via Brevo
    const payload = {
      sender: { name: "Pro&Beauty", email: "service-clients@proandbeauty.com" },
      to: [{ email }],
      subject: "Votre accès — Pro&Beauty (lien de connexion)",
      htmlContent: `
        <div style="font-family:system-ui,Segoe UI,Roboto,Arial;color:#0b0f14">
          <h2>Pro&Beauty — Lien de connexion</h2>
          <p>Bonjour${me.first_name ? ' '+me.first_name : ''},</p>
          <p>Cliquez sur le bouton ci-dessous pour accéder à votre espace commercial. Ce lien est valable <b>10 minutes</b>.</p>
          <p style="margin:24px 0">
            <a href="${link}" style="background:#5dd4a3;color:#06281c;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:700">Accéder à mon espace</a>
          </p>
          <p>Si le bouton ne fonctionne pas, copiez-collez ce lien dans votre navigateur :</p>
          <p style="word-break:break-all"><a href="${link}">${link}</a></p>
          <hr/>
          <p style="color:#666">Code parrain associé : <b>${me.referral_code || '-'}</b></p>
        </div>
      `
    };

    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': BREVO_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!r.ok) {
      const txt = await r.text();
      console.error('Brevo error:', r.status, txt);
      // On ne révèle pas l’échec email au client — on répond OK pour éviter phishing
    }

    return res.status(200).json({ ok:true });
  }catch(e){ console.error(e); return res.status(500).json({ error:'server' }); }
}
