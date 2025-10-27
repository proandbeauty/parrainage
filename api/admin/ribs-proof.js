// api/admin/ribs-proof.js
const { ensureAdmin } = require('./_auth');
const { createClient } = require('@supabase/supabase-js');

module.exports.config = { runtime: 'nodejs' };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;
const BUCKET       = process.env.SUPABASE_RIB_BUCKET || 'rib-docs';
const supabase     = createClient(SUPABASE_URL, SERVICE_KEY);

function bad(res, msg, code=400, detail){ return res.status(code).json({ error: msg, detail }); }
function ok(res, body){ return res.status(200).json(body); }

function toObjectKey(doc_path) {
  if (!doc_path) return null;
  let p = String(doc_path).trim();
  const m = p.match(/\/object\/(?:public|sign)\/([^/]+)\/(.+)$/);
  if (m && m[1] && m[2]) return m[2];
  if (p.startsWith(`${BUCKET}/`))  return p.slice(BUCKET.length+1);
  if (p.startsWith(`/${BUCKET}/`)) return p.slice(BUCKET.length+2);
  return p;
}

module.exports = async (req, res) => {
  try{
    if(req.method!=='GET') return bad(res,'Method Not Allowed',405);
    if(ensureAdmin(req,res)!==true) return;

    const id = String(req.query.id||'').trim();
    if(!id) return bad(res,'id requis');

    const { data: row, error } = await supabase
      .from('bank_accounts')
      .select('id, doc_path')
      .eq('id', id)
      .maybeSingle();

    if (error) return bad(res,'Erreur base de données',500, error.message||String(error));
    if (!row)  return bad(res,'RIB introuvable',404);
    if (!row.doc_path) return bad(res,'Aucun justificatif',404);

    const key = toObjectKey(row.doc_path);
    const folder = key.split('/').slice(0,-1).join('/');
    const fname  = key.split('/').pop();

    const { data: listed, error: eList } = await supabase
      .storage.from(BUCKET).list(folder || '', { search: fname });
    if (eList) return bad(res, 'Erreur listing storage', 500, eList.message||String(eList));

    const exists = Array.isArray(listed) && listed.some(o => o.name === fname);
    if (!exists) return bad(res, 'Fichier introuvable dans le bucket', 404, `bucket=${BUCKET}, key=${key}`);

    const { data: signed, error: eSign } = await supabase
      .storage.from(BUCKET).createSignedUrl(key, 3600);
    if (eSign || !signed?.signedUrl) return bad(res, 'Impossible de signer le justificatif', 500, eSign?.message || 'signedUrl missing');

    return ok(res, { ok:true, url: signed.signedUrl });
  }catch(e){
    return bad(res,'Erreur serveur',500, e.message||String(e));
  }
};
