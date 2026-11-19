import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const appKey = process.env.APP_KEY || "";
const ROW_ID = process.env.APP_STATE_ID || "acrodocs-principal";

const supabase = url && key ? createClient(url, key) : null;

const autorizado = (req) => !appKey || req.headers["x-app-key"] === appKey;

export default async function handler(req, res) {
  if (!supabase) {
    return res.status(503).json({ error: "Supabase no está configurado en el servidor." });
  }
  if (!autorizado(req)) {
    return res.status(401).json({ error: "Clave de aplicación inválida." });
  }

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("app_states")
      .select("data, updated_at")
      .eq("id", ROW_ID)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(200).json({ data: null, updated_at: null });
    return res.status(200).json(data);
  }

  if (req.method === "PUT") {
    const cuerpo = req.body || {};
    if (!cuerpo.data || typeof cuerpo.data !== "object" || Array.isArray(cuerpo.data)) {
      return res.status(400).json({ error: "Falta un objeto `data` válido." });
    }
    const { error } = await supabase.from("app_states").upsert({
      id: ROW_ID,
      data: cuerpo.data,
      updated_at: new Date().toISOString(),
    });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, PUT");
  return res.status(405).json({ error: "Método no permitido" });
}
