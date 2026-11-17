// Catálogo jerárquico de hitos y trámites por tipo de contratación.
// Cada hito se crea automáticamente al registrar la obra o consultoría.
// Los trámites eventuales (cambio de personal, ampliación, etc.) se agregan
// desde el expediente cuando ocurren.

import { hoy, sumarDias, sumarHabiles } from "./fechas.js";
import { instanciarPasos } from "./flujo.js";
import { pasosSemillaDe } from "./pasosSemilla.js";

const uid = () =>
  (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const pad = (n) => String(n).padStart(2, "0");
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const parseFecha = (iso) => (iso ? new Date(`${iso}T12:00:00`) : new Date());
const iso = (d) => d.toISOString().slice(0, 10);

const addMeses = (fecha, meses) => {
  const d = fecha instanceof Date ? new Date(fecha) : parseFecha(fecha);
  d.setMonth(d.getMonth() + meses);
  return d;
};

const mesesDelContrato = (tramite, limite = 18) => {
  const inicio = parseFecha(tramite.fecha_inicio || hoy());
  const fin = parseFecha(tramite.fecha_fin || iso(addMeses(inicio, 5)));
  let total = (fin.getFullYear() - inicio.getFullYear()) * 12 + (fin.getMonth() - inicio.getMonth()) + 1;
  total = Math.max(1, Math.min(total, limite));
  return Array.from({ length: total }, (_, i) => {
    const d = addMeses(inicio, i);
    return { anio: d.getFullYear(), mes: d.getMonth() + 1, periodo: `${d.getFullYear()}-${pad(d.getMonth() + 1)}` };
  });
};

const T = (codigo, nombre, docs, opts = {}) => ({
  codigo,
  nombre,
  docs,
  cumplimiento: opts.cumplimiento || "",
  plazoDias: Number(opts.dias || 0),
  plazoBase: opts.base || "inicio",
  plazoHabiles: opts.habiles !== false,
  norma: opts.norma || "Ley 32069 y su Reglamento",
  nota: opts.nota || "",
});

const S = (codigo, nombre, tareas) => ({ codigo, nombre, tareas });
const R = (codigo, nombre, plantilla, opts = {}) => ({
  codigo,
  nombre,
  recurrente: opts.recurrencia || "mensual",
  diaLimite: opts.diaLimite || 10,
  soloPrimerPeriodo: Boolean(opts.soloPrimerPeriodo),
  plantilla,
});

// ------------------------------- OBRA -------------------------------
const OBRA = {
  codigo: "1",
  nombre: "Obra",
  etapas: [
    {
      codigo: "1.1",
      nombre: "Contrato y expediente",
      secciones: [
        S("1.1", "Contrato y expediente", [
          T("1.1.1", "Perfeccionamiento de contrato", [
            "Contrato suscrito",
            "Vigencia de poder del representante legal",
            "DNI del representante legal",
            "RUC de la empresa contratista",
            "Presupuesto de obra",
            "Declaración jurada de no impedimento",
            "Relación de maquinarias y equipos",
          ], {
            dias: 5, habiles: false, base: "suscripcion",
            cumplimiento: "Contrato suscrito",
            nota: "Reúne la documentación del perfeccionamiento. Al subir el contrato suscrito el hito se marca como completado.",
          }),
          T("1.1.2", "Garantía de fiel cumplimiento", [
            "Carta fianza de fiel cumplimiento",
            "Comprobante de emisión",
            "Carta de instrucción al banco",
          ], { dias: 10, habiles: false, base: "suscripcion", cumplimiento: "Carta fianza de fiel cumplimiento" }),
          T("1.1.3", "Garantía por adelanto directo", [
            "Solicitud de adelanto directo",
            "Carta fianza por adelanto directo",
            "Comprobante de emisión",
          ], { dias: 10, habiles: false, base: "suscripcion", cumplimiento: "Carta fianza por adelanto directo", nota: "Solo si se otorgó adelanto directo." }),
          T("1.1.4", "Designación del supervisor de obra", [
            "Resolución de designación",
            "CV del supervisor",
            "Declaración jurada de no impedimento",
          ], { dias: 5, habiles: true, base: "suscripcion", cumplimiento: "Resolución de designación" }),
          T("1.1.5", "Expediente técnico aprobado", [
            "Resolución de aprobación del expediente técnico",
            "Expediente técnico completo",
            "Presupuesto y análisis de precios unitarios",
          ], { dias: 0, cumplimiento: "Resolución de aprobación del expediente técnico" }),
        ]),
      ],
    },
    {
      codigo: "1.2",
      nombre: "Inicio y aseguramiento",
      secciones: [
        S("1.2", "Inicio y aseguramiento", [
          T("1.2.1", "Acta de entrega de terreno", ["Acta de entrega de terreno", "Plano de ubicación", "Cargo de recepción"], { dias: 5, habiles: false }),
          T("1.2.2", "Acta de inicio de ejecución de obra", ["Acta de inicio de obra", "Orden de inicio", "Cargo de notificación"], { dias: 5, habiles: false }),
          T("1.2.3", "Programa de ejecución de obra", [
            "Calendario de avance de obra valorizado",
            "Calendario de adquisición de materiales",
            "Calendario de utilización de equipos",
            "Calendario de personal clave (opcional)",
            "Aprobación del supervisor",
          ], { dias: 10, habiles: true, cumplimiento: "Aprobación del supervisor", nota: "El programa comprende los cuatro calendarios; el de personal clave es opcional." }),
          T("1.2.5", "Cuaderno de obra aperturado", ["Acta de apertura del cuaderno de obra", "Folios iniciales"], { dias: 3, habiles: false }),
          T("1.2.6", "Plan de seguridad y salud en el trabajo", ["Plan de seguridad y salud", "Aprobación del supervisor", "Registro de entrega al personal"], { dias: 10, habiles: true }),
          T("1.2.7", "Plan de gestión de residuos de construcción", ["Plan de manejo de residuos", "Constancia de presentación"], { dias: 10, habiles: true }),
          T("1.2.8", "Instrumento ambiental aprobado", ["Instrumento ambiental", "Resolución de aprobación", "Compromisos ambientales"], { dias: 0 }),
          T("1.2.9", "Seguro de responsabilidad civil", ["Póliza de responsabilidad civil", "Comprobante de pago"], { dias: 5, habiles: false }),
        ]),
        R("1.2.10", "Renovaciones de carta fianza", T("", "Renovación de carta fianza", ["Carta fianza renovada", "Instrucción al banco", "Comprobante de emisión", "Carta de la entidad"], { dias: 15, habiles: false, cumplimiento: "Carta fianza renovada", nota: "Periodo y tipos configurables desde el expediente." }), { recurrencia: "anual", diaLimite: 15 }),
        R("1.2.11", "SCTR mensual", T("", "SCTR mensual", ["Constancia de SCTR vigente", "Planilla de trabajadores del mes", "Comprobante de pago de prima"], { cumplimiento: "Constancia de SCTR vigente", nota: "Se genera solo el mes de inicio. Agrega los meses siguientes desde el expediente." }), { diaLimite: 10, soloPrimerPeriodo: true }),
      ],
    },
    {
      codigo: "1.3",
      nombre: "Ejecución de obra",
      secciones: [
        S("1.3.1", "Control de obra", [
          T("1.3.1.1", "Liberación de interferencias", ["Acta de liberación de interferencias", "Informe del supervisor"], { dias: 0 }),
          T("1.3.1.2", "Autorizaciones y licencias municipales", ["Licencia de edificación", "Autorización municipal", "Comprobante de pago"], { dias: 0 }),
          T("1.3.1.3", "Ensayos y control de calidad", ["Protocolos de ensayo", "Certificados de laboratorio", "Informe de calidad"], { dias: 0 }),
          T("1.3.1.4", "Certificados de calidad de materiales", ["Certificados de materiales", "Fichas técnicas"], { dias: 0 }),
          T("1.3.1.5", "Anotaciones en el cuaderno de obra", ["Cuaderno de obra actualizado", "Reporte de anotaciones"], { dias: 0 }),
          T("1.3.1.6", "Control de personal y planillas", ["Planilla del mes", "Registro de asistencia", "Boletas de pago"], { dias: 0 }),
          T("1.3.1.7", "Control de equipos y maquinaria", ["Relación de equipos", "Partes diarios de maquinaria"], { dias: 0 }),
        ]),
        R("1.3.2", "Valorizaciones", T("", "Valorización", [
          "Valorización firmada",
          "Metrados y análisis de precios",
          "Informe del supervisor",
          "Comprobante de pago",
        ], { cumplimiento: "Comprobante de pago", nota: "Trámite mensual. Cada valorización genera su propio expediente." }), { diaLimite: 25 }),
        R("1.3.3", "Informes mensuales de avance", T("", "Informe mensual de avance", [
          "Informe de avance físico",
          "Informe de avance financiero",
          "Reporte fotográfico",
          "Aprobación del supervisor",
        ], { cumplimiento: "Aprobación del supervisor" }), { diaLimite: 28 }),
      ],
    },
    {
      codigo: "1.5",
      nombre: "Recepción y liquidación",
      secciones: [
        S("1.5", "Recepción y liquidación", [
          T("1.5.1", "Solicitud de recepción de obra", ["Solicitud de recepción", "Informe final del residente", "Cargo de presentación"], { dias: 0 }),
          T("1.5.2", "Informe de supervisión para recepción", ["Informe de supervisión", "Protocolos de pruebas"], { dias: 0 }),
          T("1.5.3", "Acta de recepción de obra", ["Acta de recepción", "Observaciones levantadas"], { dias: 0 }),
          T("1.5.4", "Planos as-built", ["Planos as-built", "Memoria de replanteo"], { dias: 0 }),
          T("1.5.5", "Manual de operación y mantenimiento", ["Manual de operación", "Manual de mantenimiento"], { dias: 0 }),
          T("1.5.6", "Certificados de equipos instalados", ["Certificados de equipos", "Garantías de equipos"], { dias: 0 }),
          T("1.5.7", "Liquidación de obra", ["Liquidación de obra", "Informe de liquidación", "Aprobación de la liquidación"], { dias: 0 }),
          T("1.5.8", "Archivo del expediente", ["Índice de expediente", "Acta de cierre", "Constancia de archivo"], { dias: 0 }),
        ]),
      ],
    },
  ],
};

// --------------------------- CONSULTORÍA ---------------------------
const CONSULTORIA = {
  codigo: "2",
  nombre: "Consultoría de obra",
  etapas: [
    {
      codigo: "2.1",
      nombre: "Contrato y expediente",
      secciones: [
        S("2.1", "Contrato y expediente", [
          T("2.1.1", "Perfeccionamiento de contrato", [
            "Contrato suscrito",
            "DNI del representante legal",
            "Presupuesto del servicio",
            "CV del equipo profesional",
            "Declaración jurada de no impedimento",
          ], { dias: 5, habiles: false, base: "suscripcion", cumplimiento: "Contrato suscrito" }),
          T("2.1.2", "Garantía de fiel cumplimiento", ["Carta fianza de fiel cumplimiento", "Comprobante de emisión", "Carta de instrucción al banco"], { dias: 10, habiles: false, base: "suscripcion" }),
          T("2.1.3", "Designación del coordinador de la consultoría", ["Resolución de designación", "CV del coordinador"], { dias: 5, habiles: true, base: "suscripcion" }),
          T("2.1.4", "Designación del supervisor o comité de recepción", ["Resolución de designación", "CV del supervisor"], { dias: 5, habiles: true, base: "suscripcion" }),
          T("2.1.5", "Términos de referencia y alcance del servicio", ["Términos de referencia", "Alcance y productos esperados"], { dias: 0 }),
          T("2.1.6", "Equipo profesional propuesto", ["CV de cada profesional", "Certificados de habilidad", "Cartas de compromiso"], { dias: 0 }),
          T("2.1.7", "Registro del contrato en el SEACE", ["Ficha de registro", "Comprobante de publicación"], { dias: 5, habiles: true, base: "suscripcion" }),
        ]),
      ],
    },
    {
      codigo: "2.2",
      nombre: "Inicio y equipo",
      secciones: [
        S("2.2", "Inicio y equipo", [
          T("2.2.1", "Acta de inicio del servicio", ["Acta de inicio", "Orden de servicio", "Cargo de notificación"], { dias: 5, habiles: false }),
          T("2.2.2", "Plan de trabajo y metodología", ["Plan de trabajo", "Metodología", "Cronograma de entregables"], { dias: 10, habiles: true }),
          T("2.2.3", "Cronograma de entregables", ["Cronograma aprobado", "Aprobación del supervisor"], { dias: 10, habiles: true }),
          T("2.2.4", "Movilización del equipo profesional", ["Registro de movilización", "Declaración de disponibilidad"], { dias: 5, habiles: false }),
          T("2.2.5", "Seguro de responsabilidad civil", ["Póliza de responsabilidad civil", "Comprobante de pago"], { dias: 5, habiles: false }),
          T("2.2.6", "Plan de seguridad y salud (si aplica)", ["Plan de seguridad y salud", "Aprobación del supervisor"], { dias: 10, habiles: true }),
        ]),
        R("2.2.7", "Renovaciones de carta fianza", T("", "Renovación de carta fianza", ["Carta fianza renovada", "Instrucción al banco", "Comprobante de emisión", "Carta de la entidad"], { dias: 15, habiles: false, cumplimiento: "Carta fianza renovada", nota: "Periodo y tipos configurables desde el expediente." }), { recurrencia: "anual", diaLimite: 15 }),
        R("2.2.8", "SCTR del equipo consultor", T("", "SCTR del equipo consultor", ["Constancia de SCTR vigente", "Relación del personal", "Comprobante de pago"], { cumplimiento: "Constancia de SCTR vigente", nota: "Se genera solo el mes de inicio. Agrega los meses siguientes desde el expediente." }), { diaLimite: 10, soloPrimerPeriodo: true }),
      ],
    },
    {
      codigo: "2.3",
      nombre: "Ejecución del servicio",
      secciones: [
        S("2.3.1", "Entregables y control", [
          T("2.3.1.1", "Entregable parcial: diagnóstico", ["Informe de diagnóstico", "Aprobación del supervisor"], { dias: 0 }),
          T("2.3.1.2", "Entregable parcial: estudios básicos", ["Estudios básicos", "Memoria de cálculo"], { dias: 0 }),
          T("2.3.1.3", "Entregable parcial: diseño preliminar", ["Diseño preliminar", "Planos preliminares"], { dias: 0 }),
          T("2.3.1.4", "Informe de compatibilidad y consistencia", ["Informe de compatibilidad", "Matriz de observaciones"], { dias: 0 }),
          T("2.3.1.5", "Control de calidad del servicio", ["Protocolo de calidad", "Informe de revisión"], { dias: 0 }),
          T("2.3.1.6", "Levantamiento de observaciones", ["Matriz de observaciones", "Constancia de levantamiento"], { dias: 0 }),
        ]),
        R("2.3.2", "Valorizaciones del servicio", T("", "Valorización del servicio", ["Valorización firmada", "Informe de avance", "Conformidad del supervisor", "Comprobante de pago"], { nota: "Trámite mensual." }), { diaLimite: 25 }),
        R("2.3.3", "Informes mensuales", T("", "Informe mensual de avance", ["Informe de avance", "Reporte de actividades", "Aprobación del supervisor"]), { diaLimite: 28 }),
      ],
    },
    {
      codigo: "2.4",
      nombre: "Entregables y valorizaciones",
      secciones: [
        S("2.4", "Entregable final", [
          T("2.4.1", "Entregable final: expediente técnico", ["Expediente técnico final", "Memoria descriptiva y de cálculo", "Planos definitivos", "Presupuesto y análisis de precios", "Especificaciones técnicas"], { dias: 0 }),
          T("2.4.2", "Entrega de productos en formato digital", ["Archivos digitales", "Índice de entrega", "Cargo de recepción"], { dias: 0 }),
          T("2.4.3", "Informe final del consultor", ["Informe final", "Resumen ejecutivo", "Anexos"], { dias: 0 }),
        ]),
      ],
    },
    {
      codigo: "2.6",
      nombre: "Recepción y liquidación",
      secciones: [
        S("2.6", "Recepción y liquidación", [
          T("2.6.1", "Solicitud de recepción del servicio", ["Solicitud de recepción", "Informe final", "Cargo de presentación"], { dias: 0 }),
          T("2.6.2", "Informe de conformidad del área usuaria", ["Informe de conformidad", "Aprobación del área usuaria"], { dias: 0 }),
          T("2.6.3", "Acta de recepción del servicio", ["Acta de recepción", "Observaciones levantadas"], { dias: 0 }),
          T("2.6.4", "Liquidación del contrato de consultoría", ["Liquidación del contrato", "Informe de liquidación", "Aprobación de la liquidación"], { dias: 0 }),
          T("2.6.5", "Archivo del expediente", ["Índice de expediente", "Acta de cierre", "Constancia de archivo"], { dias: 0 }),
        ]),
      ],
    },
  ],
};

// ----------------------- TRÁMITES EVENTUALES -----------------------
// No se crean automáticamente: se agregan cuando ocurre el hecho.
export const EVENTUALES = {
  Obra: [
    {
      clave: "cambio_personal",
      nombre: "Cambio de personal clave",
      docs: ["Solicitud de cambio de personal clave", "CV del profesional propuesto", "Certificados de habilidad profesional", "Carta de compromiso del profesional", "Documentación del personal saliente", "Informe del supervisor"],
      dias: 10,
      habiles: true,
      norma: "Ley 32069 y su Reglamento",
    },
    {
      clave: "ampliacion",
      nombre: "Ampliación de plazo",
      docs: ["Solicitud de ampliación de plazo", "Informe técnico del supervisor", "Cronograma actualizado", "Resolución de ampliación", "Publicación en PLADICOP"],
      dias: 10,
      habiles: true,
      silencioPositivo: true,
      norma: "Ley 32069, arts. 199 y 200 del Reglamento",
    },
    {
      clave: "adicional",
      nombre: "Presupuesto adicional de obra",
      docs: ["Presupuesto adicional", "Memoria de sustento", "Aprobación del supervisor", "Resolución de aprobación"],
      dias: 0,
      habiles: true,
      norma: "Ley 32069 y su Reglamento",
    },
    {
      clave: "sustitucion_supervisor",
      nombre: "Sustitución del supervisor de obra",
      docs: ["Solicitud de sustitución", "CV del propuesto", "Resolución de designación"],
      dias: 5,
      habiles: true,
      norma: "Ley 32069 y su Reglamento",
    },
    {
      clave: "paralizacion",
      nombre: "Paralización de obra",
      docs: ["Acta de paralización", "Informe del supervisor", "Comunicación a la entidad"],
      dias: 0,
      habiles: true,
      norma: "Ley 32069 y su Reglamento",
    },
  ],
  "Consultoría de obra": [
    {
      clave: "cambio_personal",
      nombre: "Cambio de personal clave",
      docs: ["Solicitud de cambio de personal clave", "CV del profesional propuesto", "Certificados de habilidad profesional", "Carta de compromiso", "Documentación del personal saliente", "Informe del supervisor"],
      dias: 10,
      habiles: true,
      norma: "Ley 32069 y su Reglamento",
    },
    {
      clave: "ampliacion",
      nombre: "Ampliación de plazo",
      docs: ["Solicitud de ampliación de plazo", "Informe técnico del supervisor", "Cronograma actualizado", "Resolución de ampliación", "Publicación en PLADICOP"],
      dias: 10,
      habiles: true,
      silencioPositivo: true,
      norma: "Ley 32069, arts. 199 y 200 del Reglamento",
    },
    {
      clave: "adicional",
      nombre: "Adicional o deductivo del servicio",
      docs: ["Presupuesto adicional/deductivo", "Memoria de sustento", "Resolución de aprobación"],
      dias: 0,
      habiles: true,
      norma: "Ley 32069 y su Reglamento",
    },
    {
      clave: "sustitucion_supervisor",
      nombre: "Sustitución del supervisor",
      docs: ["Solicitud de sustitución", "CV del propuesto", "Resolución de designación"],
      dias: 5,
      habiles: true,
      norma: "Ley 32069 y su Reglamento",
    },
  ],
};

export const esConsultoria = (tipo) => String(tipo || "").toLowerCase().includes("consultor");

// Árbol fijo de la semilla. Solo para listas de etapas en la interfaz: la
// generación de hitos lee siempre el catálogo almacenado (`data.catalogo`).
export const catalogoDe = (tipo) => (esConsultoria(tipo) ? CONSULTORIA : OBRA);

const calcularVence = (tramite, plantilla, feriados) => {
  const dias = Number(plantilla.plazoDias || 0);
  if (!dias) return "";
  const fechaBase = plantilla.plazoBase === "suscripcion"
    ? (tramite.fecha_suscripcion || tramite.created_at || tramite.fecha_inicio || hoy())
    : (tramite.fecha_inicio || hoy());
  return plantilla.plazoHabiles === false
    ? sumarDias(fechaBase, dias)
    : sumarHabiles(fechaBase, dias, feriados);
};

const crearTarea = (tramite, etapa, seccion, plantilla, extra = {}) => {
  const tarea = {
    id: uid(),
    tramite_id: tramite.id,
    codigo: plantilla.codigo,
    nombre: plantilla.nombre,
    etapaCodigo: etapa.codigo,
    etapaNombre: etapa.nombre,
    seccionCodigo: seccion.codigo,
    seccionNombre: seccion.nombre,
    tipo: "fijo",
    plantilla: plantilla.codigo,
    clavePlantilla: extra.clavePlantilla || plantilla.codigo,
    docCumplimiento: plantilla.cumplimiento || "",
    estado: "Pendiente",
    responsable: "",
    fecha: "",
    fecha_limite: "",
    observacion: "",
    docsRequeridos: [...(plantilla.docs || [])],
    documentos: [],
    plazoDias: plantilla.plazoDias || 0,
    plazoBase: plantilla.plazoBase || "inicio",
    plazoHabiles: plantilla.plazoHabiles !== false,
    norma: plantilla.norma || "",
    nota: plantilla.nota || "",
    recurrente: false,
    periodo: "",
    ...extra,
  };
  // Un hito con pasos lleva su propia copia. El primer paso toma el plazo que el
  // hito ya tenía, salvo en un trámite eventual: ahí los plazos son los de sus pasos.
  const pasos = plantilla.pasos || [];
  if (pasos.length) {
    const fija = tarea.tipo === "eventual" ? "" : tarea.fecha_limite;
    tarea.pasos = instanciarPasos(pasos, fija);
    tarea.plazoLevantamiento = plantilla.plazoLevantamiento || null;
    tarea.fecha_limite = fija;
  } else {
    tarea.pasos = [];
    tarea.plazoLevantamiento = null;
  }
  return tarea;
};

// ------------------------ CATÁLOGO ALMACENADO ------------------------
// OBRA, CONSULTORIA, EVENTUALES y HITOS_OPCIONALES son solo la semilla (§5.4).
// `catalogoSemilla()` las convierte en un objeto serializable que se guarda en
// `data.catalogo`; desde ahí se generan los hitos de los contratos nuevos.
//
// Catalogo  = { obra: Arbol, consultoria: Arbol,
//               eventuales: { obra: Plantilla[], consultoria: Plantilla[] },
//               opcionales: { obra: Plantilla[], consultoria: Plantilla[] } }
// Arbol     = { codigo, nombre, etapas: [{ id, codigo, nombre, secciones: [{ id, codigo, nombre,
//               recurrente?, diaLimite?, soloPrimerPeriodo?, plantilla?: Plantilla, hitos?: Plantilla[] }] }] }
// Plantilla = { id, clave, codigo?, nombre, docs, cumplimiento, plazoDias, plazoBase, plazoHabiles, norma,
//               nota, activo, verificado, pasos, plazoLevantamiento, silencioPositivo?, diasSilencio? }
// `codigo` solo existe en los hitos de secciones fijas: es el número con el que el hito
// se crea en los contratos nuevos. La `clave` es su identidad y no cambia nunca.
// Los opcionales llevan además `etapaCodigo` y `etapaNombre` (dónde se agregan).

export const AMBITOS = ["obra", "consultoria"];
export const ambitoDe = (tipo) => (esConsultoria(tipo) ? "consultoria" : "obra");
export const tipoDeAmbito = (ambito) => (ambito === "consultoria" ? "Consultoría de obra" : "Obra");

// Completa una plantilla con los valores por defecto sin perder campos extra.
// Conserva el `id` si ya lo tiene: los ids se generan una sola vez.
export const completarPlantilla = (p = {}) => ({
  ...p,
  id: p.id || uid(),
  clave: String(p.clave ?? ""),
  nombre: String(p.nombre ?? ""),
  docs: Array.isArray(p.docs) ? [...p.docs] : [],
  cumplimiento: p.cumplimiento || "",
  plazoDias: Number(p.plazoDias || 0),
  plazoBase: p.plazoBase || "inicio",
  plazoHabiles: p.plazoHabiles !== false,
  norma: p.norma ?? "",
  nota: p.nota ?? "",
  activo: p.activo !== false,
  verificado: p.verificado === true,
  pasos: Array.isArray(p.pasos) ? [...p.pasos] : [],
  plazoLevantamiento: p.plazoLevantamiento ?? null,
});

const desdeT = (clave, t) => completarPlantilla({
  clave,
  nombre: t.nombre,
  docs: t.docs,
  cumplimiento: t.cumplimiento,
  plazoDias: t.plazoDias,
  plazoBase: t.plazoBase,
  plazoHabiles: t.plazoHabiles,
  norma: t.norma,
  nota: t.nota,
  pasos: pasosSemillaDe(clave),
});

// Los hitos fijos llevan además su `codigo` explícito (el número con el que se
// crean en los contratos). La clave los identifica; el código puede cambiar al
// reordenar el árbol.
const hitoSemilla = (t) => ({ ...desdeT(t.codigo, t), codigo: t.codigo });

const arbolSemilla = (fuente) => ({
  codigo: fuente.codigo,
  nombre: fuente.nombre,
  etapas: fuente.etapas.map((etapa) => ({
    id: uid(),
    codigo: etapa.codigo,
    nombre: etapa.nombre,
    secciones: etapa.secciones.map((s) => (s.recurrente
      ? {
        id: uid(),
        codigo: s.codigo,
        nombre: s.nombre,
        recurrente: s.recurrente,
        diaLimite: s.diaLimite,
        soloPrimerPeriodo: Boolean(s.soloPrimerPeriodo),
        plantilla: desdeT(s.codigo, s.plantilla),
      }
      : { id: uid(), codigo: s.codigo, nombre: s.nombre, hitos: s.tareas.map(hitoSemilla) })),
  })),
});

const eventualSemilla = (e) => completarPlantilla({
  clave: e.clave,
  nombre: e.nombre,
  docs: e.docs,
  cumplimiento: "",
  plazoDias: e.dias || 0,
  plazoBase: "manual",
  plazoHabiles: e.habiles !== false,
  norma: e.norma || "",
  nota: "Trámite eventual agregado al expediente. No se crea automáticamente.",
  silencioPositivo: Boolean(e.silencioPositivo),
  diasSilencio: e.dias || 0,
  pasos: pasosSemillaDe(e.clave),
});

const opcionalSemilla = (o) => completarPlantilla({
  clave: o.clave,
  nombre: o.nombre,
  docs: o.docs,
  cumplimiento: "",
  plazoDias: o.dias || 0,
  plazoBase: o.base || "inicio",
  plazoHabiles: o.habiles !== false,
  norma: o.norma || "",
  nota: o.nota || "Hito opcional agregado al expediente.",
  etapaCodigo: o.etapaCodigo,
  etapaNombre: o.etapaNombre,
});

// Cada llamada arma objetos nuevos con ids nuevos. Quien la copie a los datos
// guarda esos ids y no vuelve a llamarla para lo mismo.
export const catalogoSemilla = () => ({
  obra: arbolSemilla(OBRA),
  consultoria: arbolSemilla(CONSULTORIA),
  eventuales: {
    obra: EVENTUALES.Obra.map(eventualSemilla),
    consultoria: EVENTUALES["Consultoría de obra"].map(eventualSemilla),
  },
  opcionales: {
    obra: HITOS_OPCIONALES.Obra.map(opcionalSemilla),
    consultoria: HITOS_OPCIONALES["Consultoría de obra"].map(opcionalSemilla),
  },
});

// Recorre todas las plantillas del catálogo. `tipo` es "hito", "recurrente",
// "eventual" u "opcional"; `lista` es el arreglo que contiene la plantilla
// (para hitos, eventuales y opcionales) y `seccion`/`etapa` su lugar en el árbol.
export const recorrerPlantillas = (catalogo, fn) => {
  for (const ambito of AMBITOS) {
    for (const etapa of catalogo?.[ambito]?.etapas || []) {
      for (const seccion of etapa.secciones || []) {
        if (seccion.recurrente) {
          if (seccion.plantilla) fn({ tipo: "recurrente", ambito, etapa, seccion, plantilla: seccion.plantilla });
        } else {
          for (const plantilla of seccion.hitos || []) {
            fn({ tipo: "hito", ambito, etapa, seccion, lista: seccion.hitos, plantilla });
          }
        }
      }
    }
    for (const plantilla of catalogo?.eventuales?.[ambito] || []) {
      fn({ tipo: "eventual", ambito, lista: catalogo.eventuales[ambito], plantilla });
    }
    for (const plantilla of catalogo?.opcionales?.[ambito] || []) {
      fn({ tipo: "opcional", ambito, lista: catalogo.opcionales[ambito], plantilla });
    }
  }
};

// Ubica las plantillas de una clave. Acepta las claves antiguas de
// plantillasDocs: "eventual:<clave>" y "opcional:<clave>". Una clave de eventual
// puede estar en los dos ámbitos (por ejemplo "ampliacion").
export const ubicarPlantillas = (catalogo, clave) => {
  const texto = String(clave || "");
  let tipos = ["hito", "recurrente"];
  let buscada = texto;
  if (texto.startsWith("eventual:")) { tipos = ["eventual"]; buscada = texto.slice(9); }
  else if (texto.startsWith("opcional:")) { tipos = ["opcional"]; buscada = texto.slice(9); }
  const salida = [];
  if (!buscada) return salida;
  recorrerPlantillas(catalogo, (u) => {
    if (tipos.includes(u.tipo) && u.plantilla.clave === buscada) salida.push(u);
  });
  return salida;
};

export const ubicarPorId = (catalogo, id) => {
  let encontrada = null;
  recorrerPlantillas(catalogo, (u) => { if (!encontrada && u.plantilla.id === id) encontrada = u; });
  return encontrada;
};

// Campos que cada tipo de plantilla acepta al editarse "desde un hito" (modal
// del expediente o plantillasDocs antiguas). En una sección recurrente el nombre
// y el plazo del periodo no son de la plantilla, igual que antes.
const CAMPOS_POR_TIPO = {
  hito: ["docs", "cumplimiento", "nombre", "plazoDias", "plazoBase", "plazoHabiles", "norma", "nota"],
  recurrente: ["docs", "cumplimiento", "norma"],
  eventual: ["docs", "cumplimiento"],
  opcional: ["docs", "cumplimiento"],
};

export const limpiarDocs = (docs) => [...new Set((docs || []).map((d) => String(d).trim()).filter(Boolean))];

// Aplica `cambios` sobre la plantilla ubicada y devuelve la lista de campos que
// cambiaron de verdad. Muta la plantilla.
export const aplicarCambiosPlantilla = (ubicacion, cambios = {}) => {
  const p = ubicacion.plantilla;
  const cambiados = [];
  for (const campo of CAMPOS_POR_TIPO[ubicacion.tipo] || []) {
    if (cambios[campo] === undefined) continue;
    let valor = cambios[campo];
    if (campo === "docs") {
      if (!Array.isArray(valor)) continue;
      valor = limpiarDocs(valor);
    } else if (campo === "plazoDias") valor = Number(valor) || 0;
    else if (campo === "plazoHabiles") valor = valor !== false;
    if (JSON.stringify(p[campo]) !== JSON.stringify(valor)) {
      p[campo] = valor;
      cambiados.push(campo);
    }
  }
  return cambiados;
};

// Sección donde se inserta un hito agregado "a una etapa" (modelo anterior de
// catalogoHitos): la sección con ese código; si no hay, la última sección no
// recurrente de la etapa con ese código; si la etapa no tiene ninguna, se le
// agrega una; si la etapa no existe (por ejemplo "P", hitos propios), se crea
// al final del árbol. Muta el árbol cuando crea algo.
export const seccionPara = (arbol, etapaCodigo, etapaNombre) => {
  const codigo = String(etapaCodigo || "P");
  for (const etapa of arbol.etapas) {
    const exacta = (etapa.secciones || []).find((s) => s.codigo === codigo && !s.recurrente);
    if (exacta) return { etapa, seccion: exacta };
  }
  let etapa = arbol.etapas.find((e) => e.codigo === codigo);
  if (etapa) {
    const fijas = (etapa.secciones || []).filter((s) => !s.recurrente);
    if (fijas.length) return { etapa, seccion: fijas[fijas.length - 1] };
  } else {
    etapa = { id: uid(), codigo, nombre: etapaNombre || (codigo === "P" ? "Hitos propios" : codigo), secciones: [] };
    arbol.etapas.push(etapa);
  }
  const seccion = { id: uid(), codigo, nombre: etapa.nombre, hitos: [] };
  etapa.secciones = [...(etapa.secciones || []), seccion];
  return { etapa, seccion };
};

// Hito del catálogo personalizado anterior (catalogoHitos / agregarCatalogoHito)
// convertido a plantilla.
export const plantillaDesdeHitoPersonal = (hito = {}) => completarPlantilla({
  id: hito.id,
  clave: hito.clave || `cat_${uid()}`,
  nombre: String(hito.nombre || "").trim(),
  docs: limpiarDocs(hito.docs),
  cumplimiento: hito.cumplimiento || "",
  plazoDias: Number(hito.dias ?? hito.plazoDias ?? 0),
  plazoBase: hito.base || hito.plazoBase || "inicio",
  plazoHabiles: (hito.habiles ?? hito.plazoHabiles) !== false,
  norma: hito.norma || "Ley 32069 y su Reglamento",
  nota: hito.nota || "Hito agregado al catálogo personalizado.",
  activo: hito.activo !== false,
});

const ultimoNumero = (codigo) => Number(String(codigo || "").split(".").pop());

// ¿La clave es el código propio del hito dentro de esta sección? (p. ej. "1.2.5" en "1.2")
const esCodigoDeSeccion = (clave, seccion) => {
  const texto = String(clave || "");
  if (!/^\d+(\.\d+)+$/.test(texto) || !texto.startsWith(`${seccion.codigo}.`)) return false;
  return texto.split(".").length === String(seccion.codigo).split(".").length + 1;
};

// Código de cada hito de una sección fija. Un hito con `codigo` explícito lo
// conserva. Los que no lo tienen (catálogos guardados antes de que existiera el
// campo, o hitos recién agregados) lo reciben así: los de la semilla toman su
// clave, que ya es un código de la sección, y los propios (claves `cat_…`) el
// correlativo siguiente al mayor código de la sección, en orden. Todo código de la
// sección, activo o no, queda reservado, así que no hay duplicados.
const codigosDeSeccion = (seccion) => {
  const hitos = seccion.hitos || [];
  const propio = (h) => h.codigo || (esCodigoDeSeccion(h.clave, seccion) ? h.clave : null);
  const reservados = new Set();
  for (const h of hitos) {
    const codigo = propio(h);
    if (codigo) reservados.add(codigo);
  }
  const numeros = [...reservados].map(ultimoNumero).filter(Number.isFinite);
  let siguiente = Math.max(0, ...numeros) + 1;
  const usados = new Set();
  const codigos = new Map();
  for (const h of hitos) {
    let codigo = propio(h);
    if (!codigo || usados.has(codigo)) {
      codigo = `${seccion.codigo}.${siguiente}`;
      siguiente += 1;
    }
    usados.add(codigo);
    codigos.set(h, codigo);
  }
  return codigos;
};

// Completa el `codigo` de los hitos que no lo tienen (ver `codigosDeSeccion`).
// Devuelve true si cambió algo. Muta el catálogo.
export const asignarCodigos = (catalogo) => {
  let cambio = false;
  for (const ambito of AMBITOS) {
    for (const etapa of catalogo?.[ambito]?.etapas || []) {
      for (const seccion of etapa.secciones || []) {
        if (seccion.recurrente || !(seccion.hitos || []).some((h) => !h.codigo)) continue;
        const codigos = codigosDeSeccion(seccion);
        for (const h of seccion.hitos) {
          if (!h.codigo) { h.codigo = codigos.get(h); cambio = true; }
        }
      }
    }
  }
  return cambio;
};

// Recalcula por posición el código de todos los hitos de una sección, activos e
// inactivos: `<código de la sección>.<posición>`. Lo usa el editor al reordenar,
// agregar o quitar un hito. Las claves no cambian. Muta la sección.
export const renumerarHitos = (seccion) => {
  (seccion.hitos || []).forEach((h, i) => { h.codigo = `${seccion.codigo}.${i + 1}`; });
  return seccion;
};

// Etapa donde se numeran los trámites eventuales de cada tipo de contrato
// (`crearTareaEventual`). El editor no la entrega a una etapa nueva.
export const PREFIJO_EVENTUALES = { obra: "1.4", consultoria: "2.5" };

// Siguiente código libre para una etapa nueva del árbol (`1.6`, `2.7`…). Salta el
// de los trámites eventuales aunque el árbol no lo use.
export const siguienteCodigoEtapa = (arbol, ambito) => {
  const prefijo = `${arbol.codigo}.`;
  const numeros = (arbol.etapas || [])
    .map((e) => String(e.codigo))
    .filter((c) => c.startsWith(prefijo) && !c.slice(prefijo.length).includes("."))
    .map((c) => Number(c.slice(prefijo.length)))
    .filter(Number.isFinite);
  numeros.push(ultimoNumero(PREFIJO_EVENTUALES[ambito]));
  return `${prefijo}${Math.max(...numeros) + 1}`;
};

// Siguiente código libre para una sección nueva de la etapa: un hijo directo del
// código de la etapa que no usen otra sección ni los hitos de una sección que
// comparte el código de la etapa (así `1.2.10` evita los hitos 1.2.1 a 1.2.9).
export const siguienteCodigoSeccion = (etapa) => {
  const prefijo = `${etapa.codigo}.`;
  const hijoDirecto = (c) => String(c).startsWith(prefijo) && !String(c).slice(prefijo.length).includes(".");
  const usados = [];
  for (const seccion of etapa.secciones || []) {
    if (hijoDirecto(seccion.codigo)) usados.push(seccion.codigo);
    for (const h of seccion.hitos || []) if (hijoDirecto(h.codigo)) usados.push(h.codigo);
  }
  const numeros = usados.map(ultimoNumero).filter(Number.isFinite);
  return `${prefijo}${Math.max(0, ...numeros) + 1}`;
};

// ------------------------------- PASOS -------------------------------
// Solo la forma y la limpieza de la lista editable (§5.5). La lógica del flujo
// (plazos, movimientos, estado) no está aquí.
export const RESPONSABLES_PASO = ["contratista", "supervision", "entidad"];
export const TIPOS_REGISTRO_PASO = ["asiento", "presentacion", "respuesta", "otro"];
export const AL_VENCER_PASO = ["aviso", "silencio_positivo"];
export const ALERTAS_POR_DEFECTO = [5, 3, 1];

// Texto → clave: minúsculas, sin tildes, con guiones bajos.
export const slugClave = (texto) =>
  String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

// Clave a partir de un nombre que no choque con las `usadas`.
export const claveUnica = (nombre, usadas = []) => {
  const base = slugClave(nombre) || "paso";
  const ocupadas = new Set(usadas);
  if (!ocupadas.has(base)) return base;
  let n = 2;
  while (ocupadas.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
};

export const pasoNuevo = () => ({
  clave: "",
  nombre: "",
  responsable: "contratista",
  tipoRegistro: "presentacion",
  plazoDias: 0,
  habiles: true,
  desde: "",
  alertas: [...ALERTAS_POR_DEFECTO],
  alVencer: "aviso",
  verificado: false,
});

// Lista de números a partir de un texto separado por comas ("5, 3, 1").
export const alertasDesdeTexto = (texto) =>
  [...new Set(String(texto ?? "").split(/[,;\s]+/).map(Number).filter((n) => Number.isFinite(n) && n >= 0))]
    .sort((a, b) => b - a);

// Deja la lista de pasos lista para guardarse: campos por defecto, clave (del
// nombre si está vacía, única en la lista) y `desde` solo si apunta a un paso
// anterior. No cambia las claves que ya existen.
export const normalizarPasos = (pasos) => {
  const salida = [];
  for (const crudo of Array.isArray(pasos) ? pasos : []) {
    const base = pasoNuevo();
    const paso = { ...base, ...crudo };
    const usadas = salida.map((p) => p.clave);
    paso.nombre = String(paso.nombre ?? "").trim();
    const clave = slugClave(paso.clave) || "";
    paso.clave = clave && !usadas.includes(clave) ? clave : claveUnica(clave || paso.nombre, usadas);
    if (!RESPONSABLES_PASO.includes(paso.responsable)) paso.responsable = base.responsable;
    if (!TIPOS_REGISTRO_PASO.includes(paso.tipoRegistro)) paso.tipoRegistro = base.tipoRegistro;
    if (!AL_VENCER_PASO.includes(paso.alVencer)) paso.alVencer = base.alVencer;
    paso.plazoDias = Math.max(0, Number(paso.plazoDias) || 0);
    paso.habiles = paso.habiles !== false;
    paso.verificado = paso.verificado === true;
    paso.alertas = Array.isArray(paso.alertas)
      ? [...new Set(paso.alertas.map(Number).filter((n) => Number.isFinite(n) && n >= 0))].sort((a, b) => b - a)
      : [...ALERTAS_POR_DEFECTO];
    paso.desde = usadas.includes(paso.desde) ? paso.desde : "";
    salida.push(paso);
  }
  return salida;
};

// Genera los hitos de un contrato nuevo desde el catálogo almacenado. Omite las
// plantillas con `activo: false`. Los hitos ya creados en otros contratos no se tocan.
export const crearTareas = (tramite, catalogo, feriados) => {
  const arbol = catalogo?.[ambitoDe(tramite.tipo_objeto)] || { etapas: [] };
  const tareas = [];
  for (const etapa of arbol.etapas || []) {
    for (const seccion of etapa.secciones || []) {
      const plantilla = seccion.plantilla;
      if (seccion.recurrente === "mensual") {
        if (!plantilla || plantilla.activo === false) continue;
        const todos = mesesDelContrato(tramite);
        const periodos = seccion.soloPrimerPeriodo ? todos.slice(0, 1) : todos;
        const dia = seccion.diaLimite || 10;
        periodos.forEach((p, i) => {
          tareas.push(crearTarea(tramite, etapa, seccion, {
            ...plantilla,
            codigo: `${seccion.codigo}.${i + 1}`,
            nombre: `${plantilla.nombre} ${pad(i + 1)} — ${MESES[p.mes - 1]} ${p.anio}`,
          }, {
            recurrente: true,
            periodo: p.periodo,
            diaLimite: dia,
            frecuencia: "mensual",
            fecha_limite: `${p.periodo}-${pad(dia)}`,
            tipo: "recurrente",
            clavePlantilla: seccion.codigo,
          }));
        });
      } else if (seccion.recurrente === "anual") {
        if (!plantilla || plantilla.activo === false) continue;
        const inicio = parseFecha(tramite.fecha_inicio || hoy());
        const fin = parseFecha(tramite.fecha_fin || iso(addMeses(inicio, 11)));
        const totalMeses = Math.max(
          1,
          (fin.getFullYear() - inicio.getFullYear()) * 12 + (fin.getMonth() - inicio.getMonth()) + 1
        );
        const cantidad = Math.max(1, Math.ceil(totalMeses / 12));
        for (let i = 0; i < Math.min(cantidad, 6); i += 1) {
          const vence = totalMeses <= 12
            ? sumarDias(iso(fin), -Number(seccion.diaLimite || 15))
            : sumarDias(iso(addMeses(inicio, (i + 1) * 12)), -Number(seccion.diaLimite || 15));
          tareas.push(crearTarea(tramite, etapa, seccion, {
            ...plantilla,
            codigo: `${seccion.codigo}.${i + 1}`,
            nombre: `${plantilla.nombre} ${i + 1}`,
          }, {
            recurrente: true,
            periodo: `Año ${i + 1}`,
            diaLimite: seccion.diaLimite || 15,
            frecuencia: "anual",
            fecha_limite: vence,
            tipo: "recurrente",
            clavePlantilla: seccion.codigo,
          }));
        }
      } else {
        const codigos = codigosDeSeccion(seccion);
        for (const hito of seccion.hitos || []) {
          if (hito.activo === false) continue;
          const efectiva = { ...hito, codigo: codigos.get(hito) };
          const extra = {
            fecha_limite: calcularVence(tramite, efectiva, feriados),
            plantilla: hito.clave,
            clavePlantilla: hito.clave,
          };
          if (String(hito.clave).startsWith("cat_")) extra.origen = "catalogo";
          tareas.push(crearTarea(tramite, etapa, seccion, efectiva, extra));
        }
      }
    }
  }
  return tareas;
};

export const TIPOS_FIANZA = [
  { clave: "fiel_cumplimiento", etiqueta: "Fiel cumplimiento" },
  { clave: "adelanto_directo", etiqueta: "Adelanto directo" },
  { clave: "adelanto_materiales", etiqueta: "Adelanto de materiales" },
  { clave: "por_avance", etiqueta: "Por avance" },
];

// Hitos que no se generan por defecto, pero que se pueden agregar desde el expediente.
export const HITOS_OPCIONALES = {
  Obra: [
    {
      clave: "seace_obra",
      nombre: "Registro del contrato en el SEACE",
      etapaCodigo: "1.1", etapaNombre: "Contrato y expediente",
      docs: ["Ficha de registro del contrato", "Comprobante de publicación"],
      dias: 5, habiles: true, base: "suscripcion",
      norma: "Ley 32069 y su Reglamento",
      nota: "Trámite de la entidad. Se agrega solo si corresponde.",
    },
    {
      clave: "conformidad_expediente",
      nombre: "Comunicación de conformidad del expediente técnico",
      etapaCodigo: "1.1", etapaNombre: "Contrato y expediente",
      docs: ["Carta de comunicación al contratista", "Cargo de recepción"],
      dias: 5, habiles: true, base: "suscripcion",
      norma: "Ley 32069 y su Reglamento",
      nota: "Se agrega cuando la entidad emite la conformidad.",
    },
    {
      clave: "residente_obra",
      nombre: "Designación del residente de obra",
      etapaCodigo: "1.1", etapaNombre: "Contrato y expediente",
      docs: ["Carta de designación del residente", "CV del residente", "Certificado de habilidad profesional"],
      dias: 5, habiles: true, base: "suscripcion",
      norma: "Ley 32069 y su Reglamento",
      nota: "Se agrega cuando se designe al residente.",
    },
  ],
  "Consultoría de obra": [
    {
      clave: "seace_consultoria",
      nombre: "Registro del contrato en el SEACE",
      etapaCodigo: "2.1", etapaNombre: "Contrato y expediente",
      docs: ["Ficha de registro", "Comprobante de publicación"],
      dias: 5, habiles: true, base: "suscripcion",
      norma: "Ley 32069 y su Reglamento",
      nota: "Trámite de la entidad. Se agrega solo si corresponde.",
    },
  ],
};

// Eventuales y opcionales activos del catálogo para un tipo de contrato.
export const listarEventuales = (tipo, catalogo) =>
  (catalogo?.eventuales?.[ambitoDe(tipo)] || []).filter((e) => e.activo !== false);

export const listarHitosOpcionales = (tipo, catalogo) =>
  (catalogo?.opcionales?.[ambitoDe(tipo)] || []).filter((e) => e.activo !== false);

export const crearTareaEventual = (tramite, clave, existentes = [], catalogo, feriados) => {
  const modelo = listarEventuales(tramite.tipo_objeto, catalogo).find((x) => x.clave === clave);
  if (!modelo) return null;
  const prefijo = PREFIJO_EVENTUALES[ambitoDe(tramite.tipo_objeto)];
  const etapa = { codigo: prefijo, nombre: "Modificaciones y ampliaciones" };
  const seccion = { codigo: prefijo, nombre: "Modificaciones y ampliaciones" };
  const numeros = existentes
    .filter((t) => t.etapaCodigo === prefijo)
    .map((t) => Number(String(t.codigo || "").split(".").pop()))
    .filter((n) => Number.isFinite(n));
  const count = (numeros.length ? Math.max(...numeros) : 0) + 1;
  const dias = Number(modelo.plazoDias || 0);
  const habiles = modelo.plazoHabiles !== false;
  return crearTarea(tramite, etapa, seccion, {
    codigo: `${prefijo}.${count}`,
    nombre: modelo.nombre,
    docs: [...(modelo.docs || [])],
    cumplimiento: modelo.cumplimiento || "",
    plazoDias: dias,
    plazoBase: "manual",
    plazoHabiles: habiles,
    norma: modelo.norma || "",
    nota: modelo.nota || "Trámite eventual agregado al expediente. No se crea automáticamente.",
    pasos: modelo.pasos || [],
    plazoLevantamiento: modelo.plazoLevantamiento || null,
  }, {
    tipo: "eventual",
    clave: modelo.clave,
    silencioPositivo: Boolean(modelo.silencioPositivo),
    diasSilencio: Number(modelo.diasSilencio ?? dias) || 0,
    fecha_limite: dias ? (habiles ? sumarHabiles(hoy(), dias, feriados) : sumarDias(hoy(), dias)) : "",
  });
};
