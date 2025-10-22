// api/me/upload-rib.js
import { requireAuth, send } from './_auth.js';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://tpwkptzlhxitllugmlho.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

    const { user } = await requireAuth(req);
    const { filename, content_base64, mime } = req.body || {};

    if (!filename || !content_base64) {
      return send(res, 400, { error: 'Fichier requis' });
    }

    // Limite ~5 Mo
    const buffer = Buffer.from(content_base64, 'base64');
    if (buffer.length > 5 * 1024 * 1024) {
      return send(res, 400, { error: 'Fichier trop volumineux (>5 Mo)' });
    }

    // Nom de fichier sécurisé
    const safeName = String(filename).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80);
    const path = `${user.id}/${Date.now()}_${safeName}`;

    const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { error } = await supa.storage.from('rib-docs').upload(path, buffer, {
      contentType: mime || 'application/octet-stream',
      upsert: false
    });
    if (error) return send(res, 500, { error: 'Upload failed' });

    // On retourne juste le chemin (privé). L’admin pourra générer un lien signé.
    return send(res, 200, { ok: true, path });
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: 'Server error' });
  }
}
