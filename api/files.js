import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const bucket = process.env.SUPABASE_BUCKET || "adjuntos";
const appKey = process.env.APP_KEY || "";

const supabase = url && key ? createClient(url, key) : null;

const autorizado = (req) => !appKey || req.headers["x-app-key"] === appKey;
const rutaSegura = (valor) =>
  String(valor || "")
    .replace(/[^a-zA-Z0-9/_\-.]/g, "_")
    .replace(/\.\./g, "_")
    .replace(/^\/+/, "");

export default async function handler(req, res) {
  if (!supabase) {
    return res.status(503).json({ error: "Supabase no está configurado en el servidor." });
  }
  if (!autorizado(req)) {
    return res.status(401).json({ error: "Clave de aplicación inválida." });
  }

  if (req.method === "GET") {
    const path = rutaSegura(req.query.path);
    if (!path) return res.status(400).json({ error: "Falta `path`." });
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ url: data.signedUrl });
  }

  if (req.method === "POST") {
    const { path, base64, contentType = "application/octet-stream" } = req.body || {};
    const seguro = rutaSegura(path);
    if (!seguro || !base64) return res.status(400).json({ error: "Faltan `path` o `base64`." });
    const buffer = Buffer.from(base64, "base64");
    if (buffer.length > 4 * 1024 * 1024) {
      return res.status(413).json({ error: "El archivo supera el límite de 4 MB de esta API." });
    }
    const { error } = await supabase.storage.from(bucket).upload(seguro, buffer, {
      contentType,
      upsert: true,
    });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ path: seguro });
  }

  if (req.method === "DELETE") {
    const path = rutaSegura(req.query.path);
    if (!path) return res.status(400).json({ error: "Falta `path`." });
    const { error } = await supabase.storage.from(bucket).remove([path]);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ error: "Método no permitido" });
}
