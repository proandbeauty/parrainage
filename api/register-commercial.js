import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://tpwkptzlhxitllugmlho.supabase.co',
  process.env.SUPABASE_SERVICE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' })
  }

  try {
    const { first_name, last_name, email, phone, source_brand, sponsor } = req.body

    if (!first_name || !last_name || !email || !phone) {
      return res.status(400).json({ error: 'Champs obligatoires manquants' })
    }

    // Génération du code unique
    function slug2(s) {
      return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z]/g, '')
    }
    function rand4() {
      return Math.floor(Math.random() * 10_000).toString().padStart(4, '0')
    }
    function checksum(str) {
      let sum = 0
      for (const c of str) sum += c.charCodeAt(0)
      return String(sum % 97).padStart(2, '0')
    }
    function makeReferralCode(first, last) {
      const p = slug2(first).slice(0, 2) || 'XX'
      const n = slug2(last).slice(0, 2) || 'YY'
      const base = `${p}${n}${rand4()}`
      return `PNB-${base}${checksum(base)}`
    }

    const referral_code = makeReferralCode(first_name, last_name)

    // Chercher l'ID du parrain (si code fourni)
    let parent_id = null
    if (sponsor) {
      const { data: sponsorData } = await supabase
        .from('referrers')
        .select('id')
        .eq('referral_code', sponsor)
        .maybeSingle()
      if (sponsorData) parent_id = sponsorData.id
    }

    // Insertion du nouveau commercial
    const { error: insertError } = await supabase.from('referrers').insert([
      {
        first_name,
        last_name,
        email,
        phone,
        source_brand,
        referral_code,
        parent_id
      }
    ])

    if (insertError) {
        console.error('Supabase insert error:', insertError)
        return res.status(500).json({ error: insertError.message })
      }

    // Envoi d’un email via Brevo (optionnel)
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': process.env.BREVO_KEY
      },
      body: JSON.stringify({
        sender: { name: 'Pro&Beauty', email: 'service-clients@proandbeauty.com' },
        to: [{ email }],
        subject: 'Bienvenue dans le programme de parrainage Pro&Beauty',
        htmlContent: `<p>Bonjour ${first_name},</p>
                      <p>Merci pour votre inscription au programme de parrainage.</p>
                      <p>Votre code parrain est : <strong>${referral_code}</strong></p>
                      <p>Conservez-le et partagez-le à vos clients.</p>`
      })
    }).catch(err => console.warn('Email non envoyé', err))

    return res.status(200).json({ ok: true, referral_code })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Erreur interne' })
  }
}
