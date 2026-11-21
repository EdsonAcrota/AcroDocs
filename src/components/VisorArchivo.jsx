import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { abrirVisor, archivoEnVisor, cerrarVisor, suscribirVisor, tipoVisor } from "../lib/visor.js";
import { descargarArchivo, descargarBlob, formatearTamano, obtenerParaVer } from "../lib/archivos.js";
import { crearLienzo } from "../lib/lienzo.js";
import { abrirPdf } from "../lib/pdfRender.js";

// Botón «Ver» de cada archivo. El que lo muestre decide con `permiso.descargar` si lo pone o no.
export function BotonVer({ archivoId, nombre, mime, className = "btn mini" }) {
  if (!archivoId) return null;
  return (
    <button type="button" className={className} onClick={() => abrirVisor({ id: archivoId, nombre, mime })}>Ver</button>
  );
}

// Se monta una sola vez en App y muestra el archivo que pidió abrirVisor().
export default function VisorArchivo() {
  const archivo = useSyncExternalStore(suscribirVisor, archivoEnVisor);
  return archivo ? <Ventana key={archivo.id} archivo={archivo} /> : null;
}

const cargarImagen = (blob) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.alt = "";
  img.decoding = "async";
  img.onload = () => resolve({ img, url, ancho: img.naturalWidth, alto: img.naturalHeight });
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("No se pudo leer la imagen.")); };
  img.src = url;
});

const mensajeDeError = (error, tipo) => {
  if (error?.name === "PasswordException") return "Este PDF está protegido con contraseña y no se puede mostrar aquí. Usa «Descargar» para abrirlo en otra aplicación.";
  if (tipo === "pdf") return "No se pudo abrir el PDF (puede estar dañado o faltar conexión para cargar el visor). Usa «Descargar» para abrirlo en otra aplicación.";
  return "No se pudo mostrar la imagen. Usa «Descargar» para abrirla en otra aplicación.";
};

function Ventana({ archivo }) {
  const tipo = tipoVisor(archivo.mime, archivo.nombre);
  const [fase, setFase] = useState(tipo === "otro" ? "sin-vista" : "cargando");
  const [progreso, setProgreso] = useState(null);
  const [error, setError] = useState("");
  const [blob, setBlob] = useState(null);

  useEffect(() => {
    const alTeclado = (e) => { if (e.key === "Escape") cerrarVisor(); };
    document.addEventListener("keydown", alTeclado);
    return () => document.removeEventListener("keydown", alTeclado);
  }, []);

  // Baja el archivo (de Drive o del navegador). Un tipo sin vista previa no se descarga hasta que se pida.
  useEffect(() => {
    if (tipo === "otro") return undefined;
    const ctl = new AbortController();
    (async () => {
      try {
        const r = await obtenerParaVer(archivo.id, { senal: ctl.signal, alProgreso: (recibido, total) => setProgreso({ recibido, total }) });
        if (ctl.signal.aborted) return;
        setBlob(r.blob);
        setFase("listo");
      } catch (e) {
        if (ctl.signal.aborted) return;
        setError(e?.message || "No se pudo abrir el archivo.");
        setFase("error");
      }
    })();
    return () => ctl.abort();
  }, [archivo.id, tipo]);

  const descargar = async () => {
    try {
      if (blob) descargarBlob(blob, archivo.nombre || "documento");
      else await descargarArchivo(archivo.id, archivo.nombre);
    } catch (e) {
      setError(e?.message || "No se pudo descargar el archivo.");
    }
  };

  return (
    <div className="modal-fondo visor-fondo" onClick={(e) => e.target === e.currentTarget && cerrarVisor()}>
      <div className="modal modal-visor" role="dialog" aria-modal="true" aria-label={`Vista de ${archivo.nombre || "archivo"}`}>
        <div className="modal-cab visor-cab">
          <h3 title={archivo.nombre}>{archivo.nombre || "Archivo"}</h3>
          <div className="visor-acciones">
            <button type="button" className="btn mini" onClick={descargar}>Descargar</button>
            <button type="button" className="cerrar" aria-label="Cerrar" onClick={cerrarVisor}>×</button>
          </div>
        </div>

        {fase === "cargando" && (
          <div className="visor-estado" role="status">
            <span className="visor-giro" aria-hidden="true" />
            <span>
              Descargando…
              {progreso ? ` ${formatearTamano(progreso.recibido)} de ${formatearTamano(progreso.total)}` : ""}
            </span>
          </div>
        )}
        {fase === "sin-vista" && (
          <div className="visor-estado">
            <strong>No hay vista previa para este tipo de archivo.</strong>
            <span>Los documentos de Word, Excel y otros formatos se abren en tu equipo: descárgalo para verlo.</span>
            <button type="button" className="btn primario" onClick={descargar}>Descargar</button>
            {error && <div className="alerta">{error}</div>}
          </div>
        )}
        {fase === "error" && <div className="visor-estado"><div className="alerta">{error}</div></div>}
        {fase === "listo" && error && <div className="alerta visor-alerta">{error}</div>}
        {fase === "listo" && <Lienzo blob={blob} tipo={tipo} />}
      </div>
    </div>
  );
}

// Barra de zoom y páginas más el área con scroll donde dibuja crearLienzo().
function Lienzo({ blob, tipo }) {
  const marco = useRef(null);
  const api = useRef(null);
  const [fase, setFase] = useState("abriendo");
  const [mensaje, setMensaje] = useState("");
  const [vista, setVista] = useState({ pagina: 1, total: 0, zoom: 1 });
  const [entrada, setEntrada] = useState(null);

  useEffect(() => {
    let vivo = true;
    let fuente = null;
    let lienzo = null;
    let imagen = null;
    (async () => {
      try {
        if (tipo === "pdf") {
          fuente = await abrirPdf(blob);
          if (!vivo) { fuente.destruir(); return; }
          lienzo = crearLienzo({
            contenedor: marco.current, numPaginas: fuente.numPaginas, tamano1: fuente.tamano1,
            pintar: fuente.pintar, alCambiar: setVista,
          });
        } else {
          imagen = await cargarImagen(blob);
          if (!vivo) { URL.revokeObjectURL(imagen.url); imagen = null; return; }
          // Las fotos se muestran a su tamaño real como máximo y enteras en pantalla; con zoom se acercan.
          lienzo = crearLienzo({
            contenedor: marco.current, numPaginas: 1, tamano1: { ancho: imagen.ancho, alto: imagen.alto },
            ajuste: "pantalla", ajusteMax: 1, alCambiar: setVista,
            pintar: async () => ({ elemento: imagen.img, ancho: imagen.ancho, alto: imagen.alto }),
          });
        }
        api.current = lienzo;
        setFase("listo");
        marco.current?.focus({ preventScroll: true });
      } catch (e) {
        if (!vivo) return;
        setMensaje(mensajeDeError(e, tipo));
        setFase("error");
      }
    })();
    return () => {
      vivo = false;
      api.current = null;
      lienzo?.destruir();
      fuente?.destruir();
      if (imagen) URL.revokeObjectURL(imagen.url);
    };
  }, [blob, tipo]);

  const irA = (texto) => {
    if (texto !== "") api.current?.irAPagina(Number(texto));
    setEntrada(null);
  };

  const listo = fase === "listo";
  return (
    <>
      {listo && (
        <div className="visor-barra">
          <div className="visor-grupo">
            <button type="button" className="btn mini" aria-label="Alejar" onClick={() => api.current?.alejar()}>−</button>
            <span className="visor-zoom" aria-live="polite">{Math.round(vista.zoom * 100)}%</span>
            <button type="button" className="btn mini" aria-label="Acercar" onClick={() => api.current?.acercar()}>+</button>
            <button type="button" className="btn mini" onClick={() => api.current?.ajustar()}>
              Ajustar{tipo === "pdf" && <span className="visor-ancho">al ancho</span>}
            </button>
          </div>
          {vista.total > 1 && (
            <div className="visor-grupo">
              <button type="button" className="btn mini" aria-label="Página anterior" disabled={vista.pagina <= 1} onClick={() => api.current?.irAPagina(vista.pagina - 1)}>‹</button>
              <input
                className="visor-pagina" type="number" inputMode="numeric" min="1" max={vista.total} aria-label="Número de página"
                value={entrada ?? vista.pagina}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setEntrada(e.target.value)}
                onBlur={(e) => irA(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { irA(e.currentTarget.value); e.currentTarget.blur(); } }}
              />
              <span className="visor-total">/ {vista.total}</span>
              <button type="button" className="btn mini" aria-label="Página siguiente" disabled={vista.pagina >= vista.total} onClick={() => api.current?.irAPagina(vista.pagina + 1)}>›</button>
            </div>
          )}
        </div>
      )}
      <div className="visor-marco">
        <div className="visor-lienzo" ref={marco} tabIndex={0} />
        {fase === "abriendo" && <div className="visor-estado visor-sobre" role="status"><span className="visor-giro" aria-hidden="true" /><span>Abriendo…</span></div>}
        {fase === "error" && <div className="visor-estado visor-sobre"><div className="alerta">{mensaje}</div></div>}
      </div>
    </>
  );
}
