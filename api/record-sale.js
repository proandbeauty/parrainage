// /api/record-sale.js
export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://tpwkptzlhxitllugmlho.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// --- Brevo (Sendinblue)
function getBrevoKey() {
  return process.env.BREVO_KEY || process.env.BREVO_API_KEY || '';
}
async function sendBrevoEmail({
  to,
  subject,
  html,
  fromEmail = 'service-clients@proandbeauty.com',
  fromName = 'Pro&Beauty',
}) {
  const apiKey = getBrevoKey();
  if (!apiKey) throw new Error('Brevo key missing');
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify({
      sender: { email: fromEmail, name: fromName },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });
  const text = await r.text();
  if (!r.ok) {
    console.error('Brevo ERROR:', r.status, text);
    throw new Error(text);
  }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/**
 * POST /api/record-sale
 * body: {
 *   seller_code?: string,   // PNB-...
 *   seller_email?: string,  // si pas de code
 *   amount: number,         // ex: 99.90
 *   currency?: 'EUR',
 *   order_id?: string,      // id facture/paiement
 *   buyer_email?: string
 * }
 */
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST')
      return res.status(405).json({ error: 'Method Not Allowed' });

    const {
      seller_code,
      seller_email,
      amount,
      currency = 'EUR',
      order_id = null,
      buyer_email = null,
    } = req.body || {};

    if (!amount || (!seller_code && !seller_email)) {
      return res
        .status(400)
        .json({ error: 'amount + (seller_code OU seller_email) requis' });
    }

    // 1) Trouver le vendeur
    let seller;
    if (seller_code) {
      const { data, error } = await supabase
        .from('referrers')
        .select('id,email,first_name,parent_id')
        .eq('referral_code', seller_code)
        .maybeSingle();
      if (error || !data) return res.status(404).json({ error: 'seller_code inconnu' });
      seller = data;
    } else {
      const { data, error } = await supabase
        .from('referrers')
        .select('id,email,first_name,parent_id')
        .eq('email', seller_email)
        .maybeSingle();
      if (error || !data) return res.status(404).json({ error: 'seller_email inconnu' });
      seller = data;
    }

    // 2) Lire les barèmes (settings)
    const { data: set } = await supabase
      .from('settings')
      .select('*')
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();
    const seller_amount = set?.seller_amount ?? 20;
    const child_amount = set?.child_amount ?? 25;
    const parent_amount = set?.parent_amount ?? 5;

    // 3) Créer la vente
    const { data: sale, error: saleErr } = await supabase
      .from('sales')
      .insert([{ seller_id: seller.id, amount, currency, order_id, buyer_email }])
      .select('*')
      .single();
    if (saleErr)
      return res
        .status(500)
        .json({ error: 'Erreur création vente', detail: saleErr.message });

    // 4) Créer les commissions
    const rows = [];
    const hasParent = !!seller.parent_id;
    rows.push({
      sale_id: sale.id,
      beneficiary_id: seller.id,
      role: 'seller',
      amount: hasParent ? child_amount : seller_amount,
      currency,
    });
    if (hasParent) {
      rows.push({
        sale_id: sale.id,
        beneficiary_id: seller.parent_id,
        role: 'parent',
        amount: parent_amount,
        currency,
      });
    }
    const { error: comErr } = await supabase.from('commissions').insert(rows);
    if (comErr)
      return res
        .status(500)
        .json({ error: 'Erreur création commissions', detail: comErr.message });

    // 5) Emails d’événements (non bloquants)
    try {
      // vendeur
      await sendBrevoEmail({
        to: seller.email,
        subject: 'Nouvelle vente enregistrée',
        html: `
          <p>Bonjour ${seller.first_name || ''},</p>
          <p>Nous avons enregistré une vente de <b>${Number(amount).toFixed(2)} ${currency}</b>.</p>
          <p>Votre commission : <b>${Number(hasParent ? child_amount : seller_amount).toFixed(2)} ${currency}</b> (statut: en attente).</p>
          <p>Réf. commande : ${order_id || '-'}</p>
          <p>Pro&Beauty</p>
        `,
      });

      // parrain éventuel
      if (hasParent) {
        const { data: parrain } = await supabase
          .from('referrers')
          .select('email,first_name')
          .eq('id', seller.parent_id)
          .single();
        if (parrain?.email) {
          await sendBrevoEmail({
            to: parrain.email,
            subject: 'Commission filleul enregistrée',
            html: `
              <p>Bonjour ${parrain.first_name || ''},</p>
              <p>Votre filleul a réalisé une vente de <b>${Number(amount).toFixed(2)} ${currency}</b>.</p>
              <p>Votre commission : <b>${Number(parent_amount).toFixed(2)} ${currency}</b> (statut: en attente).</p>
              <p>Pro&Beauty</p>
            `,
          });
        }
      }
    } catch (mailErr) {
      console.error('Emails vente KO:', mailErr.message);
      return res
        .status(200)
        .json({ ok: true, sale_id: sale.id, email_warning: mailErr.message });
    }

    // 6) OK
    return res.status(200).json({ ok: true, sale_id: sale.id });
  } catch (e) {
    console.error('record-sale fatal:', e);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}
