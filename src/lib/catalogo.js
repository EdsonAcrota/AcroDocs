// Catálogo jerárquico de hitos y trámites por tipo de contratación.
// Cada hito se crea automáticamente al registrar la obra o consultoría.
// Los trámites eventuales (cambio de personal, ampliación, etc.) se agregan
// desde el expediente cuando ocurren.

const FERIADOS_BASE = [
  "2026-01-01", "2026-01-02", "2026-04-02", "2026-04-03", "2026-05-01",
  "2026-06-07", "2026-06-29", "2026-07-23", "2026-07-28", "2026-07-29",
  "2026-08-06", "2026-08-30", "2026-10-08", "2026-11-01", "2026-12-08",
  "2026-12-09", "2026-12-25",
];
let feriadosActivos = [...FERIADOS_BASE];

export const configurarFeriados = (feriados) => {
  feriadosActivos = Array.isArray(feriados)
    ? [...new Set(feriados)].sort()
    : [...FERIADOS_BASE];
};

const uid = () =>
  (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const pad = (n) => String(n).padStart(2, "0");
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const parseFecha = (iso) => (iso ? new Date(`${iso}T12:00:00`) : new Date());
const iso = (d) => d.toISOString().slice(0, 10);

const sumarDias = (fecha, dias) => {
  const d = parseFecha(fecha);
  d.setDate(d.getDate() + Number(dias || 0));
  return iso(d);
};

const sumarHabiles = (fecha, dias, feriados = feriadosActivos) => {
  const d = parseFecha(fecha);
  let n = Number(dias) || 0;
  while (n > 0) {
    d.setDate(d.getDate() + 1);
    const f = iso(d);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6 && !feriados.includes(f)) n -= 1;
  }
  return iso(d);
};

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

export const catalogoDe = (tipo) => (esConsultoria(tipo) ? CONSULTORIA : OBRA);

const calcularVence = (tramite, plantilla) => {
  const dias = Number(plantilla.plazoDias || 0);
  if (!dias) return "";
  const fechaBase = plantilla.plazoBase === "suscripcion"
    ? (tramite.fecha_suscripcion || tramite.created_at || tramite.fecha_inicio || hoy())
    : (tramite.fecha_inicio || hoy());
  return plantilla.plazoHabiles === false
    ? sumarDias(fechaBase, dias)
    : sumarHabiles(fechaBase, dias);
};

const crearTarea = (tramite, etapa, seccion, plantilla, extra = {}) => ({
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
  docsRequeridos: plantilla.docs || [],
  documentos: [],
  plazoDias: plantilla.plazoDias || 0,
  plazoBase: plantilla.plazoBase || "inicio",
  plazoHabiles: plantilla.plazoHabiles !== false,
  norma: plantilla.norma || "",
  nota: plantilla.nota || "",
  recurrente: false,
  periodo: "",
  ...extra,
});

export const crearTareas = (tramite, plantillasDocs = {}, catalogoHitos = []) => {
  const catalogo = catalogoDe(tramite.tipo_objeto);
  const tareas = [];
  const docsDe = (clave, originales) => plantillasDocs[clave]?.docs || originales || [];
  for (const etapa of catalogo.etapas) {
    for (const seccion of etapa.secciones) {
      if (seccion.recurrente === "mensual") {
        const todos = mesesDelContrato(tramite);
        const periodos = seccion.soloPrimerPeriodo ? todos.slice(0, 1) : todos;
        const dia = seccion.diaLimite || 10;
        periodos.forEach((p, i) => {
          const plantilla = seccion.plantilla;
          const nombre = `${plantilla.nombre} ${pad(i + 1)} — ${MESES[p.mes - 1]} ${p.anio}`;
          const override = plantillasDocs[seccion.codigo] || {};
          tareas.push(crearTarea(tramite, etapa, seccion, {
            ...plantilla,
            codigo: `${seccion.codigo}.${i + 1}`,
            nombre,
            docs: docsDe(seccion.codigo, plantilla.docs),
            cumplimiento: override.cumplimiento !== undefined ? override.cumplimiento : (plantilla.cumplimiento || ""),
            norma: override.norma !== undefined ? override.norma : plantilla.norma,
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
        const inicio = parseFecha(tramite.fecha_inicio || hoy());
        const fin = parseFecha(tramite.fecha_fin || iso(addMeses(inicio, 11)));
        const totalMeses = Math.max(
          1,
          (fin.getFullYear() - inicio.getFullYear()) * 12 + (fin.getMonth() - inicio.getMonth()) + 1
        );
        const cantidad = Math.max(1, Math.ceil(totalMeses / 12));
        for (let i = 0; i < Math.min(cantidad, 6); i += 1) {
          const plantilla = seccion.plantilla;
          const vence = totalMeses <= 12
            ? sumarDias(iso(fin), -Number(seccion.diaLimite || 15))
            : sumarDias(iso(addMeses(inicio, (i + 1) * 12)), -Number(seccion.diaLimite || 15));
          const override = plantillasDocs[seccion.codigo] || {};
          tareas.push(crearTarea(tramite, etapa, seccion, {
            ...plantilla,
            codigo: `${seccion.codigo}.${i + 1}`,
            nombre: `${plantilla.nombre} ${i + 1}`,
            docs: docsDe(seccion.codigo, plantilla.docs),
            cumplimiento: override.cumplimiento !== undefined ? override.cumplimiento : (plantilla.cumplimiento || ""),
            norma: override.norma !== undefined ? override.norma : plantilla.norma,
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
        for (const plantilla of seccion.tareas) {
          const override = plantillasDocs[plantilla.codigo] || {};
          const efectiva = {
            ...plantilla,
            docs: docsDe(plantilla.codigo, plantilla.docs),
            nombre: override.nombre !== undefined ? override.nombre : plantilla.nombre,
            cumplimiento: override.cumplimiento !== undefined ? override.cumplimiento : (plantilla.cumplimiento || ""),
            plazoDias: override.plazoDias !== undefined ? override.plazoDias : plantilla.plazoDias,
            plazoBase: override.plazoBase !== undefined ? override.plazoBase : plantilla.plazoBase,
            plazoHabiles: override.plazoHabiles !== undefined ? override.plazoHabiles : plantilla.plazoHabiles,
            norma: override.norma !== undefined ? override.norma : plantilla.norma,
            nota: override.nota !== undefined ? override.nota : plantilla.nota,
          };
          tareas.push(crearTarea(tramite, etapa, seccion, efectiva, {
            fecha_limite: calcularVence(tramite, efectiva),
          }));
        }
      }
    }
  }

  // Hitos agregados por el usuario a su catálogo. Se generan como hitos fijos
  // en el contrato, con código correlativo dentro de la etapa elegida.
  for (const hito of catalogoHitos || []) {
    if (hito.activo === false) continue;
    if (hito.tipoObjeto && hito.tipoObjeto !== tramite.tipo_objeto) continue;
    const etapa = { codigo: hito.etapaCodigo, nombre: hito.etapaNombre };
    const seccion = { codigo: hito.etapaCodigo, nombre: hito.etapaNombre };
    const numeros = tareas
      .filter((t) => t.seccionCodigo === seccion.codigo)
      .map((t) => Number(String(t.codigo || "").split(".").pop()))
      .filter((n) => Number.isFinite(n));
    const consecutivo = (numeros.length ? Math.max(...numeros) : 0) + 1;
    const clave = hito.clave || hito.id;
    const plantilla = {
      codigo: `${seccion.codigo}.${consecutivo}`,
      nombre: hito.nombre,
      docs: docsDe(clave, hito.docs),
      cumplimiento: plantillasDocs[clave]?.cumplimiento ?? hito.cumplimiento ?? "",
      plazoDias: Number(hito.dias || 0),
      plazoBase: hito.base || "inicio",
      plazoHabiles: hito.habiles !== false,
      norma: hito.norma || "Ley 32069 y su Reglamento",
      nota: hito.nota || "Hito agregado al catálogo personalizado.",
    };
    tareas.push(crearTarea(tramite, etapa, seccion, plantilla, {
      fecha_limite: calcularVence(tramite, plantilla),
      plantilla: clave,
      clavePlantilla: clave,
      origen: "catalogo",
    }));
  }

  return tareas;
};

// Plantillas de documentos editables por el usuario. La clave es el código
// del hito fijo o de la sección recurrente; se guardan en localStorage y se
// aplican a los contratos que se creen después de la edición.
export const plantillasPorDefecto = () => {
  const mapa = {};
  for (const catalogo of [OBRA, CONSULTORIA]) {
    for (const etapa of catalogo.etapas) {
      for (const seccion of etapa.secciones) {
        if (seccion.recurrente) {
          mapa[seccion.codigo] = {
            docs: [...(seccion.plantilla?.docs || [])],
            cumplimiento: seccion.plantilla?.cumplimiento || "",
          };
        } else {
          for (const tarea of seccion.tareas || []) {
            mapa[tarea.codigo] = { docs: [...(tarea.docs || [])], cumplimiento: tarea.cumplimiento || "" };
          }
        }
      }
    }
  }
  for (const lista of Object.values(EVENTUALES)) {
    for (const op of lista) {
      mapa[`eventual:${op.clave}`] = { docs: [...(op.docs || [])], cumplimiento: "" };
    }
  }
  return mapa;
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

export const listarHitosOpcionales = (tipo) =>
  esConsultoria(tipo) ? HITOS_OPCIONALES["Consultoría de obra"] : HITOS_OPCIONALES.Obra;

export const crearTareaEventual = (tramite, clave, existentes = []) => {
  const lista = esConsultoria(tramite.tipo_objeto)
    ? EVENTUALES["Consultoría de obra"]
    : EVENTUALES.Obra;
  const modelo = lista.find((x) => x.clave === clave);
  if (!modelo) return null;
  const prefijo = esConsultoria(tramite.tipo_objeto) ? "2.5" : "1.4";
  const etapa = { codigo: prefijo, nombre: "Modificaciones y ampliaciones" };
  const seccion = { codigo: prefijo, nombre: "Modificaciones y ampliaciones" };
  const numeros = existentes
    .filter((t) => t.etapaCodigo === prefijo)
    .map((t) => Number(String(t.codigo || "").split(".").pop()))
    .filter((n) => Number.isFinite(n));
  const count = (numeros.length ? Math.max(...numeros) : 0) + 1;
  return crearTarea(tramite, etapa, seccion, {
    codigo: `${prefijo}.${count}`,
    nombre: modelo.nombre,
    docs: modelo.docs,
    plazoDias: modelo.dias || 0,
    plazoBase: "manual",
    plazoHabiles: modelo.habiles !== false,
    norma: modelo.norma || "",
    nota: "Trámite eventual agregado al expediente. No se crea automáticamente.",
  }, {
    tipo: "eventual",
    clave: modelo.clave,
    silencioPositivo: Boolean(modelo.silencioPositivo),
    diasSilencio: modelo.dias || 0,
    fecha_limite: modelo.dias ? (modelo.habiles ? sumarHabiles(hoy(), modelo.dias) : sumarDias(hoy(), modelo.dias)) : "",
  });
};

export const listarEventuales = (tipo) =>
  esConsultoria(tipo) ? EVENTUALES["Consultoría de obra"] : EVENTUALES.Obra;
