// pdf.js para el visor. Todo se carga con import() dinámico: la librería (y su worker, que es otro archivo
// aparte) solo se descarga cuando alguien abre un PDF. Se usa la versión «legacy» de pdf.js, que funciona
// también en navegadores de Android algo antiguos.
//
// Los datos auxiliares de pdf.js (fuentes estándar, perfiles ICC y los .wasm para imágenes JBIG2/JPEG2000
// de escáneres) se sirven desde /pdfjs/ (ver recursosPdfjs en vite.config.js) y solo se piden si el PDF
// los necesita.

import { escalaDeRender } from "./visor.js";

let pdfjsPromesa = null;

const cargarPdfjs = () => {
  if (!pdfjsPromesa) {
    pdfjsPromesa = Promise.all([
      import("pdfjs-dist/legacy/build/pdf.mjs"),
      import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
    ]).then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    }).catch((error) => {
      pdfjsPromesa = null; // sin conexión: la próxima vez se vuelve a intentar
      throw error;
    });
  }
  return pdfjsPromesa;
};

// Abre un PDF desde un Blob. Devuelve { numPaginas, tamano1, pintar, destruir }; ver crearLienzo (lienzo.js).
// `destruir` termina el worker de pdf.js y libera todo lo que tenía en memoria.
export const abrirPdf = async (blob) => {
  const pdfjs = await cargarPdfjs();
  const base = `${import.meta.env.BASE_URL || "/"}pdfjs/`;
  const datos = new Uint8Array(await blob.arrayBuffer());
  const tarea = pdfjs.getDocument({
    data: datos,
    isEvalSupported: false,
    wasmUrl: `${base}wasm/`,
    standardFontDataUrl: `${base}standard_fonts/`,
    iccUrl: `${base}iccs/`,
  });
  let pdf;
  try {
    pdf = await tarea.promise;
  } catch (error) {
    tarea.destroy().catch(() => {});
    throw error;
  }

  const primera = await pdf.getPage(1);
  const vista1 = primera.getViewport({ scale: 1 });
  primera.cleanup();

  // Dibuja la página para mostrarla a `anchoPx` píxeles CSS de ancho, con la nitidez de la pantalla pero con
  // tope de píxeles (escalaDeRender) para no agotar la memoria del celular.
  const pintar = async (indice, anchoPx, senal) => {
    if (senal.aborted) return null;
    const pagina = await pdf.getPage(indice + 1);
    try {
      if (senal.aborted) return null;
      const base1 = pagina.getViewport({ scale: 1 });
      const escala = escalaDeRender({ k: anchoPx / base1.width, dpr: window.devicePixelRatio || 1, ancho: base1.width, alto: base1.height });
      const vista = pagina.getViewport({ scale: escala });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(vista.width));
      canvas.height = Math.max(1, Math.round(vista.height));
      const trabajo = pagina.render({ canvas, viewport: vista });
      const cancelar = () => trabajo.cancel();
      senal.addEventListener("abort", cancelar, { once: true });
      try {
        await trabajo.promise;
      } catch (error) {
        canvas.width = 0;
        canvas.height = 0;
        if (senal.aborted || error?.name === "RenderingCancelledException") return null;
        throw error;
      } finally {
        senal.removeEventListener("abort", cancelar);
      }
      return { elemento: canvas, ancho: base1.width, alto: base1.height };
    } finally {
      pagina.cleanup();
    }
  };

  return {
    numPaginas: pdf.numPages,
    tamano1: { ancho: vista1.width, alto: vista1.height },
    pintar,
    destruir: () => tarea.destroy().catch(() => {}),
  };
};
