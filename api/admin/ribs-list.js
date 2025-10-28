export const config = { runtime: 'nodejs' };
import { createClient } from '@supabase/supabase-js';
import { ensureAdmin } from './_auth';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;
const supabase     = createClient(SUPABASE_URL, SERVICE_KEY);

export default async function handler(req, res) {
  const ok = ensureAdmin(req, res);
  if (ok !== true) return;

  try {
    if (req.method !== 'GET') return res.status(405).json({ error:'Method Not Allowed' });
    if (!SUPABASE_URL || !SERVICE_KEY) return res.status(500).json({ error:'Server not configured' });

    const status = String(req.query.status||'all').toLowerCase();
    const limit  = Math.min(parseInt(req.query.limit||'50',10), 200);
    const offset = parseInt(req.query.offset||'0',10);
    const search = String(req.query.search||'').trim();
    const sortBy = (req.query.sort_by||'created_at').toString();
    const asc    = String(req.query.order||'desc').toLowerCase()==='asc';

    let q = supabase
      .from('bank_accounts')
      .select(`
        id, status, created_at, iban, bic, holder_name, doc_path,
        referrer:referrers ( first_name, last_name, email, referral_code )
      `)
      .order(sortBy==='holder_name'?'holder_name':'created_at', {ascending:asc})
      .limit(1000);

    if (status && status!=='all') q = q.eq('status', status);

    const { data, error } = await q;
    if (error) return res.status(500).json({ error:'DB error (ribs)', detail:error.message });

    let rows = Array.isArray(data)?data:[];
    if (search) {
      const term = search.toLowerCase();
      rows = rows.filter(r=>{
        const ref=r.referrer||{};
        return (
          String(ref.first_name||'').toLowerCase().includes(term) ||
          String(ref.last_name ||'').toLowerCase().includes(term) ||
          String(ref.email     ||'').toLowerCase().includes(term) ||
          String(ref.referral_code||'').toLowerCase().includes(term) ||
          String(r.holder_name||'').toLowerCase().includes(term) ||
          String(r.iban||'').toLowerCase().includes(term)
        );
      });
    }

    const sliced = rows.slice(offset, offset+limit);
    const nextOffset = offset + sliced.length;

    if (String(req.query.format||'').toLowerCase()==='csv') {
      const head=['id','status','created_at','titulaire','iban','bic','email','code'];
      const lines=[head.join(';')];
      for (const r of rows) {
        const ref=r.referrer||{};
        lines.push([r.id,r.status,r.created_at||'',r.holder_name||'',r.iban||'',r.bic||'',ref.email||'',ref.referral_code||'']
          .map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(';'));
      }
      res.setHeader('Content-Type','text/csv; charset=utf-8');
      res.setHeader('Content-Disposition','attachment; filename="export-ribs.csv"');
      return res.status(200).send(lines.join('\n'));
    }

    return res.status(200).json({ items:sliced, nextOffset });
  } catch (e) {
    return res.status(500).json({ error:'Server error (ribs)', detail:String(e?.message||e) });
  }
}
