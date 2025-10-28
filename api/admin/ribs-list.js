// api/admin/ribs-list.js  (CommonJS)
const { ensureAdmin } = require('./_auth');
const { createClient } = require('@supabase/supabase-js');

module.exports.config = { runtime: 'nodejs' };

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function csvEscape(v){ return `"${String(v??'').replace(/"/g,'""')}"`; }

module.exports = async (req, res) => {
  if (ensureAdmin(req, res) !== true) return;

  try {
    const status = String(req.query.status||'all').toLowerCase();
    const limit  = Math.min(parseInt(req.query.limit||'50',10), 200);
    const offset = parseInt(req.query.offset||'0',10);
    const search = String(req.query.search||'').trim();
    const sortBy = (req.query.sort_by||'created_at').toString();
    const asc    = String(req.query.order||'desc').toLowerCase()==='asc';

    let q = supa
      .from('bank_accounts')
      .select(`
        id, status, created_at, iban, bic, holder_name, doc_path,
        referrer:referrers ( first_name, last_name, email, referral_code )
      `)
      .order(sortBy==='holder_name'?'holder_name':'created_at', { ascending:asc })
      .limit(1000);

    if (status && status!=='all') q = q.eq('status', status);

    const { data, error } = await q;
    if (error) return res.status(500).json({ error:'Erreur base de données (RIB).', detail:error.message });

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

    // Export CSV ?
    if (String(req.query.format||'').toLowerCase()==='csv') {
      const head=['id','status','created_at','titulaire','iban','bic','email','code'];
      const lines=[head.join(';')];
      for (const r of rows) {
        const ref=r.referrer||{};
        lines.push([r.id,r.status,r.created_at||'',r.holder_name||'',r.iban||'',r.bic||'',ref.email||'',ref.referral_code||'']
          .map(csvEscape).join(';'));
      }
      res.setHeader('Content-Type','text/csv; charset=utf-8');
      res.setHeader('Content-Disposition','attachment; filename="export-ribs.csv"');
      return res.status(200).send(lines.join('\n'));
    }

    const sliced = rows.slice(offset, offset+limit);
    return res.status(200).json({ items:sliced, nextOffset: offset + sliced.length });
  } catch (e) {
    return res.status(500).json({ error:'Erreur serveur (RIB).', detail:String(e.message||e) });
  }
};
