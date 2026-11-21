// Visor de archivos: decisiones puras (qué visor usar, qué escala es segura) y el estado de «qué archivo
// está abierto». El dibujo vive en lienzo.js (motor de zoom y páginas), pdfRender.js (pdf.js) y
// components/VisorArchivo.jsx (la ventana).

const MIME_IMAGEN = new Set(["image/jpeg", "image/jpg", "image/pjpeg", "image/png", "image/webp", "image/gif"]);
const EXT_IMAGEN = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

// "pdf" | "imagen" | "otro". El tipo MIME manda; si falta o no dice nada, se usa la extensión del nombre.
export const tipoVisor = (mime = "", nombre = "") => {
  const m = String(mime || "").toLowerCase().split(";")[0].trim();
  const ext = (String(nombre || "").toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || "";
  if (m === "application/pdf" || m === "application/x-pdf") return "pdf";
  if (MIME_IMAGEN.has(m)) return "imagen";
  if (ext === "pdf") return "pdf";
  if (EXT_IMAGEN.has(ext)) return "imagen";
  return "otro";
};

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 4;
export const limitarZoom = (z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(z) || 1));

// Un canvas de 3 millones de píxeles pesa unos 12 MB: con dos o tres páginas visibles a la vez un celular
// modesto aguanta; por encima de eso el navegador de Android corta la pestaña con «Memoria insuficiente».
export const PIXELES_MAX_CANVAS = 3_000_000;
export const DPR_MAX = 2;

// El tope sube en equipos con más memoria (Chrome informa navigator.deviceMemory: 0,25 a 8 GB). Donde no se
// sabe, como en un celular cuyo navegador no lo informa, se queda en el valor prudente.
export const pixelesMaxCanvas = () => {
  const gb = typeof navigator !== "undefined" ? Number(navigator.deviceMemory) || 0 : 0;
  if (gb >= 8) return 3 * PIXELES_MAX_CANVAS;
  if (gb >= 4) return 2 * PIXELES_MAX_CANVAS;
  return PIXELES_MAX_CANVAS;
};

// Escala con la que pdf.js debe dibujar una página para mostrarla a `k` píxeles CSS por punto: la nitidez
// de la pantalla (limitada) sin pasar del tope de píxeles. Si el zoom pide más, la página se dibuja más
// borrosa en vez de agotar la memoria; el navegador la estira.
export const escalaDeRender = ({ k, dpr = 1, ancho, alto, maxPixeles = pixelesMaxCanvas() }) => {
  let escala = k * Math.min(Math.max(dpr, 1), DPR_MAX);
  const pixeles = ancho * escala * alto * escala;
  if (pixeles > maxPixeles) escala *= Math.sqrt(maxPixeles / pixeles);
  return escala;
};

// ── Archivo abierto en el visor (un solo visor para toda la app) ──────────────────────────────────────
let abierto = null;
const oyentes = new Set();

// archivo: { id, nombre, mime }. `id` es el archivoId (Drive en modo nube, IndexedDB en modo local).
export const abrirVisor = (archivo) => {
  if (!archivo?.id) return;
  abierto = { id: archivo.id, nombre: archivo.nombre || "", mime: archivo.mime || "" };
  oyentes.forEach((fn) => fn());
};

export const cerrarVisor = () => {
  if (!abierto) return;
  abierto = null;
  oyentes.forEach((fn) => fn());
};

export const archivoEnVisor = () => abierto;

export const suscribirVisor = (fn) => {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
};
