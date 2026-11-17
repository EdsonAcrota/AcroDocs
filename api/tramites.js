import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

const itemToRow = (item, tramiteId) => ({
  tramite_id: tramiteId,
  codigo: item.codigo,
  nombre: item.nombre,
  etapa_codigo: item.etapaCodigo || "P",
  etapa_nombre: item.etapaNombre || "Hitos propios",
  seccion_codigo: item.seccionCodigo || item.etapaCodigo || "P",
  seccion_nombre: item.seccionNombre || item.etapaNombre || "Hitos propios",
  tipo: item.tipo || "fijo",
  plantilla: item.plantilla || "",
  clave_plantilla: item.clavePlantilla || null,
  clave_eventual: item.clave || item.clave_eventual || null,
  doc_cumplimiento: item.docCumplimiento || null,
  tipo_fianza: item.tipoFianza || null,
  estado: item.estado || "Pendiente",
  responsable: item.responsable || "",
  fecha: item.fecha || null,
  fecha_limite: item.fecha_limite || null,
  observacion: item.observacion || "",
  docs_requeridos: item.docsRequeridos || [],
  plazo_dias: item.plazoDias || 0,
  plazo_base: item.plazoBase || "inicio",
  plazo_habiles: item.plazoHabiles !== false,
  norma: item.norma || "",
  nota: item.nota || "",
  recurrente: Boolean(item.recurrente),
  frecuencia: item.frecuencia || null,
  dia_limite: item.diaLimite || null,
  periodo: item.periodo || null,
  silencio_positivo: Boolean(item.silencioPositivo),
  dias_silencio: item.diasSilencio || 0,
});

export default async function handler(req, res) {
  const { id } = req.query || {};

  if (req.method === "GET") {
    let q = supabase
      .from("tramites")
      .select("*, tramite_items(*, adjuntos(*))");
    if (id) q = q.eq("id", id);
    const { data, error } = await q.order("id", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ tramites: data || [] });
  }

  if (req.method === "POST") {
    const body = req.body || {};
    const { items = [], id: _id, configFianzas, ...tramite } = body;
    const filaTramite = {
      ...tramite,
      ...(configFianzas ? { config_fianzas: configFianzas } : {}),
    };

    const { data: creado, error } = await supabase
      .from("tramites")
      .insert(filaTramite)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });

    if (items.length) {
      const filas = items.map((item) => itemToRow(item, creado.id));
      const { error: itemsError } = await supabase.from("tramite_items").insert(filas);
      if (itemsError) {
        await supabase.from("tramites").delete().eq("id", creado.id);
        return res.status(500).json({ error: itemsError.message });
      }
    }

    const { data, error: readError } = await supabase
      .from("tramites")
      .select("*, tramite_items(*, adjuntos(*))")
      .eq("id", creado.id)
      .single();
    if (readError) return res.status(500).json({ error: readError.message });
    return res.status(201).json(data);
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Método no permitido" });
}
