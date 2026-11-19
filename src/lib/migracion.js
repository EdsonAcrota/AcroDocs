// Migración de datos entre versiones del almacenamiento. Funciones puras: no
// tocan localStorage ni modifican su entrada. El store solo las invoca.

import { MATRIZ_INICIAL } from "./permisos.js";
import { FERIADOS_2026, sumarDias, sumarHabiles } from "./fechas.js";
import {
  catalogoSemilla, recorrerPlantillas, ubicarPlantillas, aplicarCambiosPlantilla,
  plantillaDesdeHitoPersonal, seccionPara, ambitoDe, AMBITOS,
} from "./catalogo.js";

const demo = (x, rol, nombre, contratos = []) => ({
  id: `u-${x}`,
  nombre,
  email: `${x}@acrodocs.local`,
  password: `${x}123`,
  rol,
  contratos,
  activo: true,
});

// Un usuario por rol. El prefijo del correo no siempre coincide con la clave del
// rol (tecnico -> asis_tec, administrativo -> asis_adm). El residente nace
// asignado al contrato demo t-001. Es una constante de referencia: quien la use
// debe copiarla (ver `copiarUsuariosDemo`).
export const USUARIOS_DEMO = [
  demo("gerente", "gerente", "Gerente General"),
  demo("socio", "socio", "Socio"),
  demo("jefe", "jefe", "Jefe de Proyectos"),
  demo("residente", "residente", "Residente de Obra", ["t-001"]),
  demo("tecnico", "asis_tec", "Asistente Técnico"),
  demo("administrativo", "asis_adm", "Asistente Administrativo"),
  demo("finanzas", "finanzas", "Contabilidad y Finanzas"),
  demo("legal", "legal", "Asesor Legal"),
  demo("consulta", "consulta", "Consulta"),
];

export const copiarUsuariosDemo = () => USUARIOS_DEMO.map((u) => ({ ...u, contratos: [...u.contratos] }));

// Cada rol recibe su propio arreglo: MATRIZ_INICIAL es una constante mutable.
export const copiarMatrizInicial = () =>
  Object.fromEntries(Object.entries(MATRIZ_INICIAL).map(([rol, permisos]) => [rol, [...permisos]]));

const clonar = (valor) => JSON.parse(JSON.stringify(valor));

// Datos de la empresa propia (§5.3). Fábrica compartida con el store: cada
// llamada devuelve un objeto nuevo, para que nadie mute un valor por defecto.
export const empresaVacia = () => ({ razonSocial: "", ruc: "" });

// §5.3: el contratista que empieza con "Consorcio" pasa a ser un ejecutor
// consorcio (ese texto es su nombre); el resto queda como la empresa propia.
const ejecutorDesde = (contratista) => {
  const texto = String(contratista || "").trim();
  if (/^consorcio\b/i.test(texto)) {
    return { tipo: "consorcio", nombre: texto, ruc: "", representante: "", integrantes: [] };
  }
  return { tipo: "empresa" };
};

// §5.4: plantillasDocs y catalogoHitos se funden en un solo catálogo.
// - plantillasDocs[clave] se aplica sobre la plantilla de la misma clave (código
//   del hito, código de la sección recurrente, "eventual:<clave>" u
//   "opcional:<clave>"). Una clave sin plantilla se descarta.
// - Cada catalogoHitos[i] se inserta al final de la sección `etapaCodigo` del
//   árbol de su tipo (ver `seccionPara`), con sus overrides de plantillasDocs.
// Los ids se generan aquí una sola vez; quien guarda el resultado los conserva.
export const fundirCatalogo = (plantillasDocs, catalogoHitos) => {
  const catalogo = catalogoSemilla();
  const overrides = plantillasDocs && typeof plantillasDocs === "object" ? plantillasDocs : {};
  for (const [clave, cambios] of Object.entries(overrides)) {
    if (!cambios || typeof cambios !== "object" || clave.startsWith("cat_")) continue;
    for (const ubicacion of ubicarPlantillas(catalogo, clave)) aplicarCambiosPlantilla(ubicacion, cambios);
  }
  for (const hito of Array.isArray(catalogoHitos) ? catalogoHitos : []) {
    if (!hito || !String(hito.nombre || "").trim()) continue;
    const plantilla = plantillaDesdeHitoPersonal(hito);
    const cambios = overrides[plantilla.clave];
    if (cambios && typeof cambios === "object") {
      aplicarCambiosPlantilla({ tipo: "hito", plantilla }, { docs: cambios.docs, cumplimiento: cambios.cumplimiento });
    }
    const { seccion } = seccionPara(catalogo[ambitoDe(hito.tipoObjeto)], hito.etapaCodigo, hito.etapaNombre);
    seccion.hitos.push(plantilla);
  }
  return catalogo;
};

// Agrega plantillas nuevas de la semilla sin tocar las que el usuario editó.
// Se usa al leer un v7 guardado, para que las mejoras del catálogo (por ejemplo
// nuevos trámites eventuales) aparezcan en instalaciones existentes.
export const fusionarNovedadesCatalogo = (catalogo) => {
  if (!catalogo || typeof catalogo !== "object") return false;
  const semilla = catalogoSemilla();
  const existentes = new Set();
  recorrerPlantillas(catalogo, (u) => existentes.add(`${u.tipo}|${u.ambito}|${u.plantilla.clave}`));

  // Solo se incorporan los trámites eventuales nuevos. No se reinsertan hitos
  // fijos ni opcionales que el usuario pudo quitar deliberadamente del catálogo.
  const NUEVOS = ["consulta_incidencias", "mayores_metrados", "intensificacion", "suspension_plazo"];
  let cambio = false;
  recorrerPlantillas(semilla, (u) => {
    const clave = u.plantilla.clave;
    if (u.tipo !== "eventual" || !NUEVOS.includes(clave)) return;
    if (!clave || existentes.has(`${u.tipo}|${u.ambito}|${clave}`)) return;
    const copia = JSON.parse(JSON.stringify(u.plantilla));
    if (u.tipo === "hito" || u.tipo === "recurrente") {
      const etapa = (catalogo[u.ambito]?.etapas || []).find((e) => e.codigo === u.etapa?.codigo);
      const seccion = (etapa?.secciones || []).find((s) => s.codigo === u.seccion?.codigo);
      if (!seccion) return;
      if (u.tipo === "recurrente") seccion.plantilla = copia;
      else {
        if (!Array.isArray(seccion.hitos)) seccion.hitos = [];
        seccion.hitos.push(copia);
      }
    } else {
      const lista = u.tipo === "eventual" ? "eventuales" : "opcionales";
      if (!catalogo[lista]?.[u.ambito]) return;
      catalogo[lista][u.ambito].push(copia);
    }
    existentes.add(`${u.tipo}|${u.ambito}|${clave}`);
    cambio = true;
  });
  return cambio;
};

// Actualiza el perfeccionamiento con los requisitos de las bases integradas
// (art. 88 del Reglamento). Solo actúa si la plantilla conserva exactamente la
// lista anterior: si el usuario ya la editó, se respeta su versión.
const PERFECCIONAMIENTO_ANTERIOR = {
  "1.1.1": [
    "Contrato suscrito",
    "Vigencia de poder del representante legal",
    "DNI del representante legal",
    "RUC de la empresa contratista",
    "Presupuesto de obra",
    "Declaración jurada de no impedimento",
    "Relación de maquinarias y equipos",
  ],
  "2.1.1": [
    "Contrato suscrito",
    "DNI del representante legal",
    "Presupuesto del servicio",
    "CV del equipo profesional",
    "Declaración jurada de no impedimento",
  ],
};

export const aplicarPerfeccionamientoBases = (catalogo) => {
  const semilla = catalogoSemilla();
  const buscar = (arbol, clave) => {
    let encontrada = null;
    recorrerPlantillas(arbol, (u) => {
      if (u.tipo === "hito" && u.plantilla.clave === clave) encontrada = u.plantilla;
    });
    return encontrada;
  };
  let cambio = false;
  for (const clave of Object.keys(PERFECCIONAMIENTO_ANTERIOR)) {
    const destino = buscar(catalogo, clave);
    const origen = buscar(semilla, clave);
    const anterior = PERFECCIONAMIENTO_ANTERIOR[clave];
    if (!destino || !origen) continue;
    if (JSON.stringify(destino.docs) === JSON.stringify(anterior)) {
      Object.assign(destino, { ...origen, id: destino.id });
      cambio = true;
    } else if (destino.verificado !== true && JSON.stringify(destino.docs) === JSON.stringify(origen.docs)) {
      destino.verificado = true;
      cambio = true;
    }
  }
  return cambio;
};

// Lleva el nuevo contenido de perfeccionamiento a los hitos ya generados en los
// contratos existentes, sin tocar sus archivos, estados ni fechas de seguimiento.
// Solo actualiza los hitos que todavía conservan la lista anterior.
export const actualizarPerfeccionamientoItems = (data) => {
  if (!data || !Array.isArray(data.items)) return false;
  const semilla = catalogoSemilla();
  const buscar = (clave) => {
    let encontrada = null;
    recorrerPlantillas(semilla, (u) => {
      if (u.tipo === "hito" && u.plantilla.clave === clave) encontrada = u.plantilla;
    });
    return encontrada;
  };
  const feriados = Array.isArray(data.feriados) && data.feriados.length ? data.feriados : FERIADOS_2026;
  let cambio = false;
  for (const item of data.items) {
    const anterior = PERFECCIONAMIENTO_ANTERIOR[item.codigo];
    if (!anterior || JSON.stringify(item.docsRequeridos) !== JSON.stringify(anterior)) continue;
    const plantilla = buscar(item.codigo);
    if (!plantilla) continue;
    item.docsRequeridos = [...plantilla.docs];
    item.docCumplimiento = plantilla.cumplimiento || item.docCumplimiento;
    item.plazoDias = plantilla.plazoDias;
    item.plazoBase = plantilla.plazoBase;
    item.plazoHabiles = plantilla.plazoHabiles !== false;
    item.norma = plantilla.norma || item.norma;
    item.nota = plantilla.nota || item.nota;
    const contrato = (data.tramites || []).find((t) => t.id === item.tramite_id);
    if (contrato && item.plazoDias) {
      const base = item.plazoBase === "suscripcion"
        ? (contrato.fecha_suscripcion || contrato.created_at || contrato.fecha_inicio)
        : (contrato.fecha_inicio || contrato.created_at);
      if (base) {
        item.fecha_limite = item.plazoHabiles
          ? sumarHabiles(base, item.plazoDias, feriados)
          : sumarDias(base, item.plazoDias);
      }
    }
    cambio = true;
  }
  return cambio;
};

// v6 -> v7. Conserva todos los contratos, hitos y documentos. La sesión se
// reinicia: las sesiones antiguas no tienen `usuarioId` y hay que volver a
// entrar con un usuario de la lista nueva. Un `catalogo` que ya venga en la
// entrada (la instalación nueva lo arma antes de generar los hitos demo) se
// conserva; si no, se funde desde plantillasDocs y catalogoHitos.
export const migrarV6aV7 = (v6) => {
  const origen = clonar(v6 || {});
  const tramites = Array.isArray(origen.tramites) ? origen.tramites : [];
  const items = Array.isArray(origen.items) ? origen.items : [];
  const { plantillasDocs, catalogoHitos, catalogo, ...resto } = origen;

  return {
    ...resto,
    catalogo: catalogo && typeof catalogo === "object" ? catalogo : fundirCatalogo(plantillasDocs, catalogoHitos),
    version: 7,
    session: null,
    feriados: Array.isArray(origen.feriados) && origen.feriados.length ? origen.feriados : [...FERIADOS_2026],
    tramites: tramites.map((t) => ({ ...t, ejecutor: t.ejecutor || ejecutorDesde(t.contratista) })),
    items: items.map((i) => ({ ...i, pasos: Array.isArray(i.pasos) ? i.pasos : [] })),
    usuarios: copiarUsuariosDemo(),
    permisosRoles: copiarMatrizInicial(),
    historial: [],
    empresa: empresaVacia(),
    movimientos: [],
    cargos: [],
  };
};
