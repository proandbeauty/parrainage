// api/me/save-rib.js
import { requireAuth, send } from './_auth.js';

export const config = { runtime: 'nodejs' };

function validIBAN(iban) {
  const s = String(iban || '').replace(/\s+/g, '').toUpperCase();
  // IBAN générique: 2 lettres + 2 chiffres + 11-30 alphanum
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  // check mod-97 (simple)
  const moved = s.slice(4) + s.slice(0, 4);
  const expanded = moved.replace(/[A-Z]/g, ch => (ch.charCodeAt(0) - 55).toString());
  let total = '';
  for (let i = 0; i < expanded.length; i++) {
    total = (total + expanded[i]);
    const num = Number(total);
    if (num > 1e7) total = String(num % 97);
  }
  return Number(total) % 97 === 1;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

    const { supabase, user } = await requireAuth(req);
    const { titulaire, iban, bic, banque, justificatif_path, rgpd_consent } = req.body || {};

    if (!rgpd_consent) return send(res, 400, { error: 'Consentement RGPD requis' });
    if (!titulaire || !iban || !justificatif_path) {
      return send(res, 400, { error: 'Champs requis: titulaire, IBAN, justificatif' });
    }
    if (!validIBAN(iban)) return send(res, 400, { error: 'IBAN invalide' });

    // Upsert (un seul enregistrement par user)
    const { data: existing } = await supabase
      .from('rib')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!existing) {
      const { error } = await supabase.from('rib').insert([{
        user_id: user.id,
        titulaire,
        iban,
        bic: bic || null,
        banque: banque || null,
        justificatif_path,
        rgpd_consent: true,
        status: 'pending'
      }]);
      if (error) return send(res, 500, { error: 'Création RIB impossible' });
    } else {
      const { error } = await supabase.from('rib').update({
        titulaire,
        iban,
        bic: bic || null,
        banque: banque || null,
        justificatif_path,
        rgpd_consent: true
        // status laissé tel quel; tu pourras le changer côté admin
      }).eq('user_id', user.id);
      if (error) return send(res, 500, { error: 'Mise à jour RIB impossible' });
    }

    return send(res, 200, { ok: true });
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: 'Server error' });
  }
}
