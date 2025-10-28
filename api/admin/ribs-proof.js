export const config = { runtime: 'nodejs' };
import { createClient } from '@supabase/supabase-js';
import { ensureAdmin } from './_auth';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;
const BUCKET       = process.env.SUPABASE_RIB_BUCKET || 'rib-docs';
const supabase     = createClient(SUPABASE_URL, SERVICE_KEY);

function toObjectKey(doc_path) {
  if (!doc_path) return null;
  let p = String(doc_path).trim();
  const m = p.match(/\/object\/(?:public|sign)\/([^/]+)\/(.+)$/);
  if (m && m[1] && m[2]) return m[2];
  if (p.startsWith(`${BUCKET}/`))  return p.slice(BUCKET.length+1);
  if (p.startsWith(`/${BUCKET}/`)) return p.slice(BUCKET.length+2);
  return p;
}

export default async function handler(req, res) {
  const ok = ensureAdmin(req, res);
  if (ok !== true) return;

  try {
    if (req.method !== 'GET') return res.status(405).json({ error:'Method Not Allowed' });

    const id = String(req.query.id||'').trim();
    if (!id) return res.status(400).json({ error:'id requis' });

    const { data: row, error } = await supabase
      .from('bank_accounts')
      .select('id, doc_path')
      .eq('id', id)
      .maybeSingle();

    if (error) return res.status(500).json({ error:'DB error', detail:error.message });
    if (!row)  return res.status(404).json({ error:'RIB introuvable' });
    if (!row.doc_path) return res.status(404).json({ error:'Aucun justificatif' });

    const key = toObjectKey(row.doc_path);
    const folder = key.split('/').slice(0,-1).join('/');
    const fname  = key.split('/').pop();

    const { data: listed, error: eList } = await supabase
      .storage.from(BUCKET).list(folder || '', { search: fname });

    if (eList) return res.status(500).json({ error:'Erreur listing storage', detail:eList.message });

    const exists = Array.isArray(listed) && listed.some(o => o.name === fname);
    if (!exists) return res.status(404).json({ error:'Fichier introuvable dans le bucket' });

    const { data: signed, error: eSign } = await supabase
      .storage.from(BUCKET).createSignedUrl(key, 3600);

    if (eSign || !signed?.signedUrl) {
      return res.status(500).json({ error:'Impossible de signer', detail:eSign?.message || 'signedUrl missing' });
    }
    return res.status(200).json({ ok:true, url: signed.signedUrl });
  } catch (e) {
    return res.status(500).json({ error:'Server error (ribs-proof)', detail:String(e?.message||e) });
  }
}
