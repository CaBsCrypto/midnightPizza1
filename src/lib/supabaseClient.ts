import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL;
const supabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY no configuradas: el multiplayer no funcionará.');
}

// Cliente público (anon key): solo se usa para suscribirse a canales de Realtime Broadcast.
// No tiene acceso a ninguna tabla (RLS activado sin políticas públicas) ni a datos sensibles.
// Si las variables de entorno no están configuradas, exportamos null en lugar de crashear.
export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } })
    : null;
