// Requisitos de un hito: los documentos que se piden (`docsRequeridos`) frente a los archivos cargados
// (`documentos`, cada uno con el requisito al que pertenece en `tipoDoc`).
//
// Un requisito que no corresponde a este contrato se anota en `docsNoCorresponde` y se da por cumplido
// (por ejemplo, el contrato de consorcio cuando el ejecutor es una sola empresa).

// "cargado" (tiene archivos) | "no_corresponde" | "pendiente". Si ya hay archivos, siempre es "cargado".
export const estadoRequisito = (tarea, requisito) => {
  if ((tarea.documentos || []).some((doc) => doc.tipoDoc === requisito)) return "cargado";
  if ((tarea.docsNoCorresponde || []).includes(requisito)) return "no_corresponde";
  return "pendiente";
};

// Requisitos que todavía faltan: sin archivo y sin marcar como «No corresponde».
export const faltantes = (tarea) =>
  (tarea.docsRequeridos || []).filter((requisito) => estadoRequisito(tarea, requisito) === "pendiente");

// Cuántos requisitos están cumplidos (con archivo o marcados como «No corresponde») y cuántos hay en total.
export const avanceRequisitos = (tarea) => {
  const total = (tarea.docsRequeridos || []).length;
  return { cumplidos: total - faltantes(tarea).length, total };
};
