// /api/admin/create-sale.js
const { ensureAdmin } = require('./_auth');
export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;
const supa = createClient(SUPABASE_URL, SERVICE_KEY);

export default async function handler(req, res) {
  if (ensureAdmin(req, res) !== true) return;
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    const {
      order_id = null,
      institute_name,
      pro_name,
      postal_code,
      amount,
      currency = 'EUR',
      referral_code,       // <- IMPORTANT
      created_at = new Date().toISOString()
    } = req.body || {};

    // validations simples
    if (!institute_name || !pro_name || !postal_code || !amount || !referral_code) {
      return res.status(400).json({ error: 'champs requis manquants' });
    }

    // 1) Trouver le vendeur par *referral_code* (pas "code")
    const { data: seller, error: eSeller } = await supa
      .from('referrers')
      .select('id, parent_id, referral_code')
      .eq('referral_code', referral_code)
      .maybeSingle();

    if (eSeller) return res.status(400).json({ error: eSeller.message });
    if (!seller) return res.status(404).json({ error: 'code parrain introuvable' });

    // 2) Insérer la vente en renseignant seller_id
    const saleToInsert = {
      order_id,
      institute_name,
      pro_name,
      postal_code,
      amount: Number(amount),
      currency,
      created_at,
      seller_id: seller.id
    };

    const { data: sale, error: eSale } = await supa
      .from('sales')
      .insert(saleToInsert)
      .select('id, amount, currency')
      .single();

    if (eSale) return res.status(400).json({ error: eSale.message });

    // 3) Insérer les commissions directement ici
    //    (adapte les % si besoin ; ATTENTION aux valeurs autorisées par ton CHECK)
    const SELLER_RATE = 0.20; // 20%
    const PARENT_RATE = 0.05; // 5%
    const rows = [{
      sale_id: sale.id,
      beneficiary_id: seller.id,
      role: 'seller',             // doit être 'seller' ou 'parent' (CHECK comm_role_chk)
      amount: +(sale.amount * SELLER_RATE).toFixed(2),
      currency: sale.currency,
      status: 'approved',         // ou 'pending'
      created_at: new Date().toISOString()
    }];

    if (seller.parent_id) {
      rows.push({
        sale_id: sale.id,
        beneficiary_id: seller.parent_id,
        role: 'parent',
        amount: +(sale.amount * PARENT_RATE).toFixed(2),
        currency: sale.currency,
        status: 'approved',
        created_at: new Date().toISOString()
      });
    }

    const { error: eComm } = await supa.from('commissions').insert(rows);
    if (eComm) return res.status(400).json({ error: eComm.message });

    return res.json({ ok: true, sale_id: sale.id });
  } catch (e) {
    console.error('create-sale fatal:', e);
    return res.status(500).json({ error: String(e.message || e) });
  }
}
