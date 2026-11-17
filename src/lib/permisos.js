// Roles y permisos del expediente. Módulo puro: no toca el store ni el DOM.
// La matriz (rol -> lista de claves) vive en los datos (`permisosRoles`) y se
// pasa siempre como argumento; aquí solo está el catálogo y la lógica de decisión.

// Las 19 claves de permiso, en el orden en que se muestran en la matriz.
// `peligroso` marca los que borran datos (la interfaz los resalta).
export const PERMISOS = [
  { clave: "ver_todos", grupo: "Contratos", nombre: "Ver todos los contratos (si no lo tiene, solo los asignados)" },
  { clave: "crear", grupo: "Contratos", nombre: "Crear contratos" },
  { clave: "editar", grupo: "Contratos", nombre: "Editar datos del contrato" },
  { clave: "eliminar", grupo: "Contratos", nombre: "Eliminar contratos", peligroso: true },
  { clave: "estado", grupo: "Hitos", nombre: "Cambiar estado de hitos" },
  { clave: "agregar", grupo: "Hitos", nombre: "Agregar hitos y trámites eventuales" },
  { clave: "plazos", grupo: "Hitos", nombre: "Modificar plazos y fechas límite" },
  { clave: "borrar_hito", grupo: "Hitos", nombre: "Eliminar hitos", peligroso: true },
  { clave: "subir", grupo: "Documentos", nombre: "Subir documentos" },
  { clave: "descargar", grupo: "Documentos", nombre: "Descargar documentos y ZIP" },
  { clave: "reemplazar", grupo: "Documentos", nombre: "Subir nueva versión de un documento (la anterior se conserva)" },
  { clave: "borrar_doc", grupo: "Documentos", nombre: "Eliminar documentos", peligroso: true },
  { clave: "registrar", grupo: "Seguimiento", nombre: "Registrar movimientos y cargos" },
  { clave: "corregir", grupo: "Seguimiento", nombre: "Corregir o anular movimientos y cargos" },
  { clave: "alertas", grupo: "Seguimiento", nombre: "Ver alertas de vencimiento en el Panel" },
  { clave: "catalogo", grupo: "Administración", nombre: "Editar el catálogo completo" },
  { clave: "feriados", grupo: "Administración", nombre: "Configurar feriados" },
  { clave: "usuarios", grupo: "Administración", nombre: "Gestionar usuarios y permisos" },
  { clave: "respaldo", grupo: "Administración", nombre: "Descargar respaldo completo" },
];

export const ROLES = [
  { clave: "gerente", nombre: "Gerente general (dueño)", descripcion: "Control total; no se puede limitar." },
  { clave: "socio", nombre: "Socio", descripcion: "Supervisa el avance y los riesgos." },
  { clave: "jefe", nombre: "Jefe de proyectos", descripcion: "Coordina los contratos y responde ante la entidad." },
  { clave: "residente", nombre: "Residente o ingeniero de campo", descripcion: "Opera las obras que tiene asignadas." },
  { clave: "asis_tec", nombre: "Asistente técnico", descripcion: "Arma expedientes técnicos e informes." },
  { clave: "asis_adm", nombre: "Asistente administrativo", descripcion: "Cartas, SCTR, fianzas y mesa de partes." },
  { clave: "finanzas", nombre: "Contabilidad y finanzas", descripcion: "Valorizaciones, pagos y cartas fianza." },
  { clave: "legal", nombre: "Asesor legal", descripcion: "Controversias, ampliaciones y penalidades." },
  { clave: "consulta", nombre: "Solo consulta", descripcion: "Auditor o personal externo." },
];

const TODAS = PERMISOS.map((p) => p.clave);

// Matriz inicial decidida por el usuario (§5.1). Cada rol recibe su propia copia
// del arreglo para que editar uno no altere a otro.
export const MATRIZ_INICIAL = {
  gerente: [...TODAS],
  socio: [...TODAS],
  jefe: [
    "ver_todos", "crear", "editar", "estado", "agregar", "plazos", "subir", "descargar",
    "reemplazar", "registrar", "corregir", "alertas", "catalogo",
  ],
  residente: ["estado", "subir", "descargar", "registrar", "alertas"],
  asis_tec: ["ver_todos", "estado", "subir", "descargar", "registrar", "alertas"],
  asis_adm: ["ver_todos", "estado", "subir", "descargar", "registrar", "alertas"],
  finanzas: ["ver_todos", "subir", "descargar", "registrar", "alertas"],
  legal: ["ver_todos", "subir", "descargar", "registrar", "alertas"],
  consulta: ["ver_todos", "descargar"],
};

// Roles del sistema anterior -> rol nuevo (migración de usuarios guardados).
export const ROL_ANTIGUO = {
  admin: "gerente",
  logistica: "asis_adm",
  area_usuaria: "asis_tec",
  legal: "legal",
  lectura: "consulta",
};

// El gerente siempre tiene todo: no depende de lo que diga la matriz.
const esGerente = (usuario) => usuario?.rol === "gerente";

const permisosDelRol = (matriz, usuario) => {
  const lista = matriz?.[usuario.rol];
  return Array.isArray(lista) ? lista : [];
};

// ¿El usuario puede ver este contrato? Con `ver_todos` ve cualquiera; si no,
// solo los que tiene asignados en `usuario.contratos`.
export const veContrato = (matriz, usuario, tramiteId) => {
  if (!usuario) return false;
  if (esGerente(usuario)) return true;
  if (permisosDelRol(matriz, usuario).includes("ver_todos")) return true;
  return Array.isArray(usuario.contratos) && usuario.contratos.includes(tramiteId);
};

// ¿El usuario tiene el permiso? Si se indica `tramiteId`, además debe ver ese
// contrato (así un residente solo actúa sobre los suyos).
export const tienePermiso = (matriz, usuario, permiso, tramiteId) => {
  if (!usuario) return false;
  if (esGerente(usuario)) return true;
  if (!permisosDelRol(matriz, usuario).includes(permiso)) return false;
  if (tramiteId !== undefined && tramiteId !== null) return veContrato(matriz, usuario, tramiteId);
  return true;
};
