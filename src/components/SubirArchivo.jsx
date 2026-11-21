import React from "react";

// "Tomar foto" abre la cámara trasera del teléfono. Solo se muestra en pantallas
// táctiles (.solo-tactil); en una PC el selector de archivos normal ya basta.
// `onChange` recibe el evento del input sin transformarlo, igual que el input de archivo.
export function TomarFoto({ onChange, disabled = false }) {
  return (
    <label className={`btn mini subir-archivo subir-foto solo-tactil${disabled ? " deshabilitado" : ""}`}>
      Tomar foto
      <input type="file" hidden accept="image/*" capture="environment" disabled={disabled} onChange={onChange} />
    </label>
  );
}

// `children` se agrega al final de la fila (por ejemplo el botón «No corresponde» de un requisito).
export default function SubirArchivo({ etiqueta, ocupado = false, onChange, camara = true, children }) {
  return (
    <div className="subir-fila">
      <label className={`btn mini subir-archivo${ocupado ? " deshabilitado" : ""}`}>
        {etiqueta}
        <input type="file" hidden disabled={ocupado} onChange={onChange} />
      </label>
      {camara && <TomarFoto onChange={onChange} disabled={ocupado} />}
      {children}
    </div>
  );
}
