const { ensureAdmin } = require('./_auth');

export default async function handler(req, res) {
  const ok = ensureAdmin(req, res);      // ⬅️ ajoute ces 2 lignes en tête
  if (ok !== true) return;

// api/admin/_auth.js
function getHeader(req, key) {
    // Edge runtime (Request): req.headers.get()
    if (req?.headers?.get) return req.headers.get(key) || req.headers.get(key.toLowerCase());
    // Node runtime (Next/Vercel API): req.headers['x-...']
    if (req?.headers) return req.headers[key] || req.headers[key.toLowerCase()];
    return undefined;
  }
  
  function readAdminToken(req) {
    const h = getHeader(req, 'x-admin-token');
    const auth = getHeader(req, 'authorization') || '';
    const bearer = /^Bearer\s+(.+)$/i.test(auth) ? auth.replace(/^Bearer\s+/i, '') : null;
    return h || bearer || null;
  }
  
  function ensureAdmin(req, res) {
    const given = readAdminToken(req);
    const expected = process.env.ADMIN_TOKEN || process.env.NEXT_PUBLIC_ADMIN_TOKEN;
  
    if (!expected) {
      console.error('[ADMIN] Missing env ADMIN_TOKEN');
      if (res) return res.status(500).json({ error: 'Server misconfigured' });
      throw new Error('ADMIN_TOKEN missing');
    }
  
    if (!given || given !== expected) {
      if (res) return res.status(401).json({ error: 'Unauthorized' });
      throw new Error('Unauthorized');
    }
    return true;
  }
  
  module.exports = { readAdminToken, ensureAdmin };
  