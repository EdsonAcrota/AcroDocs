import React, { useState } from "react";
import { listarHistorial } from "../lib/store.js";

const LIMITE = 50;

const ACCION = {
  crear: { texto: "Creó", clase: "verde" },
  editar: { texto: "Editó", clase: "azul" },
  eliminar: { texto: "Eliminó", clase: "rojo" },
  reemplazar: { texto: "Reemplazó", clase: "ambar" },
  anular: { texto: "Anuló", clase: "rojo" },
  corregir: { texto: "Corrigió", clase: "ambar" },
};

const OBJETO = {
  contrato: "contrato",
  hito: "hito",
  documento: "documento",
  cargo: "cargo",
  movimiento: "movimiento",
  usuarios: "usuario",
  permisos: "permisos",
  catalogo: "catálogo",
};

const cuando = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso || "—";
  return d.toLocaleString("es-PE", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

// Lista de cambios registrados, del más reciente al más antiguo. Se vuelve a leer
// del almacén en cada render, así refleja lo que acaba de pasar en la pantalla.
// `tramiteId` limita a un contrato; `objeto` (texto o lista) limita por tipo.
export default function HistorialLista({ tramiteId, objeto, vacio = "Todavía no hay cambios registrados." }) {
  const [limite, setLimite] = useState(LIMITE);
  const entradas = listarHistorial({ tramiteId, objeto });
  const visibles = entradas.slice(0, limite);

  if (entradas.length === 0) return <div className="vacio">{vacio}</div>;

  return (
    <div className="historial-lista">
      {visibles.map((h) => {
        const accion = ACCION[h.accion] || { texto: h.accion, clase: "gris" };
        return (
          <div className="historial-fila" key={h.id}>
            <span className={`badge ${accion.clase}`}>{accion.texto} {OBJETO[h.objeto] || h.objeto}</span>
            <div className="historial-cuerpo">
              <div>{h.detalle || "—"}</div>
              <div className="ref">{cuando(h.fecha)} · {h.usuario}</div>
            </div>
          </div>
        );
      })}
      {entradas.length > visibles.length && (
        <div className="historial-mas">
          <button type="button" className="btn mini" onClick={() => setLimite(limite + LIMITE)}>
            Ver más ({entradas.length - visibles.length})
          </button>
        </div>
      )}
    </div>
  );
}
