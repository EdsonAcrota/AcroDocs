// Archivos en Google Drive (modo nube). El navegador nunca habla con Drive con credenciales: pide al
// servidor (/api/archivos) una sesión de subida y sube directo a Google, y la descarga la sirve el
// servidor por trozos después de comprobar el permiso. Ver api/archivos.js.
import { supabase } from "./supabase.js";

export const MAXIMO_BYTES = 30 * 1024 * 1024;
// Plan B de la subida: trozos que pasan por el servidor (Vercel limita la petición a 4,5 MB; 256 KiB × 12).
export const TROZO_SERVIDOR = 3 * 1024 * 1024;
const REINTENTOS_TROZO = [1000, 3000];

export class ErrorArchivo extends Error {
  constructor(mensaje, estado = 0) {
    super(mensaje);
    this.estado = estado;
  }
}

const fechaLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

const llamar = async (accion, { json, cuerpo, cabeceras } = {}) => {
  const { data } = await supabase.auth.getSession();
  try {
    return await fetch(`/api/archivos?accion=${accion}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${data?.session?.access_token || ""}`,
        ...(json ? { "Content-Type": "application/json" } : {}),
        ...cabeceras,
      },
      body: json ? JSON.stringify(json) : cuerpo,
    });
  } catch {
    throw new ErrorArchivo("Sin conexión con el servidor. Revisa tu internet e inténtalo de nuevo.");
  }
};

const leerJson = async (respuesta) => {
  let json = {};
  try { json = await respuesta.json(); } catch { /* respuesta sin cuerpo JSON */ }
  if (!respuesta.ok) throw new ErrorArchivo(json.error || "No se pudo completar la acción con el archivo.", respuesta.status);
  return json;
};

const pedir = async (accion, json) => leerJson(await llamar(accion, { json }));

// Subida directa a la sesión de Google. Falla si la red o el CORS del navegador no la dejan pasar.
const subirDirecto = async (sesion, archivo) => {
  const respuesta = await fetch(sesion, { method: "PUT", body: archivo });
  if (!respuesta.ok) throw new Error(`Google respondió ${respuesta.status}`);
};

const subirPorServidor = async (sesion, archivo) => {
  const total = archivo.size;
  for (let desde = 0; desde < total; desde += TROZO_SERVIDOR) {
    const trozo = archivo.slice(desde, Math.min(desde + TROZO_SERVIDOR, total));
    for (let intento = 0; ; intento += 1) {
      try {
        await leerJson(await llamar("trozo", {
          cuerpo: trozo,
          cabeceras: { "Content-Type": "application/octet-stream", "X-Sesion": sesion, "X-Desde": String(desde), "X-Total": String(total) },
        }));
        break;
      } catch (error) {
        // Solo se repite lo que puede mejorar solo (red caída, error de Google); un permiso negado no.
        const reintentable = !error.estado || error.estado >= 500;
        if (!reintentable || intento >= REINTENTOS_TROZO.length) throw error;
        await pausa(REINTENTOS_TROZO[intento]);
      }
    }
  }
};

// Sube el archivo a Drive y devuelve los mismos metadatos que el modo local: `archivoId` es el id en Drive.
// meta: { tramiteId, tareaId, tipoDoc, nombre, permiso } (`permiso`: subir | reemplazar | registrar).
export const subirADrive = async (archivo, meta = {}) => {
  if (!archivo.size) throw new ErrorArchivo("El archivo está vacío.");
  if (archivo.size > MAXIMO_BYTES) throw new ErrorArchivo("El archivo supera el límite de 30 MB.");
  const mime = archivo.type || "application/octet-stream";
  const nombre = meta.nombre || archivo.name;
  const pedido = { tramiteId: meta.tramiteId, tareaId: meta.tareaId, nombre, mime, tamano: archivo.size, permiso: meta.permiso };

  let sesion = await pedir("iniciar", pedido);
  try {
    await subirDirecto(sesion.sesion, archivo);
  } catch { /* la comprobación de abajo dice si llegó o no */ }
  // Se pregunta al servidor aunque la subida directa haya salido bien (así el id queda verificado), y
  // también si falló al leer la respuesta de Google: el archivo pudo llegar completo.
  let confirmado = await pedir("confirmar", { archivoId: sesion.archivoId }).catch(() => null);
  if (!confirmado) {
    sesion = await pedir("iniciar", pedido);
    await subirPorServidor(sesion.sesion, archivo);
    confirmado = await pedir("confirmar", { archivoId: sesion.archivoId });
  }
  return {
    id: confirmado.archivoId,
    archivoId: confirmado.archivoId,
    nombre,
    mime,
    tamano: archivo.size,
    fecha: fechaLocal(),
    tipoDoc: meta.tipoDoc || "Otros",
  };
};

// Baja el archivo completo (trozo a trozo) y lo devuelve como Blob.
export const descargarDeDrive = async (archivoId) => {
  const partes = [];
  let desde = 0;
  let total = Infinity;
  let nombre = "";
  let mime = "";
  while (desde < total) {
    const respuesta = await llamar("descargar", { json: { archivoId, desde } });
    if (!respuesta.ok) await leerJson(respuesta);
    total = Number(respuesta.headers.get("X-Total"));
    nombre = decodeURIComponent(respuesta.headers.get("X-Nombre") || "");
    mime = respuesta.headers.get("X-Mime") || "";
    const parte = await respuesta.arrayBuffer();
    if (!parte.byteLength) break;
    partes.push(parte);
    desde += parte.byteLength;
  }
  if (Number.isFinite(total) && desde !== total) throw new ErrorArchivo("La descarga quedó incompleta. Inténtalo de nuevo.");
  return { blob: new Blob(partes, { type: mime || "application/octet-stream" }), nombre };
};

export const eliminarDeDrive = async (archivoId) => {
  await pedir("eliminar", { archivoId });
};
