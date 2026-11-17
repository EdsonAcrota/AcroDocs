import React, { useRef } from "react";
import { validarEjecutor, getEmpresa } from "../lib/store.js";

const consorcioVacio = () => ({ tipo: "consorcio", nombre: "", ruc: "", representante: "", integrantes: [] });
const integranteVacio = () => ({ razonSocial: "", ruc: "", participacion: "" });

// Campos del ejecutor de un contrato (§5.3): empresa propia o consorcio. Lo usan
// el alta de contratos y la edición de la ficha. Es un componente controlado:
// `value` es el ejecutor ({ tipo: "empresa" } o el consorcio completo) y
// `onChange` recibe el ejecutor nuevo. Los avisos de `validarEjecutor` se
// muestran al instante pero no impiden guardar.
export default function EjecutorForm({ value, onChange }) {
  const ejecutor = value?.tipo === "consorcio" ? value : { tipo: "empresa" };
  const esConsorcio = ejecutor.tipo === "consorcio";
  const integrantes = Array.isArray(ejecutor.integrantes) ? ejecutor.integrantes : [];
  // Si se cambia a Empresa y se vuelve a Consorcio, no se pierde lo que ya se escribió.
  const borrador = useRef(null);
  const avisos = validarEjecutor(ejecutor);
  const empresa = getEmpresa();

  const cambiarTipo = (tipo) => {
    if (tipo === "consorcio") {
      onChange(borrador.current || consorcioVacio());
      return;
    }
    if (esConsorcio) borrador.current = ejecutor;
    onChange({ tipo: "empresa" });
  };

  const poner = (campo) => (e) => onChange({ ...ejecutor, integrantes, [campo]: e.target.value });

  const ponerIntegrante = (indice, campo, valor) =>
    onChange({
      ...ejecutor,
      integrantes: integrantes.map((fila, i) => (i === indice ? { ...fila, [campo]: valor } : fila)),
    });

  const agregarIntegrante = () => onChange({ ...ejecutor, integrantes: [...integrantes, integranteVacio()] });

  const quitarIntegrante = (indice) =>
    onChange({ ...ejecutor, integrantes: integrantes.filter((_, i) => i !== indice) });

  const suma = integrantes.reduce((total, fila) => total + (Number(fila.participacion) || 0), 0);

  return (
    <div className="ejecutor-form ancho-completo">
      <label className="campo-grupo">
        <span className="campo">Ejecutor del contrato</span>
        <select value={ejecutor.tipo} onChange={(e) => cambiarTipo(e.target.value)}>
          <option value="empresa">Empresa propia (ejecución directa)</option>
          <option value="consorcio">Consorcio</option>
        </select>
      </label>

      {!esConsorcio && (
        <div className="ref">
          {empresa.razonSocial
            ? `Lo ejecuta ${empresa.razonSocial}${empresa.ruc ? ` (RUC ${empresa.ruc})` : ""}.`
            : "Lo ejecuta la empresa propia. Registra su razón social en Configuración → Empresa."}
        </div>
      )}

      {esConsorcio && (
        <>
          <div className="grid-form">
            <label className="campo-grupo">
              <span className="campo">Nombre del consorcio *</span>
              <input value={ejecutor.nombre || ""} onChange={poner("nombre")} placeholder="Consorcio …" required />
            </label>
            <label className="campo-grupo">
              <span className="campo">RUC del consorcio</span>
              <input value={ejecutor.ruc || ""} onChange={poner("ruc")} inputMode="numeric" />
            </label>
            <label className="campo-grupo ancho-completo">
              <span className="campo">Representante legal</span>
              <input value={ejecutor.representante || ""} onChange={poner("representante")} />
            </label>
          </div>

          {integrantes.length > 0 && (
            <div className="integrantes-cab" aria-hidden="true">
              <span>Integrante (razón social)</span><span>RUC</span><span>Participación (%)</span><span />
            </div>
          )}
          {integrantes.map((fila, i) => (
            <div className="integrante-fila" key={i}>
              <input
                aria-label={`Razón social del integrante ${i + 1}`}
                placeholder="Razón social"
                value={fila.razonSocial || ""}
                onChange={(e) => ponerIntegrante(i, "razonSocial", e.target.value)}
              />
              <input
                aria-label={`RUC del integrante ${i + 1}`}
                placeholder="RUC"
                inputMode="numeric"
                value={fila.ruc || ""}
                onChange={(e) => ponerIntegrante(i, "ruc", e.target.value)}
              />
              <input
                aria-label={`Participación del integrante ${i + 1} (%)`}
                placeholder="%"
                type="number"
                min="0"
                max="100"
                step="any"
                value={fila.participacion ?? ""}
                onChange={(e) => ponerIntegrante(i, "participacion", e.target.value)}
              />
              <button type="button" className="btn-icono peligro" title="Quitar integrante" aria-label={`Quitar integrante ${i + 1}`} onClick={() => quitarIntegrante(i)}>×</button>
            </div>
          ))}
          <div className="integrantes-pie">
            <button type="button" className="btn mini" onClick={agregarIntegrante}>+ Agregar integrante</button>
            {integrantes.length > 0 && <span className="ref">Suma de participaciones: {Math.round(suma * 100) / 100} %</span>}
          </div>
        </>
      )}

      {avisos.map((aviso) => (
        <div className="nota-info ambar" role="status" key={aviso}>{aviso}</div>
      ))}
    </div>
  );
}
