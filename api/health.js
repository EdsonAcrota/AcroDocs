const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

export default async function handler(req, res) {
  res.status(200).json({
    ok: true,
    runtime: "node",
    supabase: Boolean(url && key),
    sync: process.env.VITE_CLOUD_SYNC === "true",
  });
}
