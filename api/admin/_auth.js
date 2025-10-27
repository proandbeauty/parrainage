// api/admin/_auth.js (CommonJS)
function getHeader(req, key) {
    if (req?.headers?.get) return req.headers.get(key) || req.headers.get(key.toLowerCase());
    if (req?.headers)      return req.headers[key]     || req.headers[key.toLowerCase()];
    return undefined;
  }
  
  function readAdminToken(req) {
    const h = getHeader(req, 'x-admin-token');
    const auth = getHeader(req, 'authorization') || '';
    const bearer = /^Bearer\s+(.+)$/i.test(auth) ? auth.replace(/^Bearer\s+/i, '') : null;
    return h || bearer || null;
  }
  
  function ensureAdmin(req, res) {
    const given    = readAdminToken(req);
    const expected = process.env.ADMIN_TOKEN || process.env.NEXT_PUBLIC_ADMIN_TOKEN;
    if (!expected) {
      console.error('[ADMIN] Missing env ADMIN_TOKEN');
      return res ? res.status(500).json({ error: 'Server misconfigured' }) : false;
    }
    if (!given || given !== expected) {
      return res ? res.status(401).json({ error: 'Unauthorized' }) : false;
    }
    return true;
  }
  
  module.exports = { readAdminToken, ensureAdmin };
  