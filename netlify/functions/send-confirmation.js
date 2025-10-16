export async function handler(event) {
    try {
      if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
      }
  
      const { email, first_name, referral_code } = JSON.parse(event.body || '{}');
      if (!email || !referral_code) {
        return { statusCode: 400, body: 'Missing fields (email, referral_code)' };
      }
  
      const MJ_API_KEY = process.env.MAILJET_API_KEY;     // à définir dans Netlify
      const MJ_API_SECRET = process.env.MAILJET_API_SECRET; // à définir dans Netlify
      if (!MJ_API_KEY || !MJ_API_SECRET) {
        return { statusCode: 500, body: 'Missing MAILJET_API_KEY or MAILJET_API_SECRET' };
      }
  
      const auth = Buffer.from(`${MJ_API_KEY}:${MJ_API_SECRET}`).toString('base64');
  
      const payload = {
        Messages: [
          {
            From: { Email: 'service-clients@proandbeauty.com', Name: 'Pro&Beauty' },
            To: [{ Email: email }],
            Subject: 'Votre code parrain Pro&Beauty',
            HTMLPart: `<p>Bonjour ${first_name || ''},</p>
                       <p>Merci pour votre inscription au programme de parrainage.</p>
                       <p>Votre code parrain est : <strong>${referral_code}</strong></p>
                       <p>Conservez-le précieusement et partagez‑le à vos clients.</p>`,
            Headers: { 'Reply-To': 'service-clients@proandbeauty.com' }
          }
        ]
      };
  
      const res = await fetch('https://api.mailjet.com/v3.1/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${auth}`
        },
        body: JSON.stringify(payload)
      });
  
      if (!res.ok) {
        const txt = await res.text();
        return { statusCode: 500, body: `Mailjet API error: ${txt}` };
      }
  
      return { statusCode: 200, body: 'ok' };
    } catch (e) {
      return { statusCode: 500, body: String(e) };
    }
  }
