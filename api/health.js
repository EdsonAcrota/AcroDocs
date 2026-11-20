const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const llaveServicio = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Solo informa si el servidor tiene lo necesario; nunca devuelve valores.
export default async function handler(req, res) {
  res.status(200).json({
    ok: true,
    runtime: "node",
    supabase: Boolean(url && llaveServicio),
    nube: Boolean(process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_PUBLISHABLE_KEY),
  });
}
