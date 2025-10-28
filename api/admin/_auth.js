// /api/admin/_auth.js  (PAS une route HTTP)
// Ne mets surtout pas de `export default` ici.

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
    if (res) return res.status(500).json({ error: 'Server misconfigured (ADMIN_TOKEN missing)' });
    throw new Error('ADMIN_TOKEN missing');
  }
  if (!given || given !== expected) {
    if (res) return res.status(401).json({ error: 'Unauthorized' });
    throw new Error('Unauthorized');
  }
  return true;
}

module.exports = { readAdminToken, ensureAdmin };
