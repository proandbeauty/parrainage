// /api/admin/ribs-proof.js
export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL   = process.env.SUPABASE_URL;
const SERVICE_KEY    = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_TOKEN    = process.env.ADMIN_TOKEN || '';
const BUCKET         = 'bank_docs'; // ton bucket de justificatifs

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

function unauthorized(res){ return res.status(401).json({ error: 'unauthorized' }); }
function bad(res, msg, code=400, detail){ return res.status(code).json({ error: msg, detail }); }

function checkAuth(req) {
  const h = String(req.headers.authorization || '');
  const tok = h.replace(/^Bearer\s+/i,'').trim();
  return tok && tok === ADMIN_TOKEN;
}

// normalise un chemin vers la clé du bucket (enlève le prefix bank_docs/ et éventuelle URL complète)
function toObjectKey(doc_path) {
  if (!doc_path) return null;
  let p = String(doc_path);
  // si URL complète de storage, on garde la partie après /object/public/BUCKET/ ou /object/sign/BUCKET/
  const m = p.match(/\/object\/(?:public|sign)\/([^/]+)\/(.+)$/);
  if (m && m[1]) {
    // m[1] = bucket, m[2] = key
    if (m[1] === BUCKET) return m[2];
  }
  // si commence par bank_docs/
  if (p.startsWith(BUCKET + '/')) return p.slice(BUCKET.length + 1);
  // si commence par /bank_docs/
  if (p.startsWith('/' + BUCKET + '/')) return p.slice(BUCKET.length + 2);
  // sinon on suppose que c'est déjà la clé interne
  return p;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return bad(res, 'Method Not Allowed', 405);
    if (!checkAuth(req))       return unauthorized(res);

    const id = String(req.query.id || '').trim();
    if (!id) return bad(res, 'id requis');

    // récupère chemin du justificatif depuis bank_accounts
    const { data: row, error } = await supabase
      .from('bank_accounts')
      .select('id, doc_path')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('[ribs-proof] select error:', error);
      return bad(res, 'Erreur base de données');
    }
    if (!row) return bad(res, 'RIB introuvable', 404);
    if (!row.doc_path) return bad(res, 'Aucun justificatif', 404);

    const objectKey = toObjectKey(row.doc_path);
    if (!objectKey) return bad(res, 'Chemin justificatif invalide');

    // crée une URL signée valable 1h
    const { data: signed, error: e2 } = await supabase
      .storage
      .from(BUCKET)
      .createSignedUrl(objectKey, 60 * 60);

    if (e2 || !signed?.signedUrl) {
      console.error('[ribs-proof] signed url error:', e2);
      return bad(res, 'Impossible de signer le justificatif');
    }

    return res.status(200).json({ ok: true, url: signed.signedUrl });
  } catch (e) {
    console.error('[ribs-proof] server error:', e);
    return bad(res, 'Erreur serveur', 500, e.message || String(e));
  }
}
