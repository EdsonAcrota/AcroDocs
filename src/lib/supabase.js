// Cliente de Supabase para el navegador. Solo usa la clave pública (publishable):
// todo lo que puede hacer lo decide la base con las reglas RLS.
// Sin las dos variables la app queda en modo local (demo y pruebas).
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const llavePublica = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const MODO_NUBE = Boolean(url && llavePublica);

export const supabase = MODO_NUBE
  ? createClient(url, llavePublica, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;
