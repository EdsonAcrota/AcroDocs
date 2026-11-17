// Migración de datos entre versiones del almacenamiento. Funciones puras: no
// tocan localStorage ni modifican su entrada. El store solo las invoca.

import { MATRIZ_INICIAL } from "./permisos.js";
import { FERIADOS_2026 } from "./fechas.js";
import {
  catalogoSemilla, ubicarPlantillas, aplicarCambiosPlantilla, plantillaDesdeHitoPersonal,
  seccionPara, ambitoDe,
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
