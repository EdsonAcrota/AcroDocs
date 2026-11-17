import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// No crear el cliente si faltan variables: createClient lanza una excepción
// y deja la pantalla en blanco. Sin configuración, la app usa el demo local.
export const supabase = url && key ? createClient(url, key) : null;
export const hasSupabase = Boolean(supabase);
