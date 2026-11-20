// Drive y servidor falsos para probar la subida y la descarga de archivos sin tocar Google.
// El servidor real (api/archivos.js) corre completo; solo se reemplazan Drive y las consultas a Supabase.
import * as real from "../../../api/_drive.js";

export const crearDriveFalso = () => {
  const archivos = new Map(); // id -> { id, nombre, mime, tamano, propiedades, bytes }
  const pendientes = new Map(); // sesión -> subida en curso
  const carpetas = [];
  let contador = 0;

  const completar = (sesion) => {
    const p = pendientes.get(sesion);
    archivos.set(p.archivoId, { id: p.archivoId, nombre: p.nombre, mime: p.mime, tamano: p.bytes.length, propiedades: p.propiedades, bytes: p.bytes });
    pendientes.delete(sesion);
  };

  return {
    ErrorDrive: real.ErrorDrive,
    limpiarNombre: real.limpiarNombre,
    TROZO_DESCARGA: real.TROZO_DESCARGA,
    configurado: () => true,
    archivos, pendientes, carpetas, completar,
    carpetaDestino: async (destino) => { carpetas.push(destino); return `carpeta-${carpetas.length}`; },
    iniciarSubida: async ({ nombre, mime, tamano, carpeta, propiedades, origen }) => {
      contador += 1;
      const archivoId = `drive-${contador}`;
      const sesion = `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=s${contador}`;
      pendientes.set(sesion, { archivoId, nombre, mime, tamano, carpeta, propiedades, origen, bytes: Buffer.alloc(0) });
      return { archivoId, sesion };
    },
    enviarTrozo: async ({ sesion, desde, total, cuerpo }) => {
      const p = pendientes.get(sesion);
      if (!p || desde !== p.bytes.length) throw new real.ErrorDrive(502, "Google Drive rechazó el trozo (400).");
      p.bytes = Buffer.concat([p.bytes, cuerpo]);
      if (p.bytes.length < total) return { completo: false };
      completar(sesion);
      return { completo: true };
    },
    metadatos: async (id) => {
      const a = archivos.get(id);
      if (!a) throw new real.ErrorDrive(404, "El archivo no existe en Drive.");
      return { id: a.id, nombre: a.nombre, mime: a.mime, tamano: a.tamano, propiedades: a.propiedades };
    },
    leerRango: async (id, desde, hasta) => archivos.get(id).bytes.subarray(desde, hasta + 1),
    aPapelera: async (id) => { archivos.delete(id); },
  };
};

// Usuario falso: `permisos` son las claves que tiene y `contratos` los ids de contrato que ve.
export const autenticarFalso = ({ id = "u1", permisos = [], contratos = [], hitos = {} } = {}) => async () => ({
  usuario: { id },
  tienePermiso: async (p) => permisos.includes(p),
  contrato: async (t) => (contratos.includes(t) ? { id: t, nombre: `${t} - Contrato` } : null),
  hito: async (_tramite, h) => hitos[h] ?? null,
});

// fetch falso: las llamadas a /api/archivos van al manejador real; la subida directa a Google la decide
// `directo(sesion, cuerpo)` (por defecto, funciona; lanza TypeError para simular el bloqueo CORS).
export const fetchFalso = ({ manejador, directo, alResponder }) => async (url, init = {}) => {
  const texto = String(url);
  if (!texto.startsWith("/api/archivos")) {
    const cuerpo = Buffer.from(await init.body.arrayBuffer());
    await directo(texto, cuerpo);
    return new Response("{}", { status: 200 });
  }
  const cabeceras = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
  let body = init.body;
  if (typeof body === "string") body = JSON.parse(body);
  else if (body) body = Buffer.from(await body.arrayBuffer());
  const req = { method: init.method, query: Object.fromEntries(new URL(texto, "http://localhost").searchParams), headers: cabeceras, body };
  const res = {
    estado: 200,
    cabeceras: {},
    cuerpo: Buffer.alloc(0),
    status(n) { this.estado = n; return this; },
    setHeader(k, v) { this.cabeceras[k] = v; },
    json(o) { this.cabeceras["Content-Type"] = "application/json"; this.cuerpo = Buffer.from(JSON.stringify(o)); return this; },
    end(b) { this.cuerpo = b ?? Buffer.alloc(0); return this; },
  };
  await manejador(req, res);
  alResponder?.(res);
  return new Response(res.cuerpo, { status: res.estado, headers: res.cabeceras });
};
