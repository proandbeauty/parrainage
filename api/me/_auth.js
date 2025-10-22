// api/me/_auth.js
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';

export function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY; // service_role
  if (!url || !key) throw new Error('Missing Supabase env (SUPABASE_URL / SUPABASE_SERVICE_KEY)');
  return createClient(url, key);
}

/**
 * Vérifie le Bearer token, renvoie { supabase, user }
 * Lève [status, message] en cas d’erreur.
 */
export async function requireAuth(req) {
  const auth = req.headers?.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) throw [401, 'Missing token'];

  // Vérifie notre JWT utilisateur
  let payload;
  try {
    payload = jwt.verify(token, process.env.USER_JWT_SECRET);
  } catch {
    throw [401, 'Invalid token'];
  }

  const supabase = getSupabase();

  // On retrouve l’utilisateur dans referrers via sub (son id)
  const { data: user, error } = await supabase
    .from('referrers')
    .select('*')
    .eq('id', payload.sub)
    .single();

  if (error || !user) throw [401, 'User not found'];
  return { supabase, user };
}

// petit helper de réponse JSON
export function send(res, status, body) {
  res.status(status).json(body);
}
