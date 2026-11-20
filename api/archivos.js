// Archivos adjuntos en Google Drive (Fase 2). Una sola función con varias acciones (?accion=…), todas POST
// y todas con la sesión de Supabase del usuario (Authorization: Bearer <jwt>):
//   iniciar    crea la carpeta AcroDocs/{contrato}/{etapa}/{hito}/ y una sesión de subida reanudable;
//              el navegador sube el archivo directo a Google con esa sesión (Vercel limita las peticiones a 4,5 MB).
//   trozo      plan B de la subida: el navegador manda trozos de ≤ 3 MiB y el servidor los reenvía a Google.
//   confirmar  comprueba que el archivo llegó completo a Drive y es del usuario.
//   descargar  entrega el archivo por trozos de ≤ 4 MiB (límite de respuesta de Vercel) tras verificar el permiso
//              `descargar` y que el usuario vea el contrato al que pertenece el archivo.
//   eliminar   manda el archivo a la papelera de Drive.
// Los permisos y la visibilidad del contrato los decide la base con las reglas RLS: se consulta con el JWT del
// usuario, no con la clave de servicio. Los usuarios nunca tocan Drive.
import { createClient } from "@supabase/supabase-js";
import * as driveReal from "./_drive.js";

export const config = { maxDuration: 30 };

const MAXIMO = 30 * 1024 * 1024;
const TROZO_SUBIDA = 3 * 1024 * 1024;
const PERMISOS_SUBIDA = ["subir", "reemplazar", "registrar"];
// Quien puede dejar un archivo sin uso: borra documentos, hitos o contratos, o deshace una carga fallida.
const PERMISOS_ELIMINAR = ["borrar_doc", "borrar_hito", "eliminar", "corregir", ...PERMISOS_SUBIDA];

class Rechazo extends Error {
  constructor(estado, mensaje) {
    super(mensaje);
    this.estado = estado;
  }
}

const algunPermiso = async (ctx, lista) => {
  for (const permiso of lista) if (await ctx.tienePermiso(permiso)) return true;
  return false;
};

// ---------- Acciones ----------
const iniciar = async ({ cuerpo, req, ctx, drive }) => {
  const permiso = PERMISOS_SUBIDA.includes(cuerpo.permiso) ? cuerpo.permiso : "subir";
  const tramiteId = String(cuerpo.tramiteId ?? "");
  const tareaId = String(cuerpo.tareaId ?? "");
  const tamano = Number(cuerpo.tamano);
  if (!tramiteId) throw new Rechazo(400, "Falta el contrato del archivo.");
  if (!Number.isFinite(tamano) || tamano <= 0) throw new Rechazo(400, "El archivo está vacío.");
  if (tamano > MAXIMO) throw new Rechazo(413, "El archivo supera el límite de 30 MB.");
  if (!(await ctx.tienePermiso(permiso))) throw new Rechazo(403, "No tienes permiso para subir documentos.");
  const contrato = await ctx.contrato(tramiteId);
  if (!contrato) throw new Rechazo(403, "No tienes acceso a este contrato.");
  // Si el hito todavía no llegó a la base, el archivo va a la carpeta «General» del contrato.
  const hito = tareaId ? await ctx.hito(tramiteId, tareaId) : null;

  const carpeta = await drive.carpetaDestino({ contrato, etapa: hito?.etapa || null, hito });
  const origen = req.headers.origin || (req.headers.host ? `https://${req.headers.host}` : "");
  const propiedades = { tramite: tramiteId, usuario: ctx.usuario.id, ...(tareaId ? { tarea: tareaId } : {}) };
  const sesion = await drive.iniciarSubida({
    nombre: drive.limpiarNombre(cuerpo.nombre, "documento"),
    mime: String(cuerpo.mime || "application/octet-stream"),
    tamano, carpeta, propiedades, origen,
  });
  return { estado: 200, cuerpo: sesion };
};

const trozo = async ({ req, ctx, drive }) => {
  if (!(await algunPermiso(ctx, PERMISOS_SUBIDA))) throw new Rechazo(403, "No tienes permiso para subir documentos.");
  const desde = Number(req.headers["x-desde"]);
  const total = Number(req.headers["x-total"]);
  const cuerpo = req.body;
  if (!Buffer.isBuffer(cuerpo)) throw new Rechazo(400, "El trozo debe enviarse como application/octet-stream.");
  if (!Number.isInteger(desde) || desde < 0 || !Number.isInteger(total) || total <= 0 || total > MAXIMO) {
    throw new Rechazo(400, "Los datos del trozo no son válidos.");
  }
  if (cuerpo.length > TROZO_SUBIDA || desde + cuerpo.length > total) throw new Rechazo(400, "El trozo es demasiado grande.");
  const resultado = await drive.enviarTrozo({ sesion: req.headers["x-sesion"], desde, total, cuerpo });
  return { estado: 200, cuerpo: resultado };
};

const confirmar = async ({ cuerpo, ctx, drive }) => {
  const archivo = await drive.metadatos(String(cuerpo.archivoId ?? ""));
  if (archivo.propiedades?.usuario !== ctx.usuario.id) throw new Rechazo(403, "Este archivo lo subió otro usuario.");
  return { estado: 200, cuerpo: { archivoId: archivo.id, nombre: archivo.nombre, mime: archivo.mime, tamano: archivo.tamano } };
};

// Archivo existente + usuario que ve su contrato. El contrato sale del propio archivo en Drive (lo fijó el
// servidor al crearlo), no de lo que diga la app: no sirve apuntar un `archivoId` ajeno desde otro documento.
const archivoVisible = async (id, ctx, drive) => {
  const archivo = await drive.metadatos(id);
  const tramiteId = archivo.propiedades?.tramite;
  if (!tramiteId || !(await ctx.contrato(tramiteId))) throw new Rechazo(403, "No tienes acceso al contrato de este archivo.");
  return archivo;
};

const descargar = async ({ cuerpo, ctx, drive }) => {
  if (!(await ctx.tienePermiso("descargar"))) throw new Rechazo(403, "No tienes permiso para descargar documentos.");
  const archivo = await archivoVisible(String(cuerpo.archivoId ?? ""), ctx, drive);
  const desde = Math.max(0, Math.floor(Number(cuerpo.desde) || 0));
  const hasta = Math.min(desde + drive.TROZO_DESCARGA, archivo.tamano) - 1;
  const bytes = archivo.tamano > 0 && desde <= hasta ? await drive.leerRango(archivo.id, desde, hasta) : Buffer.alloc(0);
  return {
    estado: 200,
    binario: bytes,
    cabeceras: {
      "Content-Type": "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Total": String(archivo.tamano),
      "X-Nombre": encodeURIComponent(archivo.nombre || "documento"),
      "X-Mime": archivo.mime || "application/octet-stream",
    },
  };
};

const eliminar = async ({ cuerpo, ctx, drive }) => {
  if (!(await algunPermiso(ctx, PERMISOS_ELIMINAR))) throw new Rechazo(403, "No tienes permiso para eliminar documentos.");
  let archivo;
  try {
    archivo = await archivoVisible(String(cuerpo.archivoId ?? ""), ctx, drive);
  } catch (error) {
    if (error.estado === 404) return { estado: 200, cuerpo: { ok: true } }; // ya no estaba
    throw error;
  }
  await drive.aPapelera(archivo.id);
  return { estado: 200, cuerpo: { ok: true } };
};

const ACCIONES = { iniciar, trozo, confirmar, descargar, eliminar };

// ---------- Servidor ----------
// `autenticar(req)` devuelve { error, estado } o { usuario: { id }, tienePermiso(p), contrato(id), hito(tramiteId, id) }.
export const crearManejador = ({ autenticar, drive }) => async (req, res) => {
  const responder = (estado, cuerpo) => res.status(estado).json(cuerpo);
  if (!drive.configurado()) return responder(503, { error: "Google Drive no está configurado en el servidor." });
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return responder(405, { error: "Método no permitido" });
  }
  const accion = ACCIONES[req.query?.accion];
  if (!accion) return responder(400, { error: "Acción desconocida." });
  try {
    const acceso = await autenticar(req);
    if (acceso.error) return responder(acceso.estado, { error: acceso.error });
    const cuerpo = req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body) ? req.body : {};
    const r = await accion({ cuerpo, req, ctx: acceso, drive });
    if (r.binario) {
      res.status(r.estado);
      for (const [clave, valor] of Object.entries(r.cabeceras)) res.setHeader(clave, valor);
      return res.end(r.binario);
    }
    return responder(r.estado, r.cuerpo);
  } catch (error) {
    if (error instanceof Rechazo || error instanceof drive.ErrorDrive) return responder(error.estado, { error: error.message });
    console.error("api/archivos:", req.query?.accion, error);
    return responder(500, { error: "No se pudo completar la operación con los archivos." });
  }
};

// ---------- Acceso a Supabase con el JWT del usuario ----------
const url = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const llavePublica = () => process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const nombreContrato = (t) => `${t.codigo || ""} - ${t.denominacion || ""}`;

// Usuario que dice el JWT (el campo `sub`). Solo se lee; la firma y la expiración las valida la base en
// la consulta siguiente, igual que en cada acceso a los datos desde el navegador.
const usuarioDelToken = (token) => {
  try {
    const { sub, exp, role } = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    if (!sub || role !== "authenticated") return null;
    if (exp && exp * 1000 < Date.now()) return null;
    return sub;
  } catch {
    return null;
  }
};

export const autenticarReal = async (req) => {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return { estado: 401, error: "Falta iniciar sesión." };
  if (!url() || !llavePublica()) return { estado: 503, error: "Supabase no está configurado en el servidor." };
  const usuarioId = usuarioDelToken(token);
  if (!usuarioId) return { estado: 401, error: "La sesión no es válida. Vuelve a ingresar." };
  // Con la clave pública y el JWT del usuario, las reglas RLS de la base valen igual que en el navegador.
  // No se usa auth.getUser: exige que la sesión exista en el servidor de ingreso y falla si se cerró en otro
  // dispositivo (el «cerrar sesión» de uno) aunque el token siga vigente y la app siga funcionando.
  const db = createClient(url(), llavePublica(), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: perfil, error: errorPerfil, status } = await db.from("perfiles").select("id, activo").eq("id", usuarioId).maybeSingle();
  if (errorPerfil) {
    // La base rechaza un token vencido o falso con 401; cualquier otro fallo es del servidor.
    if (status === 401 || status === 403 || /jwt/i.test(errorPerfil.message || "")) return { estado: 401, error: "La sesión no es válida. Vuelve a ingresar." };
    console.error("perfil falló:", status, errorPerfil.code, errorPerfil.message);
    return { estado: 500, error: "No se pudo verificar tu usuario." };
  }
  if (!perfil?.activo) return { estado: 403, error: "Tu usuario está desactivado." };

  return {
    usuario: { id: usuarioId },
    tienePermiso: async (p) => {
      const { data: tiene, error: e } = await db.rpc("tiene_permiso", { p });
      if (e) throw e;
      return tiene === true;
    },
    // Con RLS, una fila que el usuario no puede ver simplemente no aparece.
    contrato: async (id) => {
      const { data: fila, error: e } = await db.from("tramites").select("id, data").eq("id", id).maybeSingle();
      if (e) throw e;
      return fila ? { id: fila.id, nombre: nombreContrato(fila.data || {}) } : null;
    },
    hito: async (tramiteId, id) => {
      const { data: fila, error: e } = await db.from("items").select("id, data").eq("id", id).eq("tramite_id", tramiteId).maybeSingle();
      if (e) throw e;
      if (!fila) return null;
      const d = fila.data || {};
      return { id: fila.id, nombre: `${d.codigo || ""} ${d.nombre || ""}`, etapa: { codigo: d.etapaCodigo, nombre: d.etapaNombre } };
    },
  };
};

export default crearManejador({ autenticar: autenticarReal, drive: driveReal });
