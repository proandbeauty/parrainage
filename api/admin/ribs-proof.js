// /api/admin/ribs-proof.js
export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_TOKEN  = process.env.ADMIN_TOKEN || '';
const BUCKET       = process.env.SUPABASE_RIB_BUCKET || 'rib-docs'; // ✅ ton bucket

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

function bad(res, msg, code=400, detail){ return res.status(code).json({ error: msg, detail }); }
function ok(res, body){ return res.status(200).json(body); }
function authed(req){
  const t = String(req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim();
  return t && t===ADMIN_TOKEN;
}

// Rend une clé interne bucket à partir de doc_path (gère URL complète, /rib-docs/, etc.)
function toObjectKey(doc_path) {
  if (!doc_path) return null;
  let p = String(doc_path).trim();

  // URL complète Supabase -> extrait "<bucket>/<key>" puis renvoie seulement "<key>"
  const m = p.match(/\/object\/(?:public|sign)\/([^/]+)\/(.+)$/);
  if (m && m[1] && m[2]) return m[2];

  if (p.startsWith('rib-docs/')) return p.slice('rib-docs/'.length);
  if (p.startsWith('/rib-docs/')) return p.slice('/rib-docs/'.length);

  // on considère que c'est déjà une clé interne ("dossier/id/filename.pdf")
  return p;
}

export default async function handler(req, res){
  try{
    if(req.method!=='GET') return bad(res,'Method Not Allowed',405);
    if(!authed(req))       return bad(res,'Unauthorized',401);

    const id = String(req.query.id||'').trim();
    if(!id) return bad(res,'id requis');

    const { data: row, error } = await supabase
      .from('bank_accounts')
      .select('id, doc_path')
      .eq('id', id)
      .maybeSingle();

    if (error) return bad(res,'Erreur base de données',500, error.message || String(error));
    if (!row)  return bad(res,'RIB introuvable',404);
    if (!row.doc_path) return bad(res,'Aucun justificatif',404);

    const objectKey = toObjectKey(row.doc_path);

    // Debug utile dans Vercel logs
    console.log('[ribs-proof] bucket=', BUCKET, 'doc_path=', row.doc_path, '→ key=', objectKey);

    // 🔍 (1) Vérifie d’abord que l’objet existe
    const { data: stat, error: eStat } = await supabase
      .storage.from(BUCKET).list(objectKey.split('/').slice(0,-1).join('/') || '', { search: objectKey.split('/').pop() });

    if (eStat) {
      return bad(res, 'Erreur listing storage', 500, eStat.message || String(eStat));
    }
    const exists = Array.isArray(stat) && stat.some(o => o.name === objectKey.split('/').pop());
    if (!exists) {
      return bad(res, 'Fichier introuvable dans le bucket', 404, `bucket=${BUCKET}, key=${objectKey}`);
    }

    // 🔐 (2) Crée l’URL signée (1h)
    const { data: signed, error: eSign } = await supabase
      .storage.from(BUCKET).createSignedUrl(objectKey, 60*60);

    if (eSign || !signed?.signedUrl) {
      return bad(res, 'Impossible de signer le justificatif', 500, eSign?.message || 'signedUrl missing');
    }

    return ok(res, { ok:true, url: signed.signedUrl });
  }catch(e){
    return bad(res,'Erreur serveur',500, e.message || String(e));
  }
}
