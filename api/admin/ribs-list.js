import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

// Champs autorisés pour le tri (côté table bank_accounts)
const SORTABLE = new Set(['created_at', 'holder_name', 'status', 'iban_masked'])

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
      format = 'json',
      sort_by = 'created_at',
      order = 'desc' // 'asc' | 'desc'
    } = req.query

    const sortBy = SORTABLE.has(String(sort_by)) ? String(sort_by) : 'created_at'
    const sortDir = (String(order).toLowerCase() === 'asc') ? true : false // Supabase: ascending: true/false

    let query = supabase
      .from('bank_accounts')
      .select(`
        id, created_at, status, iban_masked, iban, bic, holder_name, doc_path,
        referrer:referrer_id ( id, first_name, last_name, email, referral_code )
      `, { count: 'exact' })
      .order(sortBy, { ascending: sortDir })
      .range(parseInt(offset,10), parseInt(offset,10) + parseInt(limit,10) - 1)

    if (status !== 'all') query = query.eq('status', status)
    if (search) {
      // recherche simple sur colonnes locales (pas sur la jointure)
      query = query.or(`holder_name.ilike.%${search}%,iban.ilike.%${search}%,iban_masked.ilike.%${search}%,bic.ilike.%${search}%`)
    }

    const { data, error } = await query
    if (error) throw error

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

    return res.status(200).json({
      ok: true,
      items: data,
      nextOffset: parseInt(offset,10) + (data?.length || 0)
    })
  } catch (err) {
    console.error('ribs-list error', err)
    res.status(500).json({ error: err.message || 'Server error' })
  }
}
