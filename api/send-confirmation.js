// /api/send-confirmation.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    // Vercel peut donner req.body déjà parsé ou comme string selon l’envoi
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch {}
    }
    const { email, first_name, referral_code } = body || {};
    if (!email || !referral_code) {
      return res.status(400).send('Missing fields (email, referral_code)');
    }

    const BREVO_API_KEY = process.env.BREVO_API_KEY;
    if (!BREVO_API_KEY) return res.status(500).send('Missing BREVO_API_KEY');

    const payload = {
      sender: { email: 'service-clients@proandbeauty.com', name: 'Pro&Beauty' },
      to: [{ email }],
      subject: 'Votre code parrain Pro&Beauty',
      htmlContent: `<p>Bonjour ${first_name || ''},</p>
                    <p>Merci pour votre inscription au programme de parrainage.</p>
                    <p>Votre code parrain est : <strong>${referral_code}</strong></p>
                    <p>Conservez-le et partagez-le à vos clients.</p>`
    };

    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!r.ok) {
      const txt = await r.text();
      return res.status(500).send('Brevo API error: ' + txt);
    }

    return res.status(200).send('ok');
  } catch (e) {
    return res.status(500).send(String(e));
  }
}
