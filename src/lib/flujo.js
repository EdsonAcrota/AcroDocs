// Motor del flujo de trámite por pasos (§5.5 y §5.9). Es puro: no lee el store.
// Recibe los pasos de un hito y sus movimientos y calcula en qué paso está el
// trámite, quién tiene la pelota, cuándo vence y en qué estado queda el hito.

import { sumarDias, sumarHabiles } from "./fechas.js";

const TIPOS_OBSERVACION = ["observado", "levantado"];

// Copia profunda de los pasos de la plantilla para un hito. El primer paso toma el
// plazo propio que el hito ya tenía (regla 1 de §5.9); vacío = sin plazo fijo.
export const instanciarPasos = (pasos = [], fechaLimiteHito = "") => {
  const copia = JSON.parse(JSON.stringify(pasos || []));
  if (copia[0]) copia[0].fechaLimiteFija = fechaLimiteHito || null;
  return copia;
};

const sumar = (fecha, dias, habiles, feriados) =>
  habiles === false ? sumarDias(fecha, dias) : sumarHabiles(fecha, dias, feriados);

const flujoVacio = () => ({
  pasos: [], actual: -1, ciclo: 0, observado: false, levantamientoLimite: null,
  estado: "Pendiente", aCargo: null, fechaLimite: "", silencioVencido: false,
});

// item: { pasos, plazoLevantamiento }. movimientos: los del hito (los anulados se
// ignoran). opciones: { feriados, hoy } con `hoy` en ISO.
export const calcularFlujo = (item, movimientos = [], { feriados = [], hoy = "" } = {}) => {
  const pasos = item?.pasos || [];
  if (pasos.length === 0) return flujoVacio();

  // Orden por fecha; a igual fecha, el orden en que llegaron.
  const validos = movimientos
    .filter((m) => !m.anulado)
    .map((m, i) => ({ m, i }))
    .sort((a, b) => String(a.m.fecha || "").localeCompare(String(b.m.fecha || "")) || a.i - b.i)
    .map((x) => x.m);

  const indiceUltimaObservacion = (clave) => {
    let ultimo = -1;
    validos.forEach((m, k) => { if (m.pasoClave === clave && TIPOS_OBSERVACION.includes(m.tipo)) ultimo = k; });
    return ultimo;
  };

  const salida = [];
  pasos.forEach((p, i) => {
    const k = indiceUltimaObservacion(p.clave);
    const evento = k >= 0 ? validos[k] : null;
    const enObservacion = evento?.tipo === "observado";
    // Cumple el paso el primer movimiento propio posterior al último levantamiento.
    const movimiento = enObservacion
      ? null
      : validos.find((m, idx) => idx > k && m.pasoClave === p.clave && !TIPOS_OBSERVACION.includes(m.tipo)) || null;

    let inicio = null;
    if (evento?.tipo === "levantado") {
      inicio = evento.fecha;
    } else if (i > 0) {
      let ref = p.desde ? pasos.findIndex((q) => q.clave === p.desde) : i - 1;
      if (ref < 0 || ref >= i) ref = i - 1;
      // Si ese paso nunca ocurrió, el plazo corre desde su vencimiento (regla 2).
      inicio = salida[ref].movimiento?.fecha || salida[ref].fechaLimite || null;
    }
    const dias = Number(p.plazoDias) || 0;
    let fechaLimite = null;
    if (i === 0 && !evento) fechaLimite = p.fechaLimiteFija || null;
    else if (inicio && dias > 0) fechaLimite = sumar(inicio, dias, p.habiles, feriados);

    salida.push({ ...p, estado: "pendiente", inicio, fechaLimite, movimiento, observado: enObservacion });
  });

  const ultimoCumplido = salida.reduce((acc, s, i) => (s.movimiento ? i : acc), -1);
  salida.forEach((s, i) => {
    s.estado = s.movimiento ? "cumplido" : i < ultimoCumplido ? "sin_respuesta" : "pendiente";
  });

  const eventosObs = validos.filter((m) => TIPOS_OBSERVACION.includes(m.tipo));
  const ultimoEvento = eventosObs[eventosObs.length - 1] || null;
  const observado = ultimoEvento?.tipo === "observado";
  const ciclo = validos.filter((m) => m.tipo === "observado").length;

  let actual = ultimoCumplido + 1 < salida.length ? ultimoCumplido + 1 : -1;
  if (observado) {
    const idx = pasos.findIndex((p) => p.clave === ultimoEvento.pasoClave);
    if (idx >= 0) actual = idx;
  }
  if (actual >= 0) salida[actual].estado = "actual";

  const plazoLev = item.plazoLevantamiento;
  const levantamientoLimite = observado && plazoLev && Number(plazoLev.dias) > 0
    ? sumar(ultimoEvento.fecha, Number(plazoLev.dias), plazoLev.habiles, feriados)
    : null;

  let estado;
  let aCargo = null;
  if (actual === -1) {
    estado = "Completado";
  } else if (observado) {
    estado = "Observado";
    aCargo = "contratista";
  } else {
    aCargo = salida[actual].responsable;
    estado = aCargo === "contratista" ? "Pendiente" : "En revisión";
  }

  const fechaLimite = observado ? levantamientoLimite || "" : (actual >= 0 ? salida[actual].fechaLimite || "" : "");
  const silencioVencido = !observado && actual >= 0
    && salida[actual].alVencer === "silencio_positivo"
    && Boolean(salida[actual].fechaLimite) && Boolean(hoy) && salida[actual].fechaLimite < hoy;

  return { pasos: salida, actual, ciclo, observado, levantamientoLimite, estado, aCargo, fechaLimite, silencioVencido };
};
