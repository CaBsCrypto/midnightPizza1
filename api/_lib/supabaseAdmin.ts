import { createClient } from '@supabase/supabase-js';

// Cliente con Service Role Key: solo se usa en funciones serverless (nunca en el navegador).
// Las tablas tienen RLS activado sin políticas públicas, así que solo este cliente puede leerlas/escribirlas.
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Faltan las variables de entorno SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el servidor.');
}

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});
