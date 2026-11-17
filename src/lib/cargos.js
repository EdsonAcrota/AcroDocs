// Mesa de partes (§5.7): reglas puras de visibilidad y exportación de los cargos
// (el sello de recepción con número y fecha de cada documento presentado).

import { tienePermiso, veContrato } from "./permisos.js";

export const TIPOS_DOCUMENTO = ["carta", "oficio", "solicitud", "informe", "otro"];

// Quien tiene `ver_todos` ve todos los cargos. Los demás ven los de sus contratos
// asignados y los que registraron ellos mismos (§5.9 regla 6). `usuario` puede ser
// un usuario del almacén (`id`) o la ficha de la sesión (`usuarioId`).
export const cargosVisibles = (cargos, usuario, matriz) => {
  if (!usuario) return [];
  if (tienePermiso(matriz, usuario, "ver_todos")) return [...cargos];
  const uid = usuario.usuarioId ?? usuario.id;
  return cargos.filter((c) => (c.tramiteId && veContrato(matriz, usuario, c.tramiteId)) || (uid && c.registradoPor === uid));
};

const CABECERA = ["Fecha", "Hora", "Entidad", "Oficina", "N° registro", "Tipo", "N° documento", "Asunto", "Emisor", "Contrato", "Hito", "Presentado por", "Anulado"];

// Una celda de CSV con `;` como separador: se entrecomilla si trae `;`, comillas o saltos.
const celda = (valor) => {
  const texto = String(valor ?? "");
  return /[;"\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
};

// BOM al inicio para que Excel abra bien los acentos.
export const cargosACsv = (cargos, tramitesPorId = {}) => {
  const filas = cargos.map((c) => [
    c.fecha, c.hora, c.entidad, c.oficina, c.numeroRegistro, c.tipoDocumento, c.numeroDocumento, c.asunto,
    c.emisorNombre, c.tramiteId ? (tramitesPorId[c.tramiteId]?.codigo || c.tramiteId) : "",
    c.hitoCodigo, c.presentadoPor, c.anulado ? "Sí" : "",
  ]);
  return `﻿${[CABECERA, ...filas].map((fila) => fila.map(celda).join(";")).join("\r\n")}\r\n`;
};
