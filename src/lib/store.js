// Capa de datos del demo. Persiste en localStorage para que la app funcione
// sin Supabase. Los archivos adjuntos se guardan en IndexedDB (src/lib/archivos.js).
// En producción esta capa se reemplaza por Supabase/PostgreSQL conservando los
// mismos campos y la misma estructura jerárquica del expediente.

import {
  crearTareas,
  crearTareaEventual as crearTareaEventualCatalogo,
  listarEventuales as listarEventualesCatalogo,
  listarHitosOpcionales as listarHitosOpcionalesCatalogo,
  plantillasPorDefecto,
} from "./catalogo.js";
import { eliminarArchivo } from "./archivos.js";
import { hoy, sumarDias, sumarHabiles, diasEntre, FERIADOS_2026 } from "./fechas.js";
import { tienePermiso, veContrato, PERMISOS, ROLES } from "./permisos.js";
import { migrarV6aV7, copiarUsuariosDemo, copiarMatrizInicial } from "./migracion.js";

const KEY = "acrodocs_demo_v7";
// Claves de versiones anteriores que se migran al leer. Hoy solo v6; la lógica
// de transformación vive en migracion.js.
const KEYS_ANTERIORES = ["acrodocs_demo_v6"];
// Copia del texto crudo de v6, guardada antes de borrar la clave vieja
// (§5.8: respaldo previo a la migración). Configuración la ofrece para descargar.
const RESPALDO_V6 = "acrodocs_respaldo_v6";

const uid = () =>
  (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const normalizar = (texto) =>
  String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

const ordenarTareas = (tareas) =>
  [...tareas].sort((a, b) => String(a.codigo || "").localeCompare(String(b.codigo || ""), "es", { numeric: true }));

const marcar = (tareas, completados = [], revision = [], observados = []) => {
  for (const t of tareas) {
    if (completados.includes(t.codigo)) t.estado = "Completado";
    if (revision.includes(t.codigo)) t.estado = "En revisión";
    if (observados.includes(t.codigo)) t.estado = "Observado";
  }
  return tareas;
};

// La instalación nueva se arma con la forma v6 y se pasa por la misma
// migración que usan los datos existentes, para que ambas rutas den el mismo v7.
const seed = () => {
  const data = {
    version: 6,
    session: null,
    feriados: FERIADOS_2026,
    plantillasDocs: plantillasPorDefecto(),
    catalogoHitos: [],
    configFianzas: {},
    tramites: [
      {
        id: "t-001",
        codigo: "DEMO-OC-2026-001",
        denominacion: "Mejoramiento de la I.E. N° 579 – Quelcaya",
        entidad: "Municipalidad Distrital de San Jerónimo",
        contratista: "Consorcio Educativo Quelcaya",
        tipo_objeto: "Obra",
        area: "Infraestructura",
        monto: 1850000,
        fecha_inicio: "2026-06-01",
        fecha_fin: "2026-12-15",
        fecha_suscripcion: "2026-05-25",
        estado: "En ejecución",
        created_at: "2026-05-20",
      },
      {
        id: "t-002",
        codigo: "DEMO-CA-2026-002",
        denominacion: "Consultoría de obra para expediente técnico del mejoramiento vial",
        entidad: "Municipalidad Distrital de San Jerónimo",
        contratista: "Ingeniería y Proyectos del Sur S.A.C.",
        tipo_objeto: "Consultoría de obra",
        area: "Infraestructura",
        monto: 185000,
        fecha_inicio: "2026-08-03",
        fecha_fin: "2026-11-30",
        fecha_suscripcion: "2026-07-28",
        estado: "En ejecución",
        created_at: "2026-07-15",
      },
    ],
    items: [],
    ampliaciones: [],
  };

  const obra = marcar(
    crearTareas(data.tramites[0], data.plantillasDocs, data.catalogoHitos, data.feriados),
    [
      "1.1.1", "1.1.2", "1.1.4", "1.1.5",
      "1.2.1", "1.2.2", "1.2.3", "1.2.5", "1.2.6", "1.2.7", "1.2.8", "1.2.9",
      "1.2.10.1", "1.2.11.1",
      "1.3.2.1", "1.3.2.2", "1.3.2.3", "1.3.2.4", "1.3.2.5",
      "1.3.3.1", "1.3.3.2", "1.3.3.3", "1.3.3.4", "1.3.3.5",
    ],
    ["1.3.2.6", "1.3.3.6"],
    []
  );
  const sinAdelanto = obra.find((t) => t.codigo === "1.1.3");
  if (sinAdelanto) sinAdelanto.estado = "No aplica";

  const consultoria = marcar(
    crearTareas(data.tramites[1], data.plantillasDocs, data.catalogoHitos, data.feriados),
    [
      "2.1.1", "2.1.2", "2.1.3", "2.1.4", "2.1.5", "2.1.6", "2.1.7",
      "2.2.1", "2.2.2", "2.2.3", "2.2.4", "2.2.5", "2.2.6",
      "2.2.8.1", "2.2.8.2", "2.2.8.3",
      "2.3.1.1", "2.3.1.2",
      "2.3.2.1", "2.3.2.2", "2.3.2.3",
      "2.3.3.1", "2.3.3.2", "2.3.3.3",
    ],
    ["2.2.8.4", "2.3.1.3", "2.3.2.4", "2.3.3.4"],
    []
  );

  // Trámite eventual de ejemplo: cambio de personal clave en la obra.
  const cambio = crearTareaEventualCatalogo(
    data.tramites[0],
    "cambio_personal",
    obra,
    data.feriados
  );
  if (cambio) {
    cambio.estado = "En revisión";
    cambio.responsable = "Residente de obra";
    cambio.observacion = "Propuesta de reemplazo del residente por motivos de salud. Sustento y CV del propuesto adjuntos al expediente.";
    obra.push(cambio);
  }

  data.configFianzas[data.tramites[0].id] = { periodo: "anual", tipos: ["fiel_cumplimiento"] };
  data.configFianzas[data.tramites[1].id] = { periodo: "anual", tipos: ["fiel_cumplimiento"] };
  data.items = ordenarTareas([...obra, ...consultoria]);
  return migrarV6aV7(data);
};

const migrar = (anterior) => {
  const data = {
    version: 6,
    session: anterior?.session || null,
    feriados: anterior?.feriados?.length ? anterior.feriados : FERIADOS_2026,
    plantillasDocs: anterior?.plantillasDocs || plantillasPorDefecto(),
    catalogoHitos: Array.isArray(anterior?.catalogoHitos) ? anterior.catalogoHitos : [],
    configFianzas: anterior?.configFianzas || {},
    tramites: Array.isArray(anterior?.tramites) ? anterior.tramites : [],
    items: [],
    ampliaciones: [],
  };
  const itemsViejos = Array.isArray(anterior?.items) ? anterior.items : [];
  const ampsViejas = Array.isArray(anterior?.ampliaciones) ? anterior.ampliaciones : [];

  for (const t of data.tramites) {
    const previos = itemsViejos.filter((i) => i.tramite_id === t.id);
    const mapa = new Map(previos.map((i) => [normalizar(i.nombre), i]));
    const nuevas = crearTareas(t, data.plantillasDocs, data.catalogoHitos, data.feriados);
    for (const tarea of nuevas) {
      const viejo = mapa.get(normalizar(tarea.nombre));
      if (viejo) {
        tarea.estado = viejo.estado || tarea.estado;
        tarea.responsable = viejo.responsable || "";
        tarea.fecha = viejo.fecha || "";
        tarea.observacion = viejo.observacion || "";
      }
    }
    data.items.push(...nuevas);
  }

  // Las ampliaciones del modelo anterior pasan a ser trámites eventuales.
  for (const amp of ampsViejas) {
    const tramite = data.tramites.find((t) => t.id === amp.tramite_id);
    if (!tramite) continue;
    const existentes = data.items.filter((i) => i.tramite_id === tramite.id);
    const tarea = crearTareaEventualCatalogo(tramite, "ampliacion", existentes, data.feriados);
    if (!tarea) continue;
    tarea.nombre = `Ampliación de plazo — ${amp.causal || "sin causal"}`;
    tarea.estado = amp.estado === "Resuelta" ? "Completado" : "En revisión";
    tarea.observacion = amp.sustento || "";
    tarea.fecha_limite = amp.nuevo_fin || tarea.fecha_limite;
    tarea.fecha = amp.fecha_solicitud || tarea.fecha;
    data.items.push(tarea);
    if (amp.dias_solicitados) {
      tarea.observacion = `${tarea.observacion} Días solicitados: ${amp.dias_solicitados}.`.trim();
    }
  }

  data.items = ordenarTareas(data.items);
  return data;
};

let memoria = null;

const read = () => {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (Number(data.version) >= 7) {
        if (!Array.isArray(data.feriados)) data.feriados = [...FERIADOS_2026];
        if (!data.plantillasDocs || typeof data.plantillasDocs !== "object") data.plantillasDocs = plantillasPorDefecto();
        if (!Array.isArray(data.catalogoHitos)) data.catalogoHitos = [];
        if (!data.configFianzas || typeof data.configFianzas !== "object") data.configFianzas = {};
        if (!Array.isArray(data.usuarios)) data.usuarios = copiarUsuariosDemo();
        if (!data.permisosRoles || typeof data.permisosRoles !== "object") data.permisosRoles = copiarMatrizInicial();
        if (!Array.isArray(data.historial)) data.historial = [];
        if (!data.empresa || typeof data.empresa !== "object") data.empresa = { razonSocial: "", ruc: "" };
        if (!Array.isArray(data.movimientos)) data.movimientos = [];
        if (!Array.isArray(data.cargos)) data.cargos = [];
        return data;
      }
    }
    for (const key of KEYS_ANTERIORES) {
      const anterior = localStorage.getItem(key);
      if (anterior) {
        const data = migrarV6aV7(JSON.parse(anterior));
        // Si el respaldo no cabe, la migración sigue: no se bloquea el arranque.
        try { localStorage.setItem(RESPALDO_V6, anterior); } catch { /* sin espacio */ }
        localStorage.setItem(KEY, JSON.stringify(data));
        localStorage.removeItem(key);
        return data;
      }
    }
  } catch { /* almacenamiento no disponible */ }
  if (memoria) return memoria;
  const data = seed();
  memoria = data;
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* ignore */ }
  return data;
};

const write = (data) => {
  memoria = data;
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* ignore */ }
  return data;
};

// ---------- Configuración ----------
export const getFeriados = () => [...(read().feriados || [])].sort();

export const agregarFeriado = (fecha) => {
  if (!fecha) return getFeriados();
  const data = read();
  data.feriados = [...new Set([...(data.feriados || []), fecha])].sort();
  write(data);
  return getFeriados();
};

export const eliminarFeriado = (fecha) => {
  const data = read();
  data.feriados = (data.feriados || []).filter((f) => f !== fecha);
  write(data);
  return getFeriados();
};

// ---------- Sesión y permisos ----------
// En los datos solo se guarda `session: { usuarioId }`. La ficha completa se
// resuelve contra `data.usuarios` en cada lectura, así un cambio de rol,
// asignaciones o estado activo se refleja de inmediato en la sesión abierta.
const usuarioActual = (data) => {
  const id = data.session?.usuarioId;
  if (!id) return null;
  const usuario = (data.usuarios || []).find((u) => u.id === id);
  return usuario && usuario.activo ? usuario : null;
};

const fichaDeSesion = (usuario) => ({
  usuarioId: usuario.id,
  nombre: usuario.nombre,
  email: usuario.email,
  rol: usuario.rol,
  contratos: [...(usuario.contratos || [])],
});

const puedeEn = (data, permiso, tramiteId) =>
  tienePermiso(data.permisosRoles, usuarioActual(data), permiso, tramiteId);

const exigirEn = (data, permiso, tramiteId) => {
  if (!puedeEn(data, permiso, tramiteId)) throw new Error("No tienes permiso para esta acción.");
};

export const getSession = () => {
  const usuario = usuarioActual(read());
  return usuario ? fichaDeSesion(usuario) : null;
};

// ¿La sesión actual tiene el permiso? Con `tramiteId`, además debe ver ese contrato.
export const puede = (permiso, tramiteId) => puedeEn(read(), permiso, tramiteId);

// Igual que `puede`, pero lanza un error en vez de devolver false.
export const exigir = (permiso, tramiteId) => exigirEn(read(), permiso, tramiteId);

export const loginDemo = (email, password) => {
  const data = read();
  const correo = (email || "").trim().toLowerCase();
  const usuario = (data.usuarios || []).find((u) => String(u.email || "").toLowerCase() === correo);
  // Una cuenta sin contraseña guardada nunca entra, ni siquiera con un campo vacío.
  if (!usuario || String(usuario.password ?? "").trim() === "" || usuario.password !== password) {
    return { error: "Credenciales incorrectas. Revisa los usuarios de demostración." };
  }
  if (!usuario.activo) {
    return { error: "Este usuario está desactivado. Consulta con el gerente general." };
  }
  data.session = { usuarioId: usuario.id };
  write(data);
  return { session: fichaDeSesion(usuario) };
};

export const logout = () => {
  const data = read();
  data.session = null;
  write(data);
};

// ---------- Historial (auditoría) ----------
// Anota sobre `data` sin escribir: las funciones destructivas lo usan para que
// el cambio y su registro se guarden en una sola escritura.
const anotarHistorial = (data, { accion, objeto, objetoId, tramiteId, detalle }) => {
  const usuario = usuarioActual(data);
  const entrada = {
    id: uid(),
    fecha: new Date().toISOString(),
    usuario: usuario?.nombre || "Sistema",
    usuarioId: usuario?.id || null,
    accion,
    objeto,
    objetoId,
    detalle: detalle || "",
  };
  if (tramiteId !== undefined && tramiteId !== null) entrada.tramiteId = tramiteId;
  if (!Array.isArray(data.historial)) data.historial = [];
  data.historial.push(entrada);
  return entrada;
};

export const registrarHistorial = (entrada) => {
  const data = read();
  const registro = anotarHistorial(data, entrada);
  write(data);
  return registro;
};

// Del más reciente al más antiguo. `objeto` acepta un texto o una lista de textos.
// Solo muestra entradas de contratos que el usuario ve; sin sesión no hay nada.
export const listarHistorial = ({ tramiteId, objeto } = {}) => {
  const data = read();
  const usuario = usuarioActual(data);
  if (!usuario) return [];
  const objetos = objeto === undefined || objeto === null ? null : [].concat(objeto);
  return [...(data.historial || [])]
    .reverse()
    .filter((h) => tramiteId === undefined || tramiteId === null || h.tramiteId === tramiteId)
    .filter((h) => !objetos || objetos.includes(h.objeto))
    .filter((h) => h.tramiteId === undefined || h.tramiteId === null || veContrato(data.permisosRoles, usuario, h.tramiteId));
};

// ---------- Usuarios y matriz de permisos ----------
// Todo requiere `usuarios`. Cada cambio y su registro en el historial se guardan
// en una sola escritura (objeto "usuarios" para cuentas, "permisos" para la matriz).
const MSG_GERENTE_INTOCABLE = "La cuenta del gerente general no se puede modificar.";
const MSG_ULTIMO_GERENTE = "Debe haber al menos un gerente general activo.";
const MSG_SOLO_GERENTE_ASIGNA = "Solo un gerente general puede asignar el rol de gerente general.";

const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const textoVacio = (texto) => String(texto ?? "").trim() === "";
const correoNormal = (texto) => String(texto ?? "").trim().toLowerCase();
const nombreDeRol = (clave) => ROLES.find((r) => r.clave === clave)?.nombre || clave;
const rolExiste = (clave) => ROLES.some((r) => r.clave === clave);

// La contraseña demo nunca sale de la capa de datos hacia la interfaz.
const usuarioPublico = (usuario) => {
  const { password: _omitida, ...resto } = usuario;
  return { ...resto, contratos: [...(resto.contratos || [])] };
};

// Solo ids de contratos que existen, sin repetir.
const contratosExistentes = (data, contratos) => {
  const ids = new Set(data.tramites.map((t) => t.id));
  return [...new Set((Array.isArray(contratos) ? contratos : []).filter((id) => ids.has(id)))];
};

const gerentesActivosSalvo = (data, id) =>
  data.usuarios.filter((u) => u.rol === "gerente" && u.activo && u.id !== id).length;

const mismosElementos = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

export const listarUsuarios = () => {
  const data = read();
  exigirEn(data, "usuarios");
  return data.usuarios.map(usuarioPublico);
};

// Todos los contratos, para asignarlos a un usuario. No se filtra por visibilidad:
// quien administra usuarios debe poder asignar cualquiera, aunque él no los vea.
export const listarContratosAsignables = () => {
  const data = read();
  exigirEn(data, "usuarios");
  return data.tramites.map((t) => ({ id: t.id, codigo: t.codigo, denominacion: t.denominacion }));
};

export const crearUsuario = (datos = {}) => {
  const data = read();
  exigirEn(data, "usuarios");
  const nombre = String(datos.nombre ?? "").trim();
  const email = correoNormal(datos.email);
  if (!nombre) throw new Error("El nombre es obligatorio.");
  if (!CORREO_VALIDO.test(email)) throw new Error("Escribe un correo válido.");
  if (textoVacio(datos.password)) throw new Error("La contraseña es obligatoria.");
  if (!rolExiste(datos.rol)) throw new Error("Elige un rol válido.");
  if (datos.rol === "gerente" && usuarioActual(data)?.rol !== "gerente") throw new Error(MSG_SOLO_GERENTE_ASIGNA);
  if (data.usuarios.some((u) => correoNormal(u.email) === email)) throw new Error("Ya existe un usuario con ese correo.");

  const usuario = {
    id: uid(),
    nombre,
    email,
    password: String(datos.password),
    rol: datos.rol,
    contratos: contratosExistentes(data, datos.contratos),
    activo: true,
  };
  data.usuarios.push(usuario);
  anotarHistorial(data, {
    accion: "crear",
    objeto: "usuarios",
    objetoId: usuario.id,
    detalle: `${nombre} (${email}) — ${nombreDeRol(usuario.rol)}`,
  });
  write(data);
  return usuarioPublico(usuario);
};

// `cambios` admite nombre, email, password, rol, contratos y activo. Un campo
// ausente no se toca; una contraseña presente no puede venir vacía.
export const actualizarUsuario = (id, cambios = {}) => {
  const data = read();
  exigirEn(data, "usuarios");
  const usuario = data.usuarios.find((u) => u.id === id);
  if (!usuario) throw new Error("El usuario no existe.");
  const editorEsGerente = usuarioActual(data)?.rol === "gerente";
  if (usuario.rol === "gerente" && !editorEsGerente) throw new Error(MSG_GERENTE_INTOCABLE);

  const siguiente = { ...usuario, contratos: [...(usuario.contratos || [])] };
  const notas = [];
  const trae = (campo) => cambios[campo] !== undefined;

  if (trae("nombre")) {
    const nombre = String(cambios.nombre).trim();
    if (!nombre) throw new Error("El nombre es obligatorio.");
    if (nombre !== usuario.nombre) notas.push(`nombre «${usuario.nombre}» → «${nombre}»`);
    siguiente.nombre = nombre;
  }
  if (trae("email")) {
    const email = correoNormal(cambios.email);
    if (!CORREO_VALIDO.test(email)) throw new Error("Escribe un correo válido.");
    if (data.usuarios.some((u) => u.id !== id && correoNormal(u.email) === email)) {
      throw new Error("Ya existe un usuario con ese correo.");
    }
    if (email !== correoNormal(usuario.email)) notas.push(`correo ${usuario.email} → ${email}`);
    siguiente.email = email;
  }
  if (trae("password")) {
    if (textoVacio(cambios.password)) throw new Error("La contraseña es obligatoria.");
    if (String(cambios.password) !== usuario.password) notas.push("contraseña cambiada");
    siguiente.password = String(cambios.password);
  }
  if (trae("rol")) {
    if (!rolExiste(cambios.rol)) throw new Error("Elige un rol válido.");
    if (cambios.rol === "gerente" && usuario.rol !== "gerente" && !editorEsGerente) throw new Error(MSG_SOLO_GERENTE_ASIGNA);
    if (cambios.rol !== usuario.rol) notas.push(`rol ${nombreDeRol(usuario.rol)} → ${nombreDeRol(cambios.rol)}`);
    siguiente.rol = cambios.rol;
  }
  if (trae("contratos")) {
    siguiente.contratos = contratosExistentes(data, cambios.contratos);
    if (!mismosElementos(siguiente.contratos, usuario.contratos || [])) {
      notas.push(`contratos asignados: ${siguiente.contratos.length}`);
    }
  }
  if (trae("activo")) {
    siguiente.activo = Boolean(cambios.activo);
    if (siguiente.activo !== Boolean(usuario.activo)) notas.push(siguiente.activo ? "cuenta activada" : "cuenta desactivada");
  }

  // Siempre debe quedar al menos un gerente activo.
  const eraGerenteActivo = usuario.rol === "gerente" && usuario.activo;
  const seraGerenteActivo = siguiente.rol === "gerente" && siguiente.activo;
  if (eraGerenteActivo && !seraGerenteActivo && gerentesActivosSalvo(data, id) === 0) throw new Error(MSG_ULTIMO_GERENTE);

  if (notas.length === 0) return usuarioPublico(usuario);

  // El registro se arma antes de aplicar el cambio: si el usuario se desactiva a
  // sí mismo, la entrada igual queda a su nombre.
  anotarHistorial(data, {
    accion: "editar",
    objeto: "usuarios",
    objetoId: id,
    detalle: `${siguiente.nombre}: ${notas.join("; ")}`,
  });
  Object.assign(usuario, siguiente);
  write(data);
  return usuarioPublico(usuario);
};

const copiarMatriz = (matriz) =>
  Object.fromEntries(Object.entries(matriz || {}).map(([rol, lista]) => [rol, [...(Array.isArray(lista) ? lista : [])]]));

export const getPermisosRoles = () => {
  const data = read();
  exigirEn(data, "usuarios");
  return copiarMatriz(data.permisosRoles);
};

// Activa o quita un permiso a un rol. La fila del gerente no se toca.
export const setPermisoRol = (rol, permiso, activo) => {
  const data = read();
  exigirEn(data, "usuarios");
  if (rol === "gerente") throw new Error("Los permisos del gerente general no se pueden modificar.");
  if (!rolExiste(rol)) throw new Error("El rol no existe.");
  const definicion = PERMISOS.find((p) => p.clave === permiso);
  if (!definicion) throw new Error("El permiso no existe.");

  if (!data.permisosRoles || typeof data.permisosRoles !== "object") data.permisosRoles = {};
  const actuales = Array.isArray(data.permisosRoles[rol]) ? data.permisosRoles[rol] : [];
  const quiere = Boolean(activo);
  if (actuales.includes(permiso) === quiere) return copiarMatriz(data.permisosRoles);

  const conjunto = new Set(actuales);
  if (quiere) conjunto.add(permiso);
  else conjunto.delete(permiso);
  // Se guarda siempre en el orden del catálogo de permisos.
  data.permisosRoles[rol] = PERMISOS.map((p) => p.clave).filter((clave) => conjunto.has(clave));
  anotarHistorial(data, {
    accion: "editar",
    objeto: "permisos",
    objetoId: `${rol}:${permiso}`,
    detalle: `${nombreDeRol(rol)} — ${definicion.nombre}: ${quiere ? "permiso otorgado" : "permiso quitado"}`,
  });
  write(data);
  return copiarMatriz(data.permisosRoles);
};

// Texto crudo guardado al migrar desde v6, o null si no hubo migración.
export const getRespaldoV6 = () => {
  exigirEn(read(), "respaldo");
  try { return localStorage.getItem(RESPALDO_V6); } catch { return null; }
};

// ---------- Contratos / trámites ----------
export const listTramites = () => {
  const data = read();
  const usuario = usuarioActual(data);
  return data.tramites
    .filter((t) => veContrato(data.permisosRoles, usuario, t.id))
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
};

// Devuelve null si el contrato no existe o la sesión no lo puede ver.
export const getTramite = (id) => {
  const data = read();
  const tramite = data.tramites.find((t) => t.id === id);
  if (!tramite) return null;
  return veContrato(data.permisosRoles, usuarioActual(data), id) ? tramite : null;
};

export const createTramite = (form) => {
  const data = read();
  const t = {
    id: uid(),
    codigo: form.codigo?.trim() || `TR-${Date.now()}`,
    denominacion: form.denominacion?.trim() || "Sin denominación",
    entidad: form.entidad || "",
    contratista: form.contratista || "",
    tipo_objeto: form.tipo_objeto || "Obra",
    area: form.area || "Infraestructura",
    monto: Number(form.monto || 0),
    fecha_inicio: form.fecha_inicio || hoy(),
    fecha_fin: form.fecha_fin || "",
    fecha_suscripcion: form.fecha_suscripcion || form.fecha_inicio || hoy(),
    estado: form.estado || "En ejecución",
    created_at: hoy(),
  };
  data.tramites.push(t);
  data.items.push(...crearTareas(t, data.plantillasDocs, data.catalogoHitos, data.feriados));
  data.configFianzas[t.id] = { periodo: "anual", tipos: ["fiel_cumplimiento"] };
  write(data);
  return t;
};

export const updateTramite = (id, cambios) => {
  const data = read();
  data.tramites = data.tramites.map((t) => (t.id === id ? { ...t, ...cambios } : t));
  write(data);
  return data.tramites.find((t) => t.id === id) || null;
};

// Archivos (IndexedDB) de un documento: el vigente y, cuando existan, sus versiones.
// El borrado es "fire and forget": un fallo del almacén de archivos no frena la operación.
const borrarArchivosDeItems = (items) => {
  for (const item of items) {
    for (const doc of item?.documentos || []) {
      const ids = [doc?.archivoId, ...(doc?.versiones || []).map((v) => v?.archivoId)];
      for (const archivoId of ids) {
        if (archivoId) eliminarArchivo(archivoId).catch(() => {});
      }
    }
  }
};

// Elimina el contrato con sus hitos y los archivos de estos. Exige `eliminar`.
export const deleteTramite = (id) => {
  const data = read();
  exigirEn(data, "eliminar", id);
  const tramite = data.tramites.find((t) => t.id === id);
  if (!tramite) return false;
  borrarArchivosDeItems(data.items.filter((i) => i.tramite_id === id));
  data.tramites = data.tramites.filter((t) => t.id !== id);
  data.items = data.items.filter((i) => i.tramite_id !== id);
  data.ampliaciones = (data.ampliaciones || []).filter((a) => a.tramite_id !== id);
  if (data.configFianzas) delete data.configFianzas[id];
  for (const usuario of data.usuarios || []) {
    if (Array.isArray(usuario.contratos)) usuario.contratos = usuario.contratos.filter((c) => c !== id);
  }
  anotarHistorial(data, {
    accion: "eliminar",
    objeto: "contrato",
    objetoId: id,
    tramiteId: id,
    detalle: `${tramite.codigo} — ${tramite.denominacion}`,
  });
  write(data);
  return true;
};

// ---------- Expediente: hitos y trámites ----------
export const listItems = (tramiteId) =>
  ordenarTareas(read().items.filter((i) => i.tramite_id === tramiteId));

export const getItem = (id) => read().items.find((i) => i.id === id) || null;

export const updateItem = (id, cambios) => {
  const data = read();
  data.items = data.items.map((i) => (i.id === id ? { ...i, ...cambios } : i));
  write(data);
  return data.items.find((i) => i.id === id) || null;
};

export const addItem = (tramiteId, nombre, etapaNombre = "Hitos propios", extra = {}) => {
  const data = read();
  const etapaRef = data.items.find(
    (i) => i.tramite_id === tramiteId && i.etapaNombre === etapaNombre
  );
  const propias = data.items.filter((i) => i.tramite_id === tramiteId && i.tipo === "propio");
  const numeros = propias
    .map((i) => Number(String(i.codigo || "").split(".").pop()))
    .filter((n) => Number.isFinite(n));
  const count = (numeros.length ? Math.max(...numeros) : 0) + 1;
  const etapaCodigo = etapaRef?.etapaCodigo || "P";
  const item = {
    id: uid(),
    tramite_id: tramiteId,
    codigo: `P.${count}`,
    nombre,
    etapaCodigo,
    etapaNombre: etapaNombre || "Hitos propios",
    seccionCodigo: etapaRef ? `${etapaCodigo}.P` : "P",
    seccionNombre: "Hitos propios",
    tipo: "propio",
    plantilla: "",
    estado: "Pendiente",
    responsable: "",
    fecha: "",
    fecha_limite: "",
    observacion: "",
    docsRequeridos: extra.docsRequeridos || [],
    documentos: [],
    plazoDias: 0,
    plazoBase: "manual",
    plazoHabiles: true,
    norma: "",
    nota: "Hito agregado manualmente al expediente.",
    recurrente: false,
    periodo: "",
    ...extra,
  };
  data.items.push(item);
  write(data);
  return item;
};

export const removeItem = (id) => {
  const data = read();
  const item = data.items.find((i) => i.id === id);
  exigirEn(data, "borrar_hito", item?.tramite_id);
  if (!item) return;
  borrarArchivosDeItems([item]);
  data.items = data.items.filter((i) => i.id !== id);
  anotarHistorial(data, {
    accion: "eliminar",
    objeto: "hito",
    objetoId: id,
    tramiteId: item.tramite_id,
    detalle: `${item.codigo} — ${item.nombre}`,
  });
  write(data);
};

export const addTareaEventual = (tramiteId, clave) => {
  const data = read();
  const tramite = data.tramites.find((t) => t.id === tramiteId);
  if (!tramite) return null;
  const existentes = data.items.filter((i) => i.tramite_id === tramiteId);
  const tarea = crearTareaEventualCatalogo(tramite, clave, existentes, data.feriados);
  if (!tarea) return null;
  data.items.push(tarea);
  write(data);
  return tarea;
};

export const listarEventuales = (tipo) => listarEventualesCatalogo(tipo);

// ---------- Plantillas de documentos ----------
export const getPlantilla = (clave) => {
  const plantillas = read().plantillasDocs || {};
  return plantillas[clave] || null;
};

export const guardarPlantilla = (clave, plantilla) => {
  if (!clave) return null;
  const data = read();
  if (!data.plantillasDocs || typeof data.plantillasDocs !== "object") data.plantillasDocs = {};
  const actual = data.plantillasDocs[clave] || {};
  const extra = {};
  for (const campo of ["nombre", "plazoBase", "norma", "nota"]) {
    if (plantilla[campo] !== undefined) extra[campo] = plantilla[campo];
  }
  if (plantilla.plazoDias !== undefined) extra.plazoDias = Number(plantilla.plazoDias) || 0;
  if (plantilla.plazoHabiles !== undefined) extra.plazoHabiles = plantilla.plazoHabiles !== false;
  data.plantillasDocs[clave] = {
    ...actual,
    docs: [...new Set((plantilla.docs || actual.docs || []).map((d) => String(d).trim()).filter(Boolean))],
    cumplimiento: plantilla.cumplimiento !== undefined ? plantilla.cumplimiento : (actual.cumplimiento || ""),
    ...extra,
  };
  write(data);
  return data.plantillasDocs[clave];
};

// ---------- Catálogo personalizado de hitos ----------
export const listarCatalogoHitos = () => [...(read().catalogoHitos || [])];

export const agregarCatalogoHito = (hito) => {
  const data = read();
  if (!Array.isArray(data.catalogoHitos)) data.catalogoHitos = [];
  if (!String(hito?.nombre || "").trim()) return null;
  const clave = `cat_${uid()}`;
  const registro = {
    id: uid(),
    clave,
    nombre: String(hito.nombre).trim(),
    tipoObjeto: hito.tipoObjeto || "Obra",
    etapaCodigo: hito.etapaCodigo || "1.1",
    etapaNombre: hito.etapaNombre || "Contrato y expediente",
    docs: [...new Set((hito.docs || []).map((d) => String(d).trim()).filter(Boolean))],
    cumplimiento: hito.cumplimiento || "",
    dias: Number(hito.dias || 0),
    base: hito.base || "inicio",
    habiles: hito.habiles !== false,
    norma: hito.norma || "Ley 32069 y su Reglamento",
    nota: hito.nota || "Hito agregado al catálogo personalizado.",
    activo: hito.activo !== false,
  };
  data.catalogoHitos.push(registro);
  if (!data.plantillasDocs || typeof data.plantillasDocs !== "object") data.plantillasDocs = {};
  data.plantillasDocs[clave] = { docs: registro.docs, cumplimiento: registro.cumplimiento };
  write(data);
  return registro;
};

export const actualizarCatalogoHito = (id, cambios) => {
  const data = read();
  data.catalogoHitos = (data.catalogoHitos || []).map((h) => (h.id === id ? { ...h, ...cambios } : h));
  const hito = data.catalogoHitos.find((h) => h.id === id);
  if (hito && data.plantillasDocs) {
    data.plantillasDocs[hito.clave] = {
      ...(data.plantillasDocs[hito.clave] || {}),
      docs: hito.docs || [],
      cumplimiento: hito.cumplimiento || "",
    };
  }
  write(data);
  return hito || null;
};

export const actualizarCatalogoPorClave = (clave, cambios) => {
  const hito = (read().catalogoHitos || []).find((h) => h.clave === clave);
  return hito ? actualizarCatalogoHito(hito.id, cambios) : null;
};

export const eliminarCatalogoHito = (id) => {
  const data = read();
  const hito = (data.catalogoHitos || []).find((h) => h.id === id);
  if (hito && data.plantillasDocs) delete data.plantillasDocs[hito.clave];
  data.catalogoHitos = (data.catalogoHitos || []).filter((h) => h.id !== id);
  write(data);
};

// ---------- Hitos opcionales ----------
export const listarHitosOpcionales = (tipo) => listarHitosOpcionalesCatalogo(tipo);

export const addHitoOpcional = (tramiteId, clave) => {
  const data = read();
  const tramite = data.tramites.find((t) => t.id === tramiteId);
  if (!tramite) return null;
  const modelo = listarHitosOpcionalesCatalogo(tramite.tipo_objeto).find((h) => h.clave === clave);
  if (!modelo) return null;
  const hermanos = data.items.filter(
    (i) => i.tramite_id === tramiteId && i.seccionCodigo === modelo.etapaCodigo
  );
  const numeros = hermanos
    .map((i) => Number(String(i.codigo || "").split(".").pop()))
    .filter((n) => Number.isFinite(n));
  const consecutivo = (numeros.length ? Math.max(...numeros) : 0) + 1;
  const fechaBase = tramite.fecha_suscripcion || tramite.fecha_inicio || hoy();
  const clavePlantilla = `opcional:${clave}`;
  const plantilla = data.plantillasDocs?.[clavePlantilla];
  return addItem(tramiteId, modelo.nombre, modelo.etapaNombre, {
    codigo: `${modelo.etapaCodigo}.${consecutivo}`,
    seccionCodigo: modelo.etapaCodigo,
    seccionNombre: modelo.etapaNombre,
    tipo: "opcional",
    plantilla: clavePlantilla,
    clavePlantilla,
    docsRequeridos: plantilla?.docs || modelo.docs || [],
    docCumplimiento: plantilla?.cumplimiento || "",
    plazoDias: modelo.dias || 0,
    plazoBase: modelo.base || "inicio",
    plazoHabiles: modelo.habiles !== false,
    fecha_limite: modelo.dias
      ? (modelo.habiles !== false ? sumarHabiles(fechaBase, modelo.dias, data.feriados) : sumarDias(fechaBase, modelo.dias))
      : "",
    norma: modelo.norma || "",
    nota: modelo.nota || "Hito opcional agregado al expediente.",
  });
};

// ---------- SCTR: agregar meses ----------
const MESES_LARGO = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const pad2 = (n) => String(n).padStart(2, "0");

export const agregarMesSCTR = (tramiteId) => {
  const data = read();
  const tramite = data.tramites.find((t) => t.id === tramiteId);
  if (!tramite) return null;
  const sctr = ordenarTareas(
    data.items.filter((i) => i.tramite_id === tramiteId && String(i.nombre || "").startsWith("SCTR"))
  );
  if (sctr.length === 0) return null;
  const ultimo = sctr[sctr.length - 1];
  const [anio, mes] = String(ultimo.periodo || "2026-01").split("-").map(Number);
  const siguiente = new Date(anio || 2026, (mes || 1) - 1 + 1, 1);
  const periodo = `${siguiente.getFullYear()}-${pad2(siguiente.getMonth() + 1)}`;
  const baseNombre = String(ultimo.nombre).replace(/\s+\d+\s+—.*$/, "");
  const numeros = sctr
    .map((i) => Number(String(i.codigo || "").split(".").pop()))
    .filter((n) => Number.isFinite(n));
  const consecutivo = (numeros.length ? Math.max(...numeros) : 0) + 1;
  const diaLimite = ultimo.diaLimite || 10;
  const clave = ultimo.clavePlantilla || ultimo.seccionCodigo;
  const plantilla = data.plantillasDocs?.[clave];
  return addItem(tramiteId, `${baseNombre} ${pad2(consecutivo)} — ${MESES_LARGO[siguiente.getMonth()]} ${siguiente.getFullYear()}`, ultimo.etapaNombre, {
    codigo: `${ultimo.seccionCodigo}.${consecutivo}`,
    seccionCodigo: ultimo.seccionCodigo,
    seccionNombre: ultimo.seccionNombre,
    tipo: "recurrente",
    plantilla: clave,
    clavePlantilla: clave,
    docsRequeridos: plantilla?.docs || ultimo.docsRequeridos || [],
    docCumplimiento: plantilla?.cumplimiento || ultimo.docCumplimiento || "",
    plazoDias: 0,
    plazoBase: "manual",
    plazoHabiles: true,
    diaLimite,
    frecuencia: "mensual",
    periodo,
    fecha_limite: `${periodo}-${pad2(diaLimite)}`,
    norma: ultimo.norma || "",
    nota: "Mes de SCTR agregado al expediente.",
  });
};

// ---------- Cartas fianza ----------
const PERIODOS_FIANZA = {
  mensual: { meses: 1, etiqueta: "Mes" },
  trimestral: { meses: 3, etiqueta: "Trimestre" },
  semestral: { meses: 6, etiqueta: "Semestre" },
  anual: { meses: 12, etiqueta: "Año" },
};

export const getConfigFianzas = (tramiteId) => {
  const data = read();
  return data.configFianzas?.[tramiteId] || { periodo: "anual", tipos: ["fiel_cumplimiento"] };
};

export const guardarConfigFianzas = (tramiteId, config) => {
  const data = read();
  const tramite = data.tramites.find((t) => t.id === tramiteId);
  if (!tramite) return null;
  const seccionCodigo = tramite.tipo_objeto === "Obra" ? "1.2.10" : "2.2.7";
  const seccionNombre = "Renovaciones de carta fianza";
  const etapaRef = data.items.find((i) => i.tramite_id === tramiteId && i.seccionCodigo === seccionCodigo);
  const periodo = PERIODOS_FIANZA[config.periodo] ? config.periodo : "anual";
  const tipos = Array.isArray(config.tipos) && config.tipos.length ? config.tipos : ["fiel_cumplimiento"];
  const cfg = PERIODOS_FIANZA[periodo];

  const inicio = new Date(`${tramite.fecha_inicio || hoy()}T12:00:00`);
  const fin = new Date(`${tramite.fecha_fin || tramite.fecha_inicio || hoy()}T12:00:00`);
  const totalMeses = Math.max(1, (fin.getFullYear() - inicio.getFullYear()) * 12 + (fin.getMonth() - inicio.getMonth()) + 1);
  const cantidad = Math.max(1, Math.ceil(totalMeses / cfg.meses));

  const anteriores = data.items.filter((i) => i.tramite_id === tramiteId && i.seccionCodigo === seccionCodigo);
  const documentos = anteriores.map((i) => i.documentos || []);

  const restantes = data.items.filter((i) => !(i.tramite_id === tramiteId && i.seccionCodigo === seccionCodigo));
  const plantillaDocs = data.plantillasDocs?.[seccionCodigo]?.docs || [
    "Carta fianza renovada", "Instrucción al banco", "Comprobante de emisión", "Carta de la entidad",
  ];
  const cumplimiento = data.plantillasDocs?.[seccionCodigo]?.cumplimiento || "Carta fianza renovada";
  const etiquetas = {
    fiel_cumplimiento: "de fiel cumplimiento",
    adelanto_directo: "por adelanto directo",
    adelanto_materiales: "por adelanto de materiales",
    por_avance: "por avance",
  };
  const nuevas = [];
  let n = 0;
  for (const tipo of tipos) {
    for (let i = 0; i < Math.min(cantidad, 12); i += 1) {
      const hasta = new Date(inicio);
      hasta.setMonth(inicio.getMonth() + (i + 1) * cfg.meses);
      const limite = hasta > fin ? new Date(fin) : hasta;
      const vence = sumarDias(limite.toISOString().slice(0, 10), -15);
      nuevas.push({
        id: uid(),
        tramite_id: tramiteId,
        codigo: `${seccionCodigo}.${n + 1}`,
        nombre: `Renovación de carta fianza ${etiquetas[tipo] || tipo} — ${cfg.etiqueta} ${i + 1}`,
        etapaCodigo: etapaRef?.etapaCodigo || seccionCodigo.split(".").slice(0, 2).join("."),
        etapaNombre: etapaRef?.etapaNombre || "Inicio y aseguramiento",
        seccionCodigo,
        seccionNombre,
        tipo: "recurrente",
        plantilla: seccionCodigo,
        clavePlantilla: seccionCodigo,
        tipoFianza: tipo,
        estado: "Pendiente",
        responsable: "",
        fecha: "",
        fecha_limite: vence,
        observacion: "",
        docsRequeridos: [...plantillaDocs],
        documentos: documentos[n] || [],
        docCumplimiento: cumplimiento,
        plazoDias: 15,
        plazoBase: "manual",
        plazoHabiles: false,
        norma: "Ley 32069 y su Reglamento",
        nota: "Renovación programada según el periodo configurado.",
        recurrente: true,
        periodo: `${cfg.etiqueta} ${i + 1}`,
        diaLimite: 15,
        frecuencia: periodo,
      });
      n += 1;
    }
  }
  for (let i = nuevas.length; i < documentos.length; i += 1) {
    for (const doc of documentos[i] || []) {
      if (doc.archivoId) eliminarArchivo(doc.archivoId).catch(() => {});
    }
  }
  data.items = ordenarTareas([...restantes, ...nuevas]);
  if (!data.configFianzas || typeof data.configFianzas !== "object") data.configFianzas = {};
  data.configFianzas[tramiteId] = { periodo, tipos };
  write(data);
  return { periodo, tipos };
};

// ---------- Reordenar hitos dentro de una sección ----------
export const moverItem = (tramiteId, id, direccion) => {
  const data = read();
  const item = data.items.find((i) => i.id === id && i.tramite_id === tramiteId);
  if (!item) return false;
  const hermanos = ordenarTareas(
    data.items.filter((i) => i.tramite_id === tramiteId && i.seccionCodigo === item.seccionCodigo)
  );
  const idx = hermanos.findIndex((i) => i.id === id);
  const otro = hermanos[idx + direccion];
  if (!otro) return false;
  const codigo = item.codigo;
  item.codigo = otro.codigo;
  otro.codigo = codigo;
  data.items = ordenarTareas(data.items);
  write(data);
  return true;
};

// ---------- Resúmenes para panel y listados ----------
export const resumenTramite = (tramiteId) => {
  const tareas = listItems(tramiteId);
  const aplicables = tareas.filter((t) => t.estado !== "No aplica");
  const total = aplicables.length;
  const completados = aplicables.filter((t) => t.estado === "Completado").length;
  const observados = aplicables.filter((t) => t.estado === "Observado").length;
  let docsRequeridos = 0;
  let docsCargados = 0;
  let requisitosPendientes = 0;
  for (const t of aplicables) {
    const reqs = t.docsRequeridos || [];
    const docs = t.documentos || [];
    docsRequeridos += reqs.length;
    docsCargados += docs.length;
    requisitosPendientes += reqs.filter((r) => !docs.some((d) => d.tipoDoc === r)).length;
  }
  return {
    total,
    completados,
    observados,
    pendientes: total - completados,
    pct: total ? Math.round((completados / total) * 100) : 0,
    docsRequeridos,
    docsCargados,
    requisitosPendientes,
  };
};

export const listAllTareas = () => {
  const data = read();
  return data.tramites.flatMap((t) =>
    data.items
      .filter((i) => i.tramite_id === t.id)
      .map((i) => ({ ...i, tramite_codigo: t.codigo, tramite_denominacion: t.denominacion }))
  );
};

export const tareasConPlazo = () =>
  listAllTareas()
    .filter((t) => t.fecha_limite && t.estado !== "Completado" && t.estado !== "No aplica")
    .sort((a, b) => a.fecha_limite.localeCompare(b.fecha_limite));

export const estadoPlazo = (tarea) => {
  if (!tarea?.fecha_limite) return "sin-plazo";
  const dias = diasEntre(hoy(), tarea.fecha_limite);
  if (dias < 0) return "vencido";
  if (dias <= 7) return "por-vencer";
  return "vigente";
};

export const exportarDatos = () => JSON.stringify(read(), null, 2);

export const hoyISO = hoy;
export const sumarDiasCalendario = sumarDias;
export const etapasObra = ["Contrato y expediente", "Inicio y aseguramiento", "Ejecución de obra", "Recepción y liquidación"];
export const etapasConsultoria = ["Contrato y expediente", "Inicio y equipo", "Ejecución del servicio", "Entregables y valorizaciones", "Recepción y liquidación"];
