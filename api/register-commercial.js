// /api/register-commercial.js
export const config = { runtime: 'nodejs18.x' };

import { createClient } from '@supabase/supabase-js';

/* ------------------------------ CONFIG ------------------------------ */

// URL de ton projet Supabase.
// Si tu préfères, tu peux la mettre dans une variable Vercel SUPABASE_URL.
const SUPABASE_URL = 'https://tpwkptzlhxitllugmlho.supabase.co';

// Clé service_role (NE JAMAIS la mettre côté client !)
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Lecture clé Brevo (accepte 2 noms pour éviter les confusions)
function getBrevoKey() {
  return process.env.BREVO_KEY || process.env.BREVO_API_KEY || '';
}

// Adresse expéditeur (doit être validée chez Brevo)
const DEFAULT_FROM_EMAIL = 'service-clients@proandbeauty.com';
const DEFAULT_FROM_NAME = 'Pro&Beauty';

/* ---------------------------- OUTILS MAIL --------------------------- */

async function sendBrevoEmail({ to, subject, html, fromEmail = DEFAULT_FROM_EMAIL, fromName = DEFAULT_FROM_NAME }) {
  const apiKey = getBrevoKey();
  if (!apiKey) {
    throw new Error('Brevo API key missing (set BREVO_KEY or BREVO_API_KEY in Vercel).');
  }

  const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'content-type': 'application/json',
      'api-key': apiKey
    },
    body: JSON.stringify({
      sender: { email: fromEmail, name: fromName },
      to: [{ email: to }],
      subject,
      htmlContent: html
    })
  });

  const text = await resp.text(); // on lit toujours le corps pour diagnostiquer
  if (!resp.ok) {
    // On log côté serveur pour les diagnostics
    console.error('Brevo ERROR:', resp.status, text);
    throw new Error(`Brevo ${resp.status}: ${text}`);
  } else {
    console.log('Brevo OK:', text);
  }
}

/* -------------------------- OUTILS DIVERS --------------------------- */

function slug2(s) {
  return (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
}
function rand4() {
  return Math.floor(Math.random() * 10_000).toString().padStart(4, '0');
}
function checksum(str) {
  let sum = 0;
  for (const c of str) sum += c.charCodeAt(0);
  return String(sum % 97).padStart(2, '0');
}
function makeReferralCode(first, last) {
  const p = slug2(first).slice(0, 2) || 'XX';
  const n = slug2(last).slice(0, 2) || 'YY';
  const base = `${p}${n}${rand4()}`;
  return `PNB-${base}${checksum(base)}`;
}

/* ----------------------------- SUPABASE ----------------------------- */

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Supabase configuration missing. Check SUPABASE_URL and SUPABASE_SERVICE_KEY.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/* ------------------------------ HANDLER ----------------------------- */

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { first_name, last_name, email, phone, source_brand, sponsor } = req.body || {};

    // Validation simple
    if (!first_name || !last_name || !email || !phone) {
      return res.status(400).json({ error: 'Champs requis: first_name, last_name, email, phone' });
    }

    // Chercher un éventuel parent via le code sponsor
    let parent_id = null;
    if (sponsor) {
      const { data: parent, error: pErr } = await supabase
        .from('referrers')
        .select('id, referral_code')
        .eq('referral_code', sponsor)
        .maybeSingle();
      if (pErr) {
        console.warn('Lookup sponsor error:', pErr.message);
      }
      if (parent?.id) parent_id = parent.id;
    }

    // Générer un code unique (réessaie si collision)
    let referral_code = null;
    for (let i = 0; i < 6; i++) {
      const candidate = makeReferralCode(first_name, last_name);
      const { data: exists } = await supabase
        .from('referrers')
        .select('id')
        .eq('referral_code', candidate)
        .maybeSingle();
      if (!exists?.id) {
        referral_code = candidate;
        break;
      }
    }
    if (!referral_code) {
      return res.status(500).json({ error: 'Impossible de générer un code unique' });
    }

    // Prépare la charge utile (n'ajoute parent_id que s'il existe)
    const payload = {
      first_name,
      last_name,
      email,
      phone,
      source_brand: source_brand || null,
      referral_code
    };
    if (parent_id) payload.parent_id = parent_id;

    // Insertion du commercial
    const { error: insertError } = await supabase.from('referrers').insert([payload]);

    if (insertError) {
      console.error('Supabase insert error:', insertError);
      return res.status(500).json({ error: insertError.message || 'Erreur Supabase' });
    }

    // Envoi des emails (on ne bloque pas l'inscription si l'email échoue)
    try {
      // A) Email au nouveau commercial
      await sendBrevoEmail({
        to: email,
        subject: 'Bienvenue — Votre code parrain Pro&Beauty',
        html: `
          <p>Bonjour ${first_name},</p>
          <p>Bienvenue dans le programme Pro&Beauty. Voici votre code parrain :</p>
          <p style="font-size:18px;"><b>${referral_code}</b></p>
          <p>Partagez-le à vos contacts. Chaque vente apportera une commission selon le barème en vigueur.</p>
          <p>À très vite,<br/>Pro&Beauty</p>
        `
      });

      // B) Email au parrain (si présent)
      if (parent_id) {
        const { data: parent2 } = await supabase
          .from('referrers')
          .select('email, first_name')
          .eq('id', parent_id)
          .single();
        if (parent2?.email) {
          await sendBrevoEmail({
            to: parent2.email,
            subject: 'Bonne nouvelle — Vous avez un nouveau filleul',
            html: `
              <p>Bonjour ${parent2.first_name || ''},</p>
              <p>Un nouveau commercial s'est inscrit avec votre code parrain :</p>
              <ul>
                <li>Nom : ${first_name} ${last_name}</li>
                <li>Email : ${email}</li>
                <li>Code attribué : <b>${referral_code}</b></li>
              </ul>
              <p>Vous toucherez désormais des commissions sur ses ventes.</p>
              <p>Pro&Beauty</p>
            `
          });
        }
      }
      // si tout va bien, pas de warning
      return res.status(200).json({ ok: true, referral_code });

    } catch (mailErr) {
      console.error('Email send failed:', mailErr.message);
      // on renvoie néanmoins ok pour ne pas bloquer l’inscription,
      // mais on expose un warning pour que tu voies la cause côté client (Network → Response)
      return res.status(200).json({ ok: true, referral_code, email_warning: mailErr.message });
    }

  } catch (e) {
    console.error('register-commercial fatal error:', e);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}
