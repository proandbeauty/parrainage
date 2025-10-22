// /api/me/update-profile.js
export const config = { runtime: 'nodejs' };
import { createClient } from '@supabase/supabase-js';
import { verifyAuth } from './_auth';

const SUPABASE_URL = 'https://tpwkptzlhxitllugmlho.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  try{
    if (req.method !== 'POST') return res.status(405).json({ error:'Method Not Allowed' });
    const user = verifyAuth(req);
    if (!user) return res.status(401).json({ error:'unauthorized' });

    const { first_name, last_name, phone } = req.body || {};
    const patch = {};
    if (typeof first_name === 'string') patch.first_name = first_name;
    if (typeof last_name  === 'string') patch.last_name  = last_name;
    if (typeof phone      === 'string') patch.phone      = phone;
    if (!Object.keys(patch).length) return res.status(400).json({ error:'aucune donnée' });

    const { data, error } = await supabase
      .from('referrers')
      .update(patch)
      .eq('id', user.sub)
      .select('id, first_name, last_name, email, phone')
      .single();

    if (error) return res.status(500).json({ error:error.message });
    return res.status(200).json({ ok:true, me:data });
  }catch(e){ console.error(e); return res.status(500).json({ error:'server' }); }
}
