// Motor del visor: apila páginas (de un PDF o una imagen) en un contenedor con scroll, con zoom,
// pellizco de dos dedos y dibujo perezoso. No sabe de React ni de pdf.js: quien lo usa le da una función
// `pintar(indice, anchoPx, senal)` que devuelve el elemento ya dibujado (un canvas, una imagen).
//
// Pensado para celulares con poca memoria:
// - solo se dibujan las páginas visibles (más media pantalla de margen); las demás se liberan;
// - se dibuja una página a la vez, la más cercana al centro de la pantalla primero;
// - el pellizco solo escala con CSS mientras dura el gesto y se vuelve a dibujar una vez al soltar;
// - el tamaño del canvas tiene tope (escalaDeRender, lo aplica quien dibuja), así que un zoom alto no agota la memoria.
import { limitarZoom, ZOOM_MAX, ZOOM_MIN } from "./visor.js";

const PASOS_ZOOM = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
const SEPARACION_REL = 0.013; // separación entre páginas, como fracción de su ancho: así el diseño es lineal con el zoom
const MARGEN_LADO = 8; // píxeles
const MARGEN_VISIBLE = 0.5; // pantallas, arriba y abajo, que se mantienen dibujadas

const liberarElemento = (el) => {
  if (!el) return;
  if (typeof HTMLCanvasElement !== "undefined" && el instanceof HTMLCanvasElement) {
    el.width = 0;
    el.height = 0;
  }
  el.remove();
};

// opciones:
//   contenedor   elemento con scroll (overflow: auto)
//   numPaginas, tamano1 {ancho, alto} (en puntos; las demás páginas se ajustan al dibujarse).
//   Todas las páginas se muestran al mismo ancho (un plano apaisado no obliga a mover la pantalla de lado).
//   pintar(i, anchoPx, senal) → Promise<{ elemento, ancho, alto } | null>: dibuja la página i para mostrarla a
//                anchoPx píxeles CSS de ancho (null si se canceló con `senal`); ancho/alto = tamaño real en puntos
//   ajuste       "ancho" (PDF) | "pantalla" (imágenes: cabe entera); ajusteMax: píxeles CSS por punto máximos
//   alCambiar({ pagina, total, zoom }), alError(error, indice)
export const crearLienzo = ({
  contenedor, numPaginas, tamano1, pintar, ajuste = "ancho", ajusteMax = Infinity, alCambiar, alError,
}) => {
  const contenido = document.createElement("div");
  contenido.className = "lienzo-contenido";
  contenedor.appendChild(contenido);

  const paginas = Array.from({ length: numPaginas }, (_, i) => {
    const el = document.createElement("div");
    el.className = "lienzo-pagina";
    contenido.appendChild(el);
    return { i, el, ancho: tamano1.ancho, alto: tamano1.alto, altoPx: 0, top: 0, elemento: null, anchoPintado: 0, ctl: null };
  });

  let zoom = 1; // relativo a «ajustar»
  let anchoPx = 1; // ancho en píxeles CSS de cada página con el zoom actual
  let destruido = false;
  let pellizco = null;
  let cuadro = 0;
  let ultimo = "";
  const cola = new Set();
  let procesando = false;

  // Ancho en píxeles CSS de una página con zoom 1: el ancho útil de la pantalla; en imágenes, lo que deje
  // caber la imagen entera (sin pasar de su tamaño real).
  const anchoAjustado = () => {
    let ancho = Math.max(80, contenedor.clientWidth - 2 * MARGEN_LADO);
    if (ajuste === "pantalla") {
      const alto = Math.max(80, contenedor.clientHeight - 2 * SEPARACION_REL * ancho);
      ancho = Math.min(ancho, (alto * tamano1.ancho) / tamano1.alto);
    }
    return Math.min(ancho, ajusteMax * tamano1.ancho);
  };

  // Calcula el tamaño y la posición de cada página con el zoom actual. Devuelve cuánto cambió el ancho.
  const distribuir = () => {
    const anterior = anchoPx;
    anchoPx = anchoAjustado() * zoom;
    const separacion = SEPARACION_REL * anchoPx;
    contenido.style.padding = `${separacion}px ${MARGEN_LADO}px 0`;
    let y = separacion;
    for (const p of paginas) {
      p.altoPx = (p.alto * anchoPx) / p.ancho;
      p.el.style.width = `${anchoPx}px`;
      p.el.style.height = `${p.altoPx}px`;
      p.el.style.marginBottom = `${separacion}px`;
      p.top = y;
      y += p.altoPx + separacion;
    }
    return anchoPx / anterior;
  };

  const abortarDibujos = () => paginas.forEach((p) => p.ctl?.abort());

  const soltar = (p) => {
    p.ctl?.abort();
    cola.delete(p);
    if (p.elemento) {
      liberarElemento(p.elemento);
      p.elemento = null;
      p.anchoPintado = 0;
    }
  };

  // ¿La página ya está dibujada al ancho actual (con 2 % de tolerancia)?
  const alDia = (p) => Boolean(p.elemento) && Math.abs(p.anchoPintado - anchoPx) / anchoPx < 0.02;
  const esVisible = (p) => {
    const margen = contenedor.clientHeight * MARGEN_VISIBLE;
    const desde = contenedor.scrollTop - margen;
    const hasta = contenedor.scrollTop + contenedor.clientHeight + margen;
    return p.top + p.altoPx > desde && p.top < hasta;
  };

  const paginaActual = () => {
    const ref = contenedor.scrollTop + contenedor.clientHeight / 3;
    let actual = 1;
    for (const p of paginas) {
      if (p.top <= ref) actual = p.i + 1;
      else break;
    }
    return actual;
  };

  const emitir = () => {
    const estado = { pagina: paginaActual(), total: numPaginas, zoom };
    const firma = `${estado.pagina}|${estado.zoom.toFixed(3)}`;
    if (firma === ultimo) return;
    ultimo = firma;
    alCambiar?.(estado);
  };

  const pintarPagina = async (p) => {
    if (alDia(p)) return;
    const ancho = anchoPx;
    p.ctl?.abort();
    const ctl = new AbortController();
    p.ctl = ctl;
    try {
      const r = await pintar(p.i, ancho, ctl.signal);
      if (!r) return;
      if (ctl.signal.aborted || destruido) {
        if (r.elemento !== p.elemento) liberarElemento(r.elemento);
        return;
      }
      if (p.elemento && p.elemento !== r.elemento) liberarElemento(p.elemento);
      p.elemento = r.elemento;
      p.anchoPintado = ancho;
      p.el.replaceChildren(r.elemento);
      if (r.ancho && (Math.abs(r.ancho - p.ancho) > 0.5 || Math.abs(r.alto - p.alto) > 0.5)) corregirTamano(p, r.ancho, r.alto);
    } catch (error) {
      if (!ctl.signal.aborted && !destruido) {
        p.el.textContent = "No se pudo dibujar esta página.";
        p.el.classList.add("lienzo-error");
        alError?.(error, p.i);
      }
    } finally {
      if (p.ctl === ctl) p.ctl = null;
    }
  };

  // Una página real de otro tamaño que la primera (un plano apaisado, por ejemplo): se reacomoda sin que el
  // contenido que se está leyendo salte de lugar.
  const corregirTamano = (p, ancho, alto) => {
    const alturaAntes = p.altoPx;
    const arribaDeLaPantalla = p.top + alturaAntes <= contenedor.scrollTop;
    p.ancho = ancho;
    p.alto = alto;
    distribuir();
    if (arribaDeLaPantalla) contenedor.scrollTop += p.altoPx - alturaAntes;
  };

  const procesar = async () => {
    if (procesando) return;
    procesando = true;
    try {
      while (!destruido) {
        const centro = contenedor.scrollTop + contenedor.clientHeight / 2;
        let mejor = null;
        let distancia = Infinity;
        for (const p of cola) {
          const d = Math.abs(p.top + p.altoPx / 2 - centro);
          if (d < distancia) { mejor = p; distancia = d; }
        }
        if (!mejor) break;
        cola.delete(mejor);
        if (esVisible(mejor)) await pintarPagina(mejor);
      }
    } finally {
      procesando = false;
    }
  };

  const actualizar = () => {
    if (destruido || pellizco) return;
    for (const p of paginas) {
      if (esVisible(p)) {
        if (!alDia(p)) cola.add(p);
      } else if (p.elemento || p.ctl) {
        soltar(p);
      }
    }
    emitir();
    if (cola.size) procesar();
  };

  const alScroll = () => {
    if (cuadro) return;
    cuadro = requestAnimationFrame(() => { cuadro = 0; actualizar(); });
  };

  // `anclaX/Y`: punto de la pantalla (relativo al contenedor) que debe quedarse quieto al cambiar el zoom.
  const fijarZoom = (nuevo, anclaX, anclaY) => {
    const z = limitarZoom(nuevo);
    const ax = anclaX ?? contenedor.clientWidth / 2;
    const ay = anclaY ?? contenedor.clientHeight / 2;
    const sl = contenedor.scrollLeft;
    const st = contenedor.scrollTop;
    zoom = z;
    abortarDibujos();
    const r = distribuir() || 1;
    contenedor.scrollLeft = (sl + ax) * r - ax;
    contenedor.scrollTop = (st + ay) * r - ay;
    actualizar();
  };

  // ── Pellizco con dos dedos ──
  const distancia = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const centroDedos = (t) => {
    const r = contenedor.getBoundingClientRect();
    return { x: (t[0].clientX + t[1].clientX) / 2 - r.left, y: (t[0].clientY + t[1].clientY) / 2 - r.top };
  };

  const alTocar = (e) => {
    if (e.touches.length !== 2) return;
    const c = centroDedos(e.touches);
    pellizco = {
      d0: distancia(e.touches), zoom0: zoom, sl0: contenedor.scrollLeft, st0: contenedor.scrollTop,
      x0: c.x, y0: c.y, s: 1, x: c.x, y: c.y,
    };
    contenido.style.transformOrigin = "0 0";
    contenido.style.willChange = "transform";
  };

  const alMover = (e) => {
    if (!pellizco || e.touches.length !== 2) return;
    e.preventDefault();
    const bruto = distancia(e.touches) / pellizco.d0;
    const s = Math.min(ZOOM_MAX / pellizco.zoom0, Math.max(ZOOM_MIN / pellizco.zoom0, bruto));
    const c = centroDedos(e.touches);
    contenido.style.transform = `scale(${s})`;
    contenedor.scrollLeft = (pellizco.sl0 + pellizco.x0) * s - c.x;
    contenedor.scrollTop = (pellizco.st0 + pellizco.y0) * s - c.y;
    Object.assign(pellizco, { s, x: c.x, y: c.y });
  };

  const alSoltar = (e) => {
    if (!pellizco || e.touches.length >= 2) return;
    const { s, zoom0, sl0, st0, x0, y0, x, y } = pellizco;
    pellizco = null;
    contenido.style.transform = "";
    contenido.style.willChange = "";
    contenido.style.transformOrigin = "";
    zoom = limitarZoom(zoom0 * s);
    abortarDibujos();
    distribuir();
    contenedor.scrollLeft = (sl0 + x0) * s - x;
    contenedor.scrollTop = (st0 + y0) * s - y;
    actualizar();
  };

  contenedor.addEventListener("scroll", alScroll, { passive: true });
  contenedor.addEventListener("touchstart", alTocar, { passive: true });
  contenedor.addEventListener("touchmove", alMover, { passive: false });
  contenedor.addEventListener("touchend", alSoltar, { passive: true });
  contenedor.addEventListener("touchcancel", alSoltar, { passive: true });

  let anchoPrevio = contenedor.clientWidth;
  const observador = typeof ResizeObserver !== "undefined"
    ? new ResizeObserver(() => {
      if (destruido || pellizco || !contenedor.clientWidth) return;
      const cambioAncho = contenedor.clientWidth !== anchoPrevio;
      anchoPrevio = contenedor.clientWidth;
      // Al cambiar el ancho (girar el celular) se vuelve a calcular la escala; si solo cambió el alto basta con dibujar lo que se ve.
      if (cambioAncho || ajuste === "pantalla") {
        const st = contenedor.scrollTop;
        abortarDibujos();
        const r = distribuir() || 1;
        contenedor.scrollTop = st * r;
      }
      actualizar();
    })
    : null;
  observador?.observe(contenedor);

  distribuir();
  actualizar();

  return {
    zoomActual: () => zoom,
    acercar: () => fijarZoom(PASOS_ZOOM.find((z) => z > zoom + 0.001) ?? ZOOM_MAX),
    alejar: () => fijarZoom([...PASOS_ZOOM].reverse().find((z) => z < zoom - 0.001) ?? ZOOM_MIN),
    ajustar: () => fijarZoom(1),
    irAPagina: (n) => {
      const p = paginas[Math.min(numPaginas, Math.max(1, Math.round(n) || 1)) - 1];
      contenedor.scrollTop = p.i === 0 ? 0 : p.top - SEPARACION_REL * anchoPx;
    },
    destruir: () => {
      if (destruido) return;
      destruido = true;
      observador?.disconnect();
      if (cuadro) cancelAnimationFrame(cuadro);
      contenedor.removeEventListener("scroll", alScroll);
      contenedor.removeEventListener("touchstart", alTocar);
      contenedor.removeEventListener("touchmove", alMover);
      contenedor.removeEventListener("touchend", alSoltar);
      contenedor.removeEventListener("touchcancel", alSoltar);
      paginas.forEach(soltar);
      cola.clear();
      contenido.remove();
    },
  };
};
