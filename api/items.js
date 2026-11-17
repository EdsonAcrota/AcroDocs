import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

const mapItem = (item) => {
  const row = {};
  const set = (key, col, value) => {
    if (value !== undefined) row[col] = value;
  };
  set("codigo", "codigo", item.codigo);
  set("nombre", "nombre", item.nombre);
  set("etapaCodigo", "etapa_codigo", item.etapaCodigo);
  set("etapaNombre", "etapa_nombre", item.etapaNombre);
  set("seccionCodigo", "seccion_codigo", item.seccionCodigo);
  set("seccionNombre", "seccion_nombre", item.seccionNombre);
  set("tipo", "tipo", item.tipo);
  set("plantilla", "plantilla", item.plantilla);
  set("clavePlantilla", "clave_plantilla", item.clavePlantilla ?? item.clave_plantilla);
  set("docCumplimiento", "doc_cumplimiento", item.docCumplimiento ?? item.doc_cumplimiento);
  set("tipoFianza", "tipo_fianza", item.tipoFianza ?? item.tipo_fianza);
  set("clave", "clave_eventual", item.clave ?? item.clave_eventual);
  set("estado", "estado", item.estado);
  set("responsable", "responsable", item.responsable);
  set("fecha", "fecha", item.fecha || null);
  set("fechaLimite", "fecha_limite", item.fecha_limite || null);
  set("observacion", "observacion", item.observacion);
  set("docsRequeridos", "docs_requeridos", item.docsRequeridos);
  set("plazoDias", "plazo_dias", item.plazoDias);
  set("plazoBase", "plazo_base", item.plazoBase);
  set("plazoHabiles", "plazo_habiles", item.plazoHabiles);
  set("norma", "norma", item.norma);
  set("nota", "nota", item.nota);
  set("recurrente", "recurrente", item.recurrente);
  set("frecuencia", "frecuencia", item.frecuencia);
  set("diaLimite", "dia_limite", item.diaLimite);
  set("periodo", "periodo", item.periodo);
  set("silencioPositivo", "silencio_positivo", item.silencioPositivo);
  set("diasSilencio", "dias_silencio", item.diasSilencio);
  return row;
};

const itemToRow = (item, tramiteId) => ({
  tramite_id: tramiteId,
  etapa_codigo: item.etapaCodigo || "P",
  etapa_nombre: item.etapaNombre || "Hitos propios",
  seccion_codigo: item.seccionCodigo || item.etapaCodigo || "P",
  seccion_nombre: item.seccionNombre || item.etapaNombre || "Hitos propios",
  tipo: item.tipo || "fijo",
  estado: item.estado || "Pendiente",
  ...mapItem(item),
});

export default async function handler(req, res) {
  const { id, tramite_id } = req.query || {};

  if (req.method === "GET") {
    let q = supabase
      .from("tramite_items")
      .select("*, adjuntos(*)");
    if (id) q = q.eq("id", id);
    if (tramite_id) q = q.eq("tramite_id", tramite_id);
    const { data, error } = await q.order("codigo", { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ items: data || [] });
  }

  if (req.method === "POST") {
    const body = req.body || {};
    if (!body.tramite_id) return res.status(400).json({ error: "Falta tramite_id." });
    const { data, error } = await supabase
      .from("tramite_items")
      .insert(itemToRow(body, body.tramite_id))
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  if (req.method === "PATCH") {
    if (!id) return res.status(400).json({ error: "Falta el id del hito." });
    const body = req.body || {};
    const cambios = mapItem(body);
    const { data, error } = await supabase
      .from("tramite_items")
      .update(cambios)
      .eq("id", id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === "DELETE") {
    if (!id) return res.status(400).json({ error: "Falta el id del hito." });
    const { error } = await supabase.from("tramite_items").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(204).end();
  }

  res.setHeader("Allow", "GET, POST, PATCH, DELETE");
  return res.status(405).json({ error: "Método no permitido" });
}
