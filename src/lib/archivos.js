// Almacenamiento local de archivos para el demo.
// Los metadatos (nombre, tamaño, tipo) viven en localStorage junto con el
// expediente; el contenido binario se guarda en IndexedDB para no reventar
// la cuota de localStorage. En producción esto se reemplaza por Supabase
// Storage o S3, conservando los mismos metadatos.

const DB_NAME = "acrodocs_archivos";
const STORE = "archivos";
const VERSION = 2;

let dbPromise = null;

const abrirDB = () => {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Este navegador no soporta IndexedDB."));
      return;
    }
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("No se pudo abrir el almacén de archivos."));
  });
  return dbPromise;
};

const transaccion = async (modo, operacion) => {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, modo);
    const store = tx.objectStore(STORE);
    let resultado;
    try {
      resultado = operacion(store);
    } catch (error) {
      reject(error);
      return;
    }
    tx.oncomplete = () => resolve(resultado?.result ?? resultado);
    tx.onerror = () => reject(tx.error || new Error("Error de almacenamiento."));
    tx.onabort = () => reject(tx.error || new Error("Operación cancelada."));
  });
};

const uid = () =>
  (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : `file-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const fechaLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const guardarArchivo = async (file, meta = {}) => {
  if (!file) throw new Error("No se seleccionó ningún archivo.");
  const id = uid();
  const registro = {
    id,
    nombre: meta.nombre || file.name,
    mime: file.type || "application/octet-stream",
    tamano: file.size || 0,
    fecha: fechaLocal(),
    tramiteId: meta.tramiteId || "",
    tareaId: meta.tareaId || "",
    tipoDoc: meta.tipoDoc || "Otros",
    blob: file,
  };
  await transaccion("readwrite", (store) => store.put(registro));
  return {
    id,
    archivoId: id,
    nombre: registro.nombre,
    mime: registro.mime,
    tamano: registro.tamano,
    fecha: registro.fecha,
    tipoDoc: registro.tipoDoc,
  };
};

export const obtenerArchivo = async (id) => {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
};

export const eliminarArchivo = async (id) => {
  if (!id) return;
  await transaccion("readwrite", (store) => store.delete(id));
};

const descargarBlob = (blob, nombre) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre || "documento";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
};

export const descargarArchivo = async (id, nombreSugerido) => {
  const registro = await obtenerArchivo(id);
  if (!registro?.blob) throw new Error("El archivo ya no está disponible en este navegador.");
  descargarBlob(registro.blob, nombreSugerido || registro.nombre || "documento");
};

export const descargarTexto = (texto, nombre) => {
  descargarBlob(new Blob([texto], { type: "application/json;charset=utf-8" }), nombre);
};

// ZIP mínimo sin compresión. Evita depender de librerías externas y, sobre
// todo, evita que el navegador bloquee varias descargas automáticas seguidas.
const TABLA_CRC = (() => {
  const tabla = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    tabla[n] = c >>> 0;
  }
  return tabla;
})();

const crc32 = (bytes) => {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i += 1) c = TABLA_CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
};

const fechaZip = () => {
  const d = new Date();
  return {
    hora: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    fecha: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
};

export const descargarComoZip = async (docs = [], nombreZip = "documentos.zip", prefijo = "") => {
  const listas = docs.filter((d) => d?.archivoId);
  if (!listas.length) throw new Error("No hay archivos para descargar.");
  const { hora, fecha } = fechaZip();
  const localParts = [];
  const centrales = [];
  let offset = 0;

  for (const doc of listas) {
    const registro = await obtenerArchivo(doc.archivoId);
    if (!registro?.blob) continue;
    const nombre = `${prefijo}${doc.nombre || registro.nombre || "documento"}`;
    const datos = new Uint8Array(await registro.blob.arrayBuffer());
    const crc = crc32(datos);
    const nombreBytes = new TextEncoder().encode(nombre);
    const cabecera = new Uint8Array(30 + nombreBytes.length);
    const vista = new DataView(cabecera.buffer);
    vista.setUint32(0, 0x04034b50, true);
    vista.setUint16(4, 20, true);
    vista.setUint16(6, 0x0800, true);
    vista.setUint16(8, 0, true);
    vista.setUint16(10, hora, true);
    vista.setUint16(12, fecha, true);
    vista.setUint32(14, crc, true);
    vista.setUint32(18, datos.length, true);
    vista.setUint32(22, datos.length, true);
    vista.setUint16(26, nombreBytes.length, true);
    vista.setUint16(28, 0, true);
    cabecera.set(nombreBytes, 30);
    localParts.push(cabecera, datos);

    const central = new Uint8Array(46 + nombreBytes.length);
    const vc = new DataView(central.buffer);
    vc.setUint32(0, 0x02014b50, true);
    vc.setUint16(4, 20, true);
    vc.setUint16(6, 20, true);
    vc.setUint16(8, 0x0800, true);
    vc.setUint16(10, 0, true);
    vc.setUint16(12, hora, true);
    vc.setUint16(14, fecha, true);
    vc.setUint32(16, crc, true);
    vc.setUint32(20, datos.length, true);
    vc.setUint32(24, datos.length, true);
    vc.setUint16(28, nombreBytes.length, true);
    vc.setUint16(30, 0, true);
    vc.setUint16(32, 0, true);
    vc.setUint16(34, 0, true);
    vc.setUint16(36, 0, true);
    vc.setUint32(38, 0, true);
    vc.setUint32(42, offset, true);
    central.set(nombreBytes, 46);
    centrales.push(central);
    offset += cabecera.length + datos.length;
  }

  if (!centrales.length) throw new Error("Los archivos ya no están disponibles en este navegador.");
  const tamanoCentral = centrales.reduce((n, c) => n + c.length, 0);
  const fin = new Uint8Array(22);
  const vf = new DataView(fin.buffer);
  vf.setUint32(0, 0x06054b50, true);
  vf.setUint16(4, 0, true);
  vf.setUint16(6, 0, true);
  vf.setUint16(8, centrales.length, true);
  vf.setUint16(10, centrales.length, true);
  vf.setUint32(12, tamanoCentral, true);
  vf.setUint32(16, offset, true);
  vf.setUint16(20, 0, true);

  descargarBlob(new Blob([...localParts, ...centrales, fin], { type: "application/zip" }), nombreZip);
};

export const formatearTamano = (bytes) => {
  const n = Number(bytes || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

export const iconoArchivo = (mime = "", nombre = "") => {
  const ext = String(nombre).split(".").pop()?.toUpperCase() || "";
  if (mime.includes("pdf") || ext === "PDF") return "PDF";
  if (mime.startsWith("image/")) return "IMG";
  if (mime.includes("sheet") || ["XLS", "XLSX", "CSV"].includes(ext)) return "XLS";
  if (mime.includes("word") || ["DOC", "DOCX"].includes(ext)) return "DOC";
  if (mime.includes("zip") || ["ZIP", "RAR", "7Z"].includes(ext)) return "ZIP";
  return ext.slice(0, 3) || "DOC";
};
