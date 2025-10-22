import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

export default async function handler(req, res) {
  try {
    const auth = req.headers.authorization || ''
    if (!auth || !auth.startsWith('Bearer ') || auth.split(' ')[1] !== process.env.ADMIN_TOKEN) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const {
      status = 'all',
      limit = 50,
      offset = 0,
      search = '',
      format = 'json'
    } = req.query

    // Filtrage
    let query = supabase
      .from('bank_accounts')
      .select(`
        id, created_at, status, iban_masked, iban, bic, holder_name, doc_path,
        referrer:referrer_id ( id, first_name, last_name, email, referral_code )
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1)

    if (status !== 'all') query = query.eq('status', status)
    if (search) {
      query = query.or(`holder_name.ilike.%${search}%,iban.ilike.%${search}%,bic.ilike.%${search}%`)
    }

    const { data, error } = await query
    if (error) throw error

    // --- [OPTION CSV] ---
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', 'attachment; filename="export-ribs.csv"')

      const header = [
        'ID',
        'Date création',
        'Statut',
        'Titulaire',
        'IBAN masqué',
        'BIC',
        'Email référent',
        'Code parrain',
        'Justificatif présent'
      ]

      const rows = (data || []).map(r => {
        const ref = r.referrer || {}
        return [
          r.id,
          new Date(r.created_at).toLocaleString('fr-FR'),
          r.status,
          r.holder_name || '',
          r.iban_masked || r.iban || '',
          r.bic || '',
          ref.email || '',
          ref.referral_code || '',
          r.doc_path ? 'Oui' : 'Non'
        ].map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')
      })

      const csv = [header.join(','), ...rows].join('\n')
      return res.status(200).send(csv)
    }

    // --- [FORMAT JSON PAR DÉFAUT] ---
    return res.status(200).json({
      ok: true,
      items: data,
      nextOffset: parseInt(offset) + data.length
    })
  } catch (err) {
    console.error('ribs-list error', err)
    res.status(500).json({ error: err.message || 'Server error' })
  }
}
