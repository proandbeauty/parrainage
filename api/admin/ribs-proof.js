const { ensureAdmin } = require('./_auth');

export default async function handler(req, res) {
  const ok = ensureAdmin(req, res);      // ⬅️ ajoute ces 2 lignes en tête
  if (ok !== true) return;

// /api/admin/ribs-proof.js
export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_TOKEN  = process.env.ADMIN_TOKEN || '';
const BUCKET       = process.env.SUPABASE_RIB_BUCKET || 'rib-docs';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

function bad(res, msg, code=400, detail){ return res.status(code).json({ error: msg, detail }); }
function ok(res, body){ return res.status(200).json(body); }
function authed(req){
  const t = String(req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim();
  return t && t===ADMIN_TOKEN;
}

// Normalise doc_path -> clé interne au bucket
function toObjectKey(doc_path) {
  if (!doc_path) return null;
  let p = String(doc_path).trim();

  // URL complète Supabase -> ne garde que <key>
  const m = p.match(/\/object\/(?:public|sign)\/([^/]+)\/(.+)$/);
  if (m && m[1] && m[2]) return m[2];

  // Préfixes possibles
  if (p.startsWith(`${BUCKET}/`))  return p.slice(BUCKET.length+1);
  if (p.startsWith(`/${BUCKET}/`)) return p.slice(BUCKET.length+2);

  // On suppose que c'est déjà "folder/file.pdf"
  return p;
}

export default async function handler(req, res){
  try{
    if(req.method!=='GET') return bad(res,'Method Not Allowed',405);
    if(!authed(req))       return bad(res,'Unauthorized',401);

    const id = String(req.query.id||'').trim();
    if(!id) return bad(res,'id requis');

    // doc_path dans bank_accounts
    const { data: row, error } = await supabase
      .from('bank_accounts')
      .select('id, doc_path')
      .eq('id', id)
      .maybeSingle();

    if (error) return bad(res,'Erreur base de données',500, error.message||String(error));
    if (!row)  return bad(res,'RIB introuvable',404);
    if (!row.doc_path) return bad(res,'Aucun justificatif',404);

    const key = toObjectKey(row.doc_path);
    console.log('[ribs-proof] bucket=', BUCKET, 'doc_path=', row.doc_path, '→ key=', key);

    // Vérifie l’existence (liste du dossier + recherche du fichier)
    const folder = key.split('/').slice(0,-1).join('/');
    const fname  = key.split('/').pop();
    const { data: listed, error: eList } = await supabase
      .storage.from(BUCKET).list(folder || '', { search: fname });

    if (eList) return bad(res, 'Erreur listing storage', 500, eList.message||String(eList));

    const exists = Array.isArray(listed) && listed.some(o => o.name === fname);
    if (!exists) {
      return bad(res, 'Fichier introuvable dans le bucket', 404, `bucket=${BUCKET}, key=${key}`);
    }

    // URL signée (1h)
    const { data: signed, error: eSign } = await supabase
      .storage.from(BUCKET).createSignedUrl(key, 3600);

    if (eSign || !signed?.signedUrl) {
      return bad(res, 'Impossible de signer le justificatif', 500, eSign?.message || 'signedUrl missing');
    }

    return ok(res, { ok:true, url: signed.signedUrl });
  }catch(e){
    return bad(res,'Erreur serveur',500, e.message||String(e));
  }
}
