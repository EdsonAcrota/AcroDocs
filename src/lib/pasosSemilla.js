// Secuencias de pasos iniciales de los trámites (§5.5). Son una semilla: el dueño
// las ajusta desde el catálogo. Todo plazo de la supervisión o la entidad queda en
// 0 y "por verificar" hasta que se confirme contra la norma; un plazo en 0 no
// genera alertas de vencimiento. Se identifican por la clave de la plantilla.

const paso = (clave, nombre, responsable, tipoRegistro, opciones = {}) => ({
  clave,
  nombre,
  responsable,
  tipoRegistro,
  plazoDias: opciones.dias || 0,
  habiles: opciones.habiles !== false,
  desde: opciones.desde || null,
  alertas: [5, 3, 1],
  alVencer: opciones.alVencer || "aviso",
  verificado: Boolean(opciones.verificado),
});

const AMPLIACION = [
  paso("inicio_causal", "Asiento de inicio de la causal", "contratista", "asiento"),
  paso("fin_causal", "Asiento de fin de la causal", "contratista", "asiento"),
  // 10 días hábiles desde el fin de la causal: dato del usuario.
  paso("solicitud", "Presentar la solicitud de ampliación", "contratista", "presentacion", { dias: 10, desde: "fin_causal", verificado: true }),
  paso("informe_supervision", "Informe de la supervisión", "supervision", "respuesta", { desde: "solicitud" }),
  paso("pronunciamiento_entidad", "Pronunciamiento de la entidad", "entidad", "respuesta", { desde: "informe_supervision", alVencer: "silencio_positivo" }),
];

const ADICIONAL = [
  paso("asiento_necesidad", "Asiento de la necesidad del adicional", "contratista", "asiento"),
  paso("expediente", "Presentar el expediente del adicional", "contratista", "presentacion"),
  paso("pronunciamiento_supervision", "Pronunciamiento de la supervisión", "supervision", "respuesta"),
  paso("resolucion_entidad", "Resolución de la entidad", "entidad", "respuesta"),
];

const CAMBIO_PERSONAL = [
  paso("solicitud", "Presentar la solicitud de cambio", "contratista", "presentacion"),
  // El plazo de 10 días hábiles ya estaba en el catálogo: se conserva, por verificar.
  paso("pronunciamiento_entidad", "Pronunciamiento de la entidad", "entidad", "respuesta", { dias: 10, alVencer: "silencio_positivo" }),
];

const VALORIZACION = [
  paso("presentacion", "Presentar a la supervisión", "contratista", "presentacion"),
  paso("conformidad_supervision", "Conformidad de la supervisión", "supervision", "respuesta"),
  paso("aprobacion_entidad", "Aprobación y pago de la entidad", "entidad", "respuesta"),
];

const INFORME_MENSUAL = [
  paso("presentacion", "Presentar el informe", "contratista", "presentacion"),
  paso("conformidad", "Conformidad", "supervision", "respuesta"),
];

export const PASOS_SEMILLA = {
  ampliacion: AMPLIACION,
  adicional: ADICIONAL,
  cambio_personal: CAMBIO_PERSONAL,
  "1.3.2": VALORIZACION,
  "2.3.2": VALORIZACION,
  "1.3.3": INFORME_MENSUAL,
  "2.3.3": INFORME_MENSUAL,
};

// Copia profunda de los pasos semilla de una plantilla, o [] si no tiene.
export const pasosSemillaDe = (clave) => JSON.parse(JSON.stringify(PASOS_SEMILLA[clave] || []));
