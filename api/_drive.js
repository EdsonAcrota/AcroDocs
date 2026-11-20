// Cliente mínimo de Google Drive para el servidor (Fase 2). Se conecta con la cuenta de Edson mediante
// OAuth: un token de actualización (GOOGLE_REFRESH_TOKEN) con el alcance `drive.file`, que solo ve lo que
// AcroDocs crea. Los usuarios de AcroDocs nunca entran a Drive; el permiso lo comprueba api/archivos.js.
// El nombre empieza con guion bajo: Vercel no lo publica como función.

const URL_TOKEN = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/drive/v3";
const API_SUBIDA = "https://www.googleapis.com/upload/drive/v3/files";
const CARPETA = "application/vnd.google-apps.folder";
// Una sesión de subida de Google siempre tiene esta forma; el servidor no reenvía a ninguna otra dirección.
const SESION_VALIDA = /^https:\/\/www\.googleapis\.com\/upload\/drive\/v3\/files\?[^#\s]*upload_id=/;

// Cada descarga pide un trozo: Vercel limita la respuesta de una función a 4,5 MB.
export const TROZO_DESCARGA = 4 * 1024 * 1024;

export class ErrorDrive extends Error {
  constructor(estado, mensaje) {
    super(mensaje);
    this.estado = estado;
  }
}

const config = () => ({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
  raiz: process.env.GOOGLE_DRIVE_CARPETA_RAIZ || "AcroDocs",
});

export const configurado = () => {
  const c = config();
  return Boolean(c.clientId && c.clientSecret && c.refreshToken);
};

// ---------- Acceso ----------
let acceso = null; // { token, vence }
export const olvidarAcceso = () => { acceso = null; };

const tokenDeAcceso = async () => {
  if (acceso && acceso.vence > Date.now() + 60_000) return acceso.token;
  const c = config();
  const respuesta = await fetch(URL_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.clientId, client_secret: c.clientSecret, refresh_token: c.refreshToken, grant_type: "refresh_token",
    }),
  });
  const json = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok || !json.access_token) {
    console.error("Google (token):", respuesta.status, json.error, json.error_description);
    throw new ErrorDrive(502, json.error === "invalid_grant"
      ? "Google rechazó la conexión (invalid_grant): el permiso de Drive venció o fue revocado. Hay que generar un token nuevo."
      : "No se pudo conectar con Google Drive. Revisa GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET y GOOGLE_REFRESH_TOKEN en Vercel.");
  }
  acceso = { token: json.access_token, vence: Date.now() + (Number(json.expires_in) || 3600) * 1000 };
  return acceso.token;
};

const llamar = async (url, opciones = {}) => {
  const token = await tokenDeAcceso();
  return fetch(url, { ...opciones, headers: { Authorization: `Bearer ${token}`, ...opciones.headers } });
};

const comprobar = async (respuesta, que) => {
  if (respuesta.ok) return respuesta;
  const texto = await respuesta.text().catch(() => "");
  console.error(`Drive (${que}):`, respuesta.status, texto.slice(0, 300));
  if (respuesta.status === 404) throw new ErrorDrive(404, "El archivo no existe en Drive.");
  throw new ErrorDrive(502, `Google Drive respondió con un error (${respuesta.status}) al ${que}.`);
};

// ---------- Carpetas: AcroDocs/{contrato}/{etapa}/{hito}/ ----------
const escaparQ = (texto) => String(texto).replace(/\\/g, "\\\\").replace(/'/g, "\\'");

export const limpiarNombre = (texto, respaldo = "Sin nombre") => {
  const limpio = String(texto ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100)
    .trim();
  return limpio || respaldo;
};

// Cada carpeta lleva en `appProperties.ruta` una clave basada en ids (no en nombres), así se encuentra
// aunque se renombre el contrato o el hito; si el nombre cambió, se renombra en Drive.
const asegurarCarpeta = async ({ clave, nombre }, padre) => {
  const q = `mimeType='${CARPETA}' and trashed=false and appProperties has { key='ruta' and value='${escaparQ(clave)}' }`;
  const buscar = await comprobar(await llamar(`${API}/files?${new URLSearchParams({
    q, fields: "files(id,name)", orderBy: "createdTime", pageSize: "5", spaces: "drive",
  })}`), "buscar la carpeta");
  const { files = [] } = await buscar.json();
  if (files[0]) {
    if (files[0].name !== nombre) {
      await comprobar(await llamar(`${API}/files/${encodeURIComponent(files[0].id)}?fields=id`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: nombre }),
      }), "renombrar la carpeta");
    }
    return files[0].id;
  }
  const creada = await comprobar(await llamar(`${API}/files?fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: nombre, mimeType: CARPETA, ...(padre ? { parents: [padre] } : {}), appProperties: { ruta: clave } }),
  }), "crear la carpeta");
  return (await creada.json()).id;
};

// Devuelve el id de la carpeta destino, creando lo que falte.
// `contrato`: { id, nombre }; `etapa`: { codigo, nombre } | null; `hito`: { id, nombre } | null.
export const carpetaDestino = async ({ contrato, etapa, hito }) => {
  const tramos = [
    { clave: "raiz", nombre: limpiarNombre(config().raiz, "AcroDocs") },
    { clave: `c:${contrato.id}`, nombre: limpiarNombre(contrato.nombre, "Contrato") },
  ];
  if (hito) {
    tramos.push({ clave: `e:${contrato.id}:${etapa?.codigo || "P"}`, nombre: limpiarNombre(`${etapa?.codigo || ""} ${etapa?.nombre || "Hitos propios"}`) });
    tramos.push({ clave: `h:${hito.id}`, nombre: limpiarNombre(hito.nombre) });
  } else {
    tramos.push({ clave: `g:${contrato.id}`, nombre: "General" });
  }
  let padre = null;
  for (const tramo of tramos) padre = await asegurarCarpeta(tramo, padre);
  return padre;
};

// ---------- Subida ----------
// Crea una sesión de subida reanudable. El identificador del archivo se reserva antes, así la app
// sabe qué `archivoId` guardar sin depender de leer la respuesta final de Google en el navegador.
// `origen` va en la cabecera Origin para que Google acepte la subida directa desde esa página (CORS).
export const iniciarSubida = async ({ nombre, mime, tamano, carpeta, propiedades, origen }) => {
  const ids = await comprobar(await llamar(`${API}/files/generateIds?count=1&space=drive`), "reservar el identificador");
  const id = (await ids.json()).ids?.[0];
  if (!id) throw new ErrorDrive(502, "Google Drive no entregó un identificador de archivo.");
  const cabeceras = {
    "Content-Type": "application/json; charset=UTF-8",
    "X-Upload-Content-Type": mime || "application/octet-stream",
    "X-Upload-Content-Length": String(tamano),
    ...(origen ? { Origin: origen } : {}),
  };
  const respuesta = await comprobar(await llamar(`${API_SUBIDA}?uploadType=resumable&fields=id`, {
    method: "POST",
    headers: cabeceras,
    body: JSON.stringify({ id, name: nombre, parents: [carpeta], appProperties: { acrodocs: "1", ...propiedades } }),
  }), "crear la sesión de subida");
  const sesion = respuesta.headers.get("location");
  if (!sesion || !SESION_VALIDA.test(sesion)) throw new ErrorDrive(502, "Google Drive no entregó la sesión de subida.");
  return { archivoId: id, sesion };
};

// Plan B de la subida: reenvía un trozo (≤ 3 MiB, múltiplo de 256 KiB salvo el último) a la sesión de Google.
export const enviarTrozo = async ({ sesion, desde, total, cuerpo }) => {
  if (!SESION_VALIDA.test(String(sesion || ""))) throw new ErrorDrive(400, "La sesión de subida no es válida.");
  if (!cuerpo?.length) throw new ErrorDrive(400, "El trozo está vacío.");
  const hasta = desde + cuerpo.length - 1;
  const respuesta = await fetch(sesion, {
    method: "PUT",
    redirect: "manual",
    headers: { "Content-Range": `bytes ${desde}-${hasta}/${total}`, "Content-Type": "application/octet-stream" },
    body: cuerpo,
  });
  if (respuesta.status === 308) return { completo: false };
  if (respuesta.status === 200 || respuesta.status === 201) return { completo: true };
  const texto = await respuesta.text().catch(() => "");
  console.error("Drive (trozo):", respuesta.status, texto.slice(0, 300));
  throw new ErrorDrive(502, `Google Drive rechazó el trozo (${respuesta.status}).`);
};

// ---------- Lectura y borrado ----------
// Solo existen para la app los archivos que ella creó: llevan `acrodocs` en sus propiedades.
export const metadatos = async (id) => {
  const respuesta = await comprobar(await llamar(
    `${API}/files/${encodeURIComponent(id)}?fields=${encodeURIComponent("id,name,size,mimeType,trashed,appProperties")}`,
  ), "leer el archivo");
  const archivo = await respuesta.json();
  if (archivo.trashed || archivo.appProperties?.acrodocs !== "1") throw new ErrorDrive(404, "El archivo no existe en Drive.");
  return {
    id: archivo.id, nombre: archivo.name, mime: archivo.mimeType, tamano: Number(archivo.size || 0),
    propiedades: archivo.appProperties,
  };
};

export const leerRango = async (id, desde, hasta) => {
  const respuesta = await comprobar(await llamar(`${API}/files/${encodeURIComponent(id)}?alt=media`, {
    headers: { Range: `bytes=${desde}-${hasta}` },
  }), "descargar el archivo");
  return Buffer.from(await respuesta.arrayBuffer());
};

// A la papelera de Drive (se puede recuperar 30 días), no borrado definitivo.
export const aPapelera = async (id) => {
  await comprobar(await llamar(`${API}/files/${encodeURIComponent(id)}?fields=id`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }),
  }), "eliminar el archivo");
};
