export async function handler(event) {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }
  
    try {
      const { email, first_name, referral_code } = JSON.parse(event.body || '{}');
      if (!email || !referral_code) {
        return { statusCode: 400, body: 'Missing fields (email, referral_code)' };
      }
  
      // 🔐 Clé API Brevo à définir dans Netlify → Site settings → Environment variables
      const BREVO_API_KEY = process.env.BREVO_API_KEY;
      if (!BREVO_API_KEY) {
        return { statusCode: 500, body: 'Missing BREVO_API_KEY' };
      }
  
      const payload = {
        sender: { email: 'n.perren@proandbeauty.com', name: 'Pro&Beauty' },
        to: [{ email }],
        subject: 'Votre code parrain Pro&Beauty',
        htmlContent: `<p>Bonjour ${first_name || ''},</p>
                      <p>Merci pour votre inscription au programme de parrainage.</p>
                      <p>Votre code parrain est : <strong>${referral_code}</strong></p>
                      <p>Conservez-le précieusement et partagez-le à vos clients.</p>`
      };
  
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': BREVO_API_KEY,
          'content-type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
  
      if (!res.ok) {
        const txt = await res.text();
        return { statusCode: 500, body: 'Brevo API error: ' + txt };
      }
  
      return { statusCode: 200, body: 'ok' };
    } catch (err) {
      return { statusCode: 500, body: String(err) };
    }
  }