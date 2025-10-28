// api/admin/ribs-proof.js  (CommonJS)
const { ensureAdmin } = require('./_auth');
const { createClient } = require('@supabase/supabase-js');

module.exports.config = { runtime: 'nodejs' };

const supa   = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const BUCKET = process.env.SUPABASE_RIB_BUCKET || 'rib-docs';

function toObjectKey(doc_path) {
  if (!doc_path) return null;
  let p = String(doc_path).trim();
  const m = p.match(/\/object\/(?:public|sign)\/([^/]+)\/(.+)$/);
  if (m && m[2]) return m[2];
  if (p.startsWith(`${BUCKET}/`))  return p.slice(BUCKET.length+1);
  if (p.startsWith(`/${BUCKET}/`)) return p.slice(BUCKET.length+2);
  return p;
}

module.exports = async (req, res) => {
  if (ensureAdmin(req, res) !== true) return;
  try {
    if (req.method!=='GET') return res.status(405).json({ error:'Method Not Allowed' });
    const id = String(req.query.id||'').trim();
    if (!id) return res.status(400).json({ error:'id requis' });

    const { data: row, error } = await supa.from('bank_accounts').select('id, doc_path').eq('id', id).maybeSingle();
    if (error) return res.status(500).json({ error:'Erreur base de données', detail:error.message });
    if (!row)  return res.status(404).json({ error:'RIB introuvable' });
    if (!row.doc_path) return res.status(404).json({ error:'Aucun justificatif' });

    const key = toObjectKey(row.doc_path);
    const folder = key.split('/').slice(0,-1).join('/');
    const fname  = key.split('/').pop();

    const { data: listed, error: eList } = await supa.storage.from(BUCKET).list(folder || '', { search: fname });
    if (eList) return res.status(500).json({ error:'Erreur listing storage', detail:eList.message });

    const exists = Array.isArray(listed) && listed.some(o => o.name === fname);
    if (!exists) return res.status(404).json({ error:'Fichier introuvable', detail:`bucket=${BUCKET}, key=${key}` });

    const { data: signed, error: eSign } = await supa.storage.from(BUCKET).createSignedUrl(key, 3600);
    if (eSign || !signed?.signedUrl) return res.status(500).json({ error:'Impossible de signer', detail:eSign?.message || 'signedUrl missing' });

    return res.status(200).json({ ok:true, url:signed.signedUrl });
  } catch (e) {
    return res.status(500).json({ error:'Erreur serveur', detail:String(e.message||e) });
  }
};
