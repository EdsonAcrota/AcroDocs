import React, { useState } from "react";

// Cuadro que se contrae y se expande. El contenido siempre se queda montado (solo se oculta), así un
// formulario a medio llenar no se pierde al contraer. Con `recordar` el estado se guarda en el navegador
// (por nombre de sección, no por hito) y la próxima vez abre como lo dejaste.
const PREFIJO = "acrodocs_plegable_";

const leerGuardado = (clave) => {
  try { return localStorage.getItem(PREFIJO + clave); } catch { return null; }
};
const escribirGuardado = (clave, abierto) => {
  try { localStorage.setItem(PREFIJO + clave, abierto ? "1" : "0"); } catch { /* sin almacenamiento: no se recuerda */ }
};

// Estado abierto/cerrado con memoria opcional. Devuelve [abierto, alternar].
export const usePlegado = (abiertoInicial, recordar) => {
  const [abierto, setAbierto] = useState(() => {
    const guardado = recordar ? leerGuardado(recordar) : null;
    return guardado === null ? abiertoInicial : guardado === "1";
  });
  const alternar = () => {
    setAbierto((actual) => {
      if (recordar) escribirGuardado(recordar, !actual);
      return !actual;
    });
  };
  return [abierto, alternar];
};

export default function Plegable({ titulo, resumen, abierto = false, recordar, className = "", children }) {
  const [esta, alternar] = usePlegado(abierto, recordar);
  return (
    <section className={`plegable${esta ? " abierto" : ""}${className ? ` ${className}` : ""}`}>
      <button type="button" className="plegable-cab" aria-expanded={esta} onClick={alternar}>
        <span className="plegable-titulo">{titulo}</span>
        {resumen ? <span className="plegable-resumen">{resumen}</span> : null}
        <span className="plegable-flecha" aria-hidden="true" />
      </button>
      <div className="plegable-cuerpo" hidden={!esta}>{children}</div>
    </section>
  );
}
