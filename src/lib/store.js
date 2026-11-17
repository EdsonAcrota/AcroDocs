// Capa de datos del demo. Persiste en localStorage para que la app funcione
// sin Supabase. Los archivos adjuntos se guardan en IndexedDB (src/lib/archivos.js).
// En producción esta capa se reemplaza por Supabase/PostgreSQL conservando los
// mismos campos y la misma estructura jerárquica del expediente.

import {
  crearTareas,
  crearTareaEventual as crearTareaEventualCatalogo,
  listarEventuales as listarEventualesCatalogo,
  listarHitosOpcionales as listarHitosOpcionalesCatalogo,
  catalogoSemilla,
  completarPlantilla,
  recorrerPlantillas,
  ubicarPlantillas,
  ubicarPorId,
  aplicarCambiosPlantilla,
  plantillaDesdeHitoPersonal,
  seccionPara,
  asignarCodigos,
  ambitoDe,
  tipoDeAmbito,
  AMBITOS,
} from "./catalogo.js";
import { eliminarArchivo } from "./archivos.js";
import { calcularFlujo, instanciarPasos } from "./flujo.js";
import { hoy, sumarDias, sumarHabiles, diasEntre, FERIADOS_2026 } from "./fechas.js";
import { tienePermiso, veContrato, PERMISOS, ROLES } from "./permisos.js";
import { migrarV6aV7, fundirCatalogo, copiarUsuariosDemo, copiarMatrizInicial, empresaVacia } from "./migracion.js";

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
    // El catálogo se copia de la semilla una sola vez: sus ids quedan fijos.
    catalogo: catalogoSemilla(),
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
    crearTareas(data.tramites[0], data.catalogo, data.feriados),
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
    crearTareas(data.tramites[1], data.catalogo, data.feriados),
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
    data.catalogo,
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

let memoria = null;

const read = () => {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (Number(data.version) >= 7) {
        if (!Array.isArray(data.feriados)) data.feriados = [...FERIADOS_2026];
        if (!data.configFianzas || typeof data.configFianzas !== "object") data.configFianzas = {};
        if (!Array.isArray(data.usuarios)) data.usuarios = copiarUsuariosDemo();
        if (!data.permisosRoles || typeof data.permisosRoles !== "object") data.permisosRoles = copiarMatrizInicial();
        if (!Array.isArray(data.historial)) data.historial = [];
        if (!data.empresa || typeof data.empresa !== "object") data.empresa = empresaVacia();
        if (!Array.isArray(data.movimientos)) data.movimientos = [];
        if (!Array.isArray(data.cargos)) data.cargos = [];
        // Un v7 guardado antes del catálogo almacenado: se funde una vez y se
        // guarda enseguida, para que los ids del catálogo no cambien entre lecturas.
        let guardar = false;
        if (!data.catalogo || typeof data.catalogo !== "object") {
          data.catalogo = fundirCatalogo(data.plantillasDocs, data.catalogoHitos);
          delete data.plantillasDocs;
          delete data.catalogoHitos;
          guardar = true;
        }
        // Un catálogo guardado antes de que los hitos llevaran `codigo`: se les
        // da el código que ya tenían por regla, una sola vez.
        if (asignarCodigos(data.catalogo)) guardar = true;
        if (guardar) {
          try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* ignore */ }
        }
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

// ---------- Ejecutor: empresa o consorcio (§5.3) ----------
// Cada contrato guarda `ejecutor`: { tipo: "empresa" } o { tipo: "consorcio",
// nombre, ruc, representante, integrantes: [{ razonSocial, ruc, participacion }] }.
// `participacion` es un porcentaje (0-100). Los datos de la empresa propia viven
// en `data.empresa` y se editan en Configuración.
const textoLimpio = (valor) => String(valor ?? "").trim();

const porcentaje = (valor) => {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : 0;
};

const sinParticipacion = (valor) => valor === undefined || valor === null || String(valor).trim() === "";

// Deja el ejecutor con la forma exacta que se guarda: un tipo desconocido es la
// empresa, los textos van recortados, la participación es un número y se
// descartan las filas de integrantes totalmente vacías.
const normalizarEjecutor = (ejecutor) => {
  if (ejecutor?.tipo !== "consorcio") return { tipo: "empresa" };
  const integrantes = (Array.isArray(ejecutor.integrantes) ? ejecutor.integrantes : [])
    .filter((i) => textoLimpio(i?.razonSocial) || textoLimpio(i?.ruc) || !sinParticipacion(i?.participacion))
    .map((i) => ({
      razonSocial: textoLimpio(i.razonSocial),
      ruc: textoLimpio(i.ruc),
      participacion: porcentaje(i.participacion),
    }));
  return {
    tipo: "consorcio",
    nombre: textoLimpio(ejecutor.nombre),
    ruc: textoLimpio(ejecutor.ruc),
    representante: textoLimpio(ejecutor.representante),
    integrantes,
  };
};

// Avisos sobre el ejecutor. No bloquean nada: la interfaz los muestra y el
// contrato se guarda igual.
export const validarEjecutor = (ejecutor) => {
  if (ejecutor?.tipo !== "consorcio") return [];
  const integrantes = Array.isArray(ejecutor.integrantes) ? ejecutor.integrantes : [];
  if (integrantes.length === 0) return ["El consorcio no tiene integrantes."];
  // Se redondea a centésimas para que 33.3 + 33.3 + 33.4 cuente como 100 exacto.
  const suma = Math.round(integrantes.reduce((total, i) => total + porcentaje(i?.participacion), 0) * 100) / 100;
  return suma === 100 ? [] : [`Las participaciones suman ${suma} %; deben sumar 100 %.`];
};

export const getEmpresa = () => {
  const empresa = read().empresa || {};
  return { razonSocial: String(empresa.razonSocial ?? ""), ruc: String(empresa.ruc ?? "") };
};

const entreComillas = (texto) => (texto ? `«${texto}»` : "(vacío)");

// Reemplaza razón social y RUC de la empresa propia. Exige `usuarios`; el cambio
// y su registro en el historial se guardan en una sola escritura. Sin cambios
// reales no escribe nada.
export const guardarEmpresa = (datos = {}) => {
  const data = read();
  exigirEn(data, "usuarios");
  const anterior = {
    razonSocial: String(data.empresa?.razonSocial ?? ""),
    ruc: String(data.empresa?.ruc ?? ""),
  };
  const siguiente = { razonSocial: textoLimpio(datos?.razonSocial), ruc: textoLimpio(datos?.ruc) };
  const notas = [];
  if (siguiente.razonSocial !== anterior.razonSocial) {
    notas.push(`razón social ${entreComillas(anterior.razonSocial)} → ${entreComillas(siguiente.razonSocial)}`);
  }
  if (siguiente.ruc !== anterior.ruc) notas.push(`RUC ${entreComillas(anterior.ruc)} → ${entreComillas(siguiente.ruc)}`);
  if (notas.length === 0) return anterior;

  data.empresa = siguiente;
  anotarHistorial(data, {
    accion: "editar",
    objeto: "empresa",
    objetoId: "empresa",
    detalle: `Datos de la empresa: ${notas.join("; ")}`,
  });
  write(data);
  return { ...siguiente };
};

// Nombre con el que se muestra al ejecutor del contrato: la razón social de la
// empresa propia o el nombre del consorcio. El texto libre `contratista` de los
// contratos antiguos solo sirve de respaldo para un consorcio que quedó sin nombre.
export const nombreEjecutor = (tramite) => {
  if (tramite?.ejecutor?.tipo === "consorcio") {
    return textoLimpio(tramite.ejecutor.nombre) || textoLimpio(tramite.contratista) || "Consorcio sin nombre";
  }
  return textoLimpio(read().empresa?.razonSocial) || "Empresa propia";
};

export const createTramite = (form) => {
  const data = read();
  const t = {
    id: uid(),
    codigo: form.codigo?.trim() || `TR-${Date.now()}`,
    denominacion: form.denominacion?.trim() || "Sin denominación",
    entidad: form.entidad || "",
    ejecutor: normalizarEjecutor(form.ejecutor),
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
  data.items.push(...crearTareas(t, data.catalogo, data.feriados));
  data.configFianzas[t.id] = { periodo: "anual", tipos: ["fiel_cumplimiento"] };
  write(data);
  return t;
};

export const updateTramite = (id, cambios) => {
  const data = read();
  const aplicar = cambios?.ejecutor === undefined ? cambios : { ...cambios, ejecutor: normalizarEjecutor(cambios.ejecutor) };
  data.tramites = data.tramites.map((t) => (t.id === id ? { ...t, ...aplicar } : t));
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
  data.movimientos = (data.movimientos || []).filter((m) => m.tramiteId !== id);
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
  const actual = data.items.find((i) => i.id === id);
  // En un hito con pasos el estado lo marcan los pasos: solo se puede dar por "No
  // aplica" o reabrir (§5.9 regla 5).
  if (actual?.pasos?.length && cambios && cambios.estado !== undefined && !["No aplica", "Pendiente"].includes(cambios.estado)) {
    throw new Error("El estado de este hito lo determinan sus pasos. Registra el movimiento del paso.");
  }
  data.items = data.items.map((i) => (i.id === id ? { ...i, ...cambios } : i));
  const item = data.items.find((i) => i.id === id) || null;
  if (item?.pasos?.length && cambios && (cambios.estado === "Pendiente" || cambios.pasos !== undefined)) sincronizarItemEn(data, item);
  write(data);
  return item;
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
  data.movimientos = (data.movimientos || []).filter((m) => m.itemId !== id);
  anotarHistorial(data, {
    accion: "eliminar",
    objeto: "hito",
    objetoId: id,
    tramiteId: item.tramite_id,
    detalle: `${item.codigo} — ${item.nombre}`,
  });
  write(data);
};

// ---------- Documentos de un hito ----------
// Todo archivo nuevo pasa por estas tres funciones: cada una exige su permiso
// sobre el contrato del hito y, cuando corresponde, deja el cambio y su registro
// en el historial en una sola escritura (§5.1 y §5.9 regla 7).
const ubicarDocumento = (data, itemId, docId) => {
  const item = data.items.find((i) => i.id === itemId);
  const doc = item ? (item.documentos || []).find((d) => d.id === docId) : null;
  return { item, doc };
};

// Agregar otro archivo a un documento que ya tiene uno también es "subir":
// el anterior queda intacto, así que nada se pierde.
export const agregarDocumento = (itemId, meta = {}) => {
  const data = read();
  const item = data.items.find((i) => i.id === itemId);
  exigirEn(data, "subir", item?.tramite_id);
  if (!item) throw new Error("El hito no existe.");
  const doc = { ...meta, id: meta.id || uid() };
  item.documentos = [...(item.documentos || []), doc];
  write(data);
  return doc;
};

// "Nueva versión": el documento conserva su id y apunta al archivo nuevo; el
// archivo anterior pasa a `versiones` (sigue en IndexedDB y se puede descargar).
export const reemplazarDocumento = (itemId, docId, meta = {}) => {
  const data = read();
  const item = data.items.find((i) => i.id === itemId);
  exigirEn(data, "reemplazar", item?.tramite_id);
  if (!item) throw new Error("El hito no existe.");
  const doc = (item.documentos || []).find((d) => d.id === docId);
  if (!doc) throw new Error("El documento no existe.");
  if (!meta.archivoId) throw new Error("Falta el archivo de la nueva versión.");

  const usuario = usuarioActual(data);
  const anterior = {
    archivoId: doc.archivoId,
    nombre: doc.nombre,
    tamano: doc.tamano,
    fecha: doc.fecha,
    reemplazadoPor: usuario?.nombre || "Sistema",
    reemplazadoEl: new Date().toISOString(),
  };
  doc.versiones = [...(doc.versiones || []), anterior];
  doc.archivoId = meta.archivoId;
  doc.nombre = meta.nombre;
  doc.tamano = meta.tamano;
  doc.fecha = meta.fecha;
  if (meta.mime !== undefined) doc.mime = meta.mime;
  anotarHistorial(data, {
    accion: "reemplazar",
    objeto: "documento",
    objetoId: doc.id,
    tramiteId: item.tramite_id,
    detalle: `${item.codigo} — ${doc.tipoDoc || "Documento"}: nueva versión ${doc.versiones.length + 1} («${doc.nombre}»); se conserva la anterior («${anterior.nombre}»)`,
  });
  write(data);
  return doc;
};

// Borra el documento, sus versiones y sus archivos de IndexedDB. Solo `borrar_doc`.
export const eliminarDocumento = (itemId, docId) => {
  const data = read();
  const { item, doc } = ubicarDocumento(data, itemId, docId);
  exigirEn(data, "borrar_doc", item?.tramite_id);
  if (!item || !doc) return false;
  borrarArchivosDeItems([{ documentos: [doc] }]);
  item.documentos = item.documentos.filter((d) => d.id !== docId);
  const versiones = (doc.versiones || []).length;
  const conVersiones = versiones === 0 ? "" : ` y ${versiones === 1 ? "1 versión anterior" : `${versiones} versiones anteriores`}`;
  anotarHistorial(data, {
    accion: "eliminar",
    objeto: "documento",
    objetoId: doc.id,
    tramiteId: item.tramite_id,
    detalle: `${item.codigo} — ${doc.tipoDoc || "Documento"}: «${doc.nombre}»${conVersiones}`,
  });
  write(data);
  return true;
};

export const addTareaEventual = (tramiteId, clave) => {
  const data = read();
  const tramite = data.tramites.find((t) => t.id === tramiteId);
  if (!tramite) return null;
  const existentes = data.items.filter((i) => i.tramite_id === tramiteId);
  const tarea = crearTareaEventualCatalogo(tramite, clave, existentes, data.catalogo, data.feriados);
  if (!tarea) return null;
  data.items.push(tarea);
  write(data);
  return tarea;
};

// ---------- Catálogo almacenado (§5.4) ----------
// `data.catalogo` es la única fuente de los hitos de los contratos nuevos (ver
// la forma en catalogo.js). Leerlo basta con tener sesión; todo cambio exige
// `catalogo` y queda en el historial (objeto "catalogo") en la misma escritura.
// Los cambios nunca tocan los hitos ya creados en contratos existentes.
const clonar = (valor) => JSON.parse(JSON.stringify(valor));

const MSG_CATALOGO_INVALIDO = "El catálogo no tiene la forma esperada.";
const MSG_CATALOGO_DUPLICADO = "El catálogo tiene hitos duplicados.";

const ETIQUETAS_CAMPO = {
  docs: "documentos requeridos",
  cumplimiento: "documento de cumplimiento",
  nombre: "nombre",
  plazoDias: "plazo",
  plazoBase: "base del plazo",
  plazoHabiles: "días hábiles o calendario",
  norma: "norma",
  nota: "nota",
  activo: "activo",
  ubicacion: "etapa",
};

const describirCampos = (campos) => [...new Set(campos)].map((c) => ETIQUETAS_CAMPO[c] || c).join(", ");

const anotarCatalogo = (data, accion, objetoId, detalle) =>
  anotarHistorial(data, { accion, objeto: "catalogo", objetoId, detalle });

// Cada plantilla tiene un id propio, y una clave que la identifica: la de un
// hito o sección recurrente es única en todo el catálogo; la de un trámite
// eventual o un hito opcional, única en su tipo de contrato (la misma clave
// puede estar en Obra y en Consultoría).
const validarSinDuplicados = (catalogo) => {
  const ids = new Set();
  const claves = new Set();
  recorrerPlantillas(catalogo, ({ tipo, ambito, plantilla }) => {
    const ambitoClave = tipo === "eventual" || tipo === "opcional" ? `${tipo}:${ambito}` : "hito";
    const clave = `${ambitoClave}|${plantilla.clave}`;
    if (ids.has(plantilla.id) || (plantilla.clave !== "" && claves.has(clave))) throw new Error(MSG_CATALOGO_DUPLICADO);
    ids.add(plantilla.id);
    claves.add(clave);
  });
};

// Deja el catálogo con la forma que se guarda: ids en etapas, secciones y
// plantillas (los existentes se conservan) y los valores por defecto de cada
// plantilla (activo, verificado:false, pasos:[], plazoLevantamiento:null).
const normalizarCatalogo = (entrada) => {
  if (!entrada || typeof entrada !== "object") throw new Error(MSG_CATALOGO_INVALIDO);
  const cat = clonar(entrada);
  for (const ambito of AMBITOS) {
    const arbol = cat[ambito];
    if (!arbol || typeof arbol !== "object" || !Array.isArray(arbol.etapas)) throw new Error(MSG_CATALOGO_INVALIDO);
    for (const etapa of arbol.etapas) {
      etapa.id = etapa.id || uid();
      etapa.secciones = Array.isArray(etapa.secciones) ? etapa.secciones : [];
      for (const seccion of etapa.secciones) {
        seccion.id = seccion.id || uid();
        if (seccion.recurrente) {
          seccion.plantilla = completarPlantilla({ clave: seccion.codigo, nombre: seccion.nombre, ...(seccion.plantilla || {}) });
        } else {
          seccion.hitos = (Array.isArray(seccion.hitos) ? seccion.hitos : []).map(completarPlantilla);
        }
      }
    }
  }
  for (const grupo of ["eventuales", "opcionales"]) {
    const origen = cat[grupo] && typeof cat[grupo] === "object" ? cat[grupo] : {};
    cat[grupo] = Object.fromEntries(AMBITOS.map((a) => [a, (Array.isArray(origen[a]) ? origen[a] : []).map(completarPlantilla)]));
  }
  asignarCodigos(cat);
  validarSinDuplicados(cat);
  return cat;
};

export const getCatalogo = () => {
  const data = read();
  if (!usuarioActual(data)) throw new Error("Inicia sesión para ver el catálogo.");
  return clonar(data.catalogo);
};

// Reemplaza el catálogo completo (lo usará el editor de la tarea 7).
export const guardarCatalogo = (catalogo, detalle) => {
  const data = read();
  exigirEn(data, "catalogo");
  data.catalogo = normalizarCatalogo(catalogo);
  anotarCatalogo(data, "editar", "catalogo", String(detalle || "").trim() || "Catálogo actualizado.");
  write(data);
  return clonar(data.catalogo);
};

// Inserta un hito de la semilla en su sección actual, antes del primer hito con
// un código mayor, para que vuelva a su lugar.
const reinsertarHito = (catalogo, original) => {
  const arbol = catalogo[original.ambito];
  const exacta = arbol.etapas.flatMap((e) => e.secciones || []).find((s) => s.codigo === original.seccion.codigo && !s.recurrente);
  const seccion = exacta || seccionPara(arbol, original.etapa.codigo, original.etapa.nombre).seccion;
  const comparar = (a, b) => String(a).localeCompare(String(b), "es", { numeric: true });
  const indice = seccion.hitos.findIndex((h) => /^\d+(\.\d+)+$/.test(h.clave) && comparar(h.clave, original.plantilla.clave) > 0);
  // Si el editor reordenó la sección, su código original puede estar ocupado: en
  // ese caso recibe el siguiente libre.
  if (seccion.hitos.some((h) => h.codigo === original.plantilla.codigo)) delete original.plantilla.codigo;
  if (indice === -1) seccion.hitos.push(original.plantilla);
  else seccion.hitos.splice(indice, 0, original.plantilla);
  asignarCodigos(catalogo);
};

const reinsertarSeccion = (arbol, original) => {
  let etapa = arbol.etapas.find((e) => e.codigo === original.etapa.codigo);
  if (!etapa) {
    etapa = { id: uid(), codigo: original.etapa.codigo, nombre: original.etapa.nombre, secciones: [] };
    arbol.etapas.push(etapa);
  }
  etapa.secciones.push(original.seccion);
};

// Cuántas plantillas del catálogo actual no están en la semilla (hitos,
// trámites eventuales y hitos opcionales agregados por el usuario).
const contarPropios = (actual, semilla) => {
  const claves = new Set();
  recorrerPlantillas(semilla, ({ tipo, ambito, plantilla }) => claves.add(`${tipo}|${ambito}|${plantilla.clave}`));
  let propios = 0;
  recorrerPlantillas(actual, ({ tipo, ambito, plantilla }) => {
    if (tipo !== "recurrente" && !claves.has(`${tipo}|${ambito}|${plantilla.clave}`)) propios += 1;
  });
  return propios;
};

// Sin `ruta`: vuelve a la semilla completa (los hitos propios se pierden).
// Con `ruta`: es la clave de una plantilla, la misma que usa `guardarPlantilla`
// (código del hito o de la sección recurrente, "eventual:<clave>" u
// "opcional:<clave>"). Restaura solo esa plantilla desde la semilla, con el id
// que ya tenía; si se había quitado, la devuelve a su sección. Una clave de
// eventual presente en los dos tipos de contrato se restaura en ambos.
export const restaurarCatalogo = (ruta) => {
  const data = read();
  exigirEn(data, "catalogo");
  if (ruta === undefined || ruta === null || ruta === "") {
    const semilla = catalogoSemilla();
    const propios = contarPropios(data.catalogo, semilla);
    data.catalogo = semilla;
    anotarCatalogo(data, "restaurar", "catalogo", `Se restauró el catálogo original completo.${propios ? ` Se quitaron ${propios} hito${propios === 1 ? "" : "s"} propio${propios === 1 ? "" : "s"}.` : ""}`);
    write(data);
    return clonar(data.catalogo);
  }
  const originales = ubicarPlantillas(catalogoSemilla(), ruta);
  if (originales.length === 0) throw new Error("Este hito no existe en el catálogo original.");
  for (const original of originales) {
    const actuales = ubicarPlantillas(data.catalogo, ruta)
      .filter((u) => u.tipo === original.tipo && u.ambito === original.ambito);
    if (actuales.length === 0) {
      if (original.tipo === "hito") reinsertarHito(data.catalogo, original);
      else if (original.tipo === "recurrente") reinsertarSeccion(data.catalogo[original.ambito], original);
      else data.catalogo[original.tipo === "eventual" ? "eventuales" : "opcionales"][original.ambito].push(original.plantilla);
      continue;
    }
    for (const u of actuales) {
      // Conserva el id y, en un hito, su código actual (el editor puede haber
      // renumerado la sección).
      const restaurada = { ...clonar(original.plantilla), id: u.plantilla.id };
      if (u.tipo === "hito" && u.plantilla.codigo) restaurada.codigo = u.plantilla.codigo;
      if (u.tipo === "recurrente") {
        u.seccion.recurrente = original.seccion.recurrente;
        u.seccion.diaLimite = original.seccion.diaLimite;
        u.seccion.soloPrimerPeriodo = original.seccion.soloPrimerPeriodo;
        u.seccion.plantilla = restaurada;
      } else {
        u.lista[u.lista.indexOf(u.plantilla)] = restaurada;
      }
    }
  }
  const { plantilla } = originales[0];
  anotarCatalogo(data, "restaurar", ruta, `Se restauró «${plantilla.nombre}» (${ruta}) del catálogo original.`);
  write(data);
  return clonar(data.catalogo);
};

// ---------- Plantillas: funciones anteriores, ahora sobre el catálogo ----------
const plantillaRecurrente = (data, clave) =>
  ubicarPlantillas(data.catalogo, clave).find((u) => u.tipo === "recurrente")?.plantilla || null;

export const getPlantilla = (clave) => {
  const [u] = ubicarPlantillas(read().catalogo, clave);
  return u ? clonar(u.plantilla) : null;
};

// Edita la plantilla de una clave desde un hito del expediente. En un hito fijo
// acepta docs, cumplimiento, nombre, plazo, norma y nota; en una sección
// recurrente solo docs, cumplimiento y norma; en eventuales y opcionales, docs
// y cumplimiento. Una clave sin plantilla en el catálogo devuelve null.
export const guardarPlantilla = (clave, plantilla) => {
  if (!clave) return null;
  const data = read();
  exigirEn(data, "catalogo");
  const ubicaciones = ubicarPlantillas(data.catalogo, clave);
  if (ubicaciones.length === 0) return null;
  const campos = ubicaciones.flatMap((u) => aplicarCambiosPlantilla(u, plantilla || {}));
  const principal = ubicaciones[0].plantilla;
  if (campos.length > 0) {
    anotarCatalogo(data, "editar", principal.id, `Plantilla «${principal.nombre}» (${clave}): cambió ${describirCampos(campos)}.`);
    write(data);
  }
  return clonar(principal);
};

// Vista con la forma del catálogo personalizado anterior (Configuración la usa).
const vistaHito = (u) => ({
  ...clonar(u.plantilla),
  tipoObjeto: tipoDeAmbito(u.ambito),
  etapaCodigo: u.etapa?.codigo || "",
  etapaNombre: u.etapa?.nombre || "",
  seccionCodigo: u.seccion?.codigo || "",
  dias: u.plantilla.plazoDias,
  base: u.plantilla.plazoBase,
  habiles: u.plantilla.plazoHabiles,
});

const conAlias = (p) => ({ ...clonar(p), dias: p.plazoDias, habiles: p.plazoHabiles, base: p.plazoBase });

// Hitos propios del catálogo (claves `cat_…`) de ambos tipos de contrato.
export const listarCatalogoHitos = () => {
  const salida = [];
  recorrerPlantillas(read().catalogo, (u) => {
    if (u.tipo === "hito" && String(u.plantilla.clave).startsWith("cat_")) salida.push(vistaHito(u));
  });
  return salida;
};

// `hito` usa los nombres anteriores: nombre, tipoObjeto, etapaCodigo,
// etapaNombre, docs, cumplimiento, dias, base, habiles, norma, nota, activo.
export const agregarCatalogoHito = (hito) => {
  const data = read();
  exigirEn(data, "catalogo");
  if (!String(hito?.nombre || "").trim()) return null;
  const ambito = ambitoDe(hito.tipoObjeto || "Obra");
  const arbol = data.catalogo[ambito];
  const plantilla = plantillaDesdeHitoPersonal({ ...hito, id: undefined, clave: undefined });
  const primera = arbol.etapas[0];
  const { etapa, seccion } = seccionPara(arbol, hito.etapaCodigo || primera?.codigo, hito.etapaNombre || primera?.nombre);
  seccion.hitos.push(plantilla);
  asignarCodigos(data.catalogo);
  anotarCatalogo(data, "agregar", plantilla.id, `Hito «${plantilla.nombre}» agregado al catálogo de ${tipoDeAmbito(ambito)} en ${etapa.codigo} ${etapa.nombre}.`);
  write(data);
  return vistaHito({ ambito, etapa, seccion, plantilla });
};

// Edita cualquier plantilla por id. Acepta los nombres anteriores (dias, base,
// habiles) y los nuevos (plazoDias, plazoBase, plazoHabiles). En un hito, un
// `tipoObjeto` o `etapaCodigo` distinto lo mueve al final de esa etapa.
export const actualizarCatalogoHito = (id, cambios = {}) => {
  const data = read();
  exigirEn(data, "catalogo");
  const u = ubicarPorId(data.catalogo, id);
  if (!u) return null;
  const c = { ...cambios };
  if (c.dias !== undefined && c.plazoDias === undefined) c.plazoDias = c.dias;
  if (c.base !== undefined && c.plazoBase === undefined) c.plazoBase = c.base;
  if (c.habiles !== undefined && c.plazoHabiles === undefined) c.plazoHabiles = c.habiles;
  const campos = aplicarCambiosPlantilla(u, c);
  if (c.activo !== undefined && Boolean(c.activo) !== (u.plantilla.activo !== false)) {
    u.plantilla.activo = Boolean(c.activo);
    campos.push("activo");
  }
  if (u.tipo === "hito" && (c.tipoObjeto !== undefined || c.etapaCodigo !== undefined)) {
    const ambitoDestino = c.tipoObjeto !== undefined ? ambitoDe(c.tipoObjeto) : u.ambito;
    const etapaDestino = c.etapaCodigo || u.etapa.codigo;
    if (ambitoDestino !== u.ambito || etapaDestino !== u.etapa.codigo) {
      u.lista.splice(u.lista.indexOf(u.plantilla), 1);
      // En la sección nueva recibe el siguiente código libre.
      delete u.plantilla.codigo;
      seccionPara(data.catalogo[ambitoDestino], etapaDestino, c.etapaNombre).seccion.hitos.push(u.plantilla);
      asignarCodigos(data.catalogo);
      campos.push("ubicacion");
    }
  }
  if (campos.length > 0) {
    anotarCatalogo(data, "editar", id, `Hito «${u.plantilla.nombre}»: cambió ${describirCampos(campos)}.`);
    write(data);
  }
  const final = ubicarPorId(data.catalogo, id);
  return final.tipo === "hito" ? vistaHito(final) : conAlias(final.plantilla);
};

export const actualizarCatalogoPorClave = (clave, cambios) => {
  const data = read();
  exigirEn(data, "catalogo");
  const [u] = ubicarPlantillas(data.catalogo, clave);
  return u ? actualizarCatalogoHito(u.plantilla.id, cambios) : null;
};

// Quita un hito, eventual u opcional del catálogo. Las secciones recurrentes no
// se quitan por aquí (se desactivan o se editan en el catálogo completo).
export const eliminarCatalogoHito = (id) => {
  const data = read();
  exigirEn(data, "catalogo");
  const u = ubicarPorId(data.catalogo, id);
  if (!u || !u.lista) return false;
  u.lista.splice(u.lista.indexOf(u.plantilla), 1);
  anotarCatalogo(data, "eliminar", id, `«${u.plantilla.nombre}» quitado del catálogo de ${tipoDeAmbito(u.ambito)}.`);
  write(data);
  return true;
};

// Eventuales y opcionales activos, con los alias anteriores (dias, habiles, base).
export const listarEventuales = (tipo) => listarEventualesCatalogo(tipo, read().catalogo).map(conAlias);

export const listarHitosOpcionales = (tipo) => listarHitosOpcionalesCatalogo(tipo, read().catalogo).map(conAlias);

// ---------- Hitos opcionales ----------
export const addHitoOpcional = (tramiteId, clave) => {
  const data = read();
  const tramite = data.tramites.find((t) => t.id === tramiteId);
  if (!tramite) return null;
  const modelo = listarHitosOpcionalesCatalogo(tramite.tipo_objeto, data.catalogo).find((h) => h.clave === clave);
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
  return addItem(tramiteId, modelo.nombre, modelo.etapaNombre, {
    codigo: `${modelo.etapaCodigo}.${consecutivo}`,
    seccionCodigo: modelo.etapaCodigo,
    seccionNombre: modelo.etapaNombre,
    tipo: "opcional",
    plantilla: clavePlantilla,
    clavePlantilla,
    docsRequeridos: [...(modelo.docs || [])],
    docCumplimiento: modelo.cumplimiento || "",
    plazoDias: modelo.plazoDias || 0,
    plazoBase: modelo.plazoBase || "inicio",
    plazoHabiles: modelo.plazoHabiles !== false,
    fecha_limite: modelo.plazoDias
      ? (modelo.plazoHabiles !== false ? sumarHabiles(fechaBase, modelo.plazoDias, data.feriados) : sumarDias(fechaBase, modelo.plazoDias))
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
  const plantilla = plantillaRecurrente(data, clave);
  return addItem(tramiteId, `${baseNombre} ${pad2(consecutivo)} — ${MESES_LARGO[siguiente.getMonth()]} ${siguiente.getFullYear()}`, ultimo.etapaNombre, {
    codigo: `${ultimo.seccionCodigo}.${consecutivo}`,
    seccionCodigo: ultimo.seccionCodigo,
    seccionNombre: ultimo.seccionNombre,
    tipo: "recurrente",
    plantilla: clave,
    clavePlantilla: clave,
    docsRequeridos: [...(plantilla?.docs || ultimo.docsRequeridos || [])],
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
  const plantillaFianza = plantillaRecurrente(data, seccionCodigo);
  const plantillaDocs = plantillaFianza?.docs || [
    "Carta fianza renovada", "Instrucción al banco", "Comprobante de emisión", "Carta de la entidad",
  ];
  const cumplimiento = plantillaFianza?.cumplimiento || "Carta fianza renovada";
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
  // Los hitos que sobran con la nueva configuración se eliminan. Si alguno tiene
  // documentos, es una eliminación de hitos: exige `borrar_hito`, borra los
  // archivos (versiones incluidas) y queda en el historial en la misma escritura.
  const sobrantes = anteriores.slice(nuevas.length);
  const documentosSobrantes = sobrantes.reduce((n, i) => n + (i.documentos || []).length, 0);
  if (documentosSobrantes > 0) {
    exigirEn(data, "borrar_hito", tramiteId);
    borrarArchivosDeItems(sobrantes);
    anotarHistorial(data, {
      accion: "eliminar",
      objeto: "hito",
      objetoId: sobrantes.map((i) => i.id).join(","),
      tramiteId,
      detalle: `Renovaciones de carta fianza (${tramite.codigo}): se quitaron ${sobrantes.length} hito(s) — ${sobrantes.map((i) => i.codigo).join(", ")} — con ${documentosSobrantes} documento(s)`,
    });
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

// Solo tareas de los contratos que la sesión puede ver: de aquí salen los KPI,
// las alertas del Panel y la descarga de todos los archivos.
export const listAllTareas = () => {
  const data = read();
  const usuario = usuarioActual(data);
  return data.tramites
    .filter((t) => veContrato(data.permisosRoles, usuario, t.id))
    .flatMap((t) =>
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

// Respaldo completo en JSON. Exige `respaldo` y nunca incluye las contraseñas demo.
export const exportarDatos = () => {
  const data = read();
  exigirEn(data, "respaldo");
  const copia = { ...data, usuarios: (data.usuarios || []).map(usuarioPublico) };
  return JSON.stringify(copia, null, 2);
};

export const hoyISO = hoy;
export const sumarDiasCalendario = sumarDias;
export const etapasObra = ["Contrato y expediente", "Inicio y aseguramiento", "Ejecución de obra", "Recepción y liquidación"];
export const etapasConsultoria = ["Contrato y expediente", "Inicio y equipo", "Ejecución del servicio", "Entregables y valorizaciones", "Recepción y liquidación"];


// ---------- Seguimiento por pasos ----------
// Un hito con pasos (`item.pasos`) se sigue con movimientos: hechos con fecha y
// documento. El motor (flujo.js) calcula el paso actual, los plazos y el estado, y
// aquí se guardan en el hito (`estado`, `fecha_limite`) para que el Panel y los
// listados sigan funcionando igual.
export const TIPOS_MOVIMIENTO = ["asiento", "presentado", "observado", "levantado", "conformidad", "pronunciamiento", "otro"];

const flujoItemEn = (data, item) =>
  (item?.pasos?.length
    ? calcularFlujo(item, (data.movimientos || []).filter((m) => m.itemId === item.id), { feriados: data.feriados, hoy: hoy() })
    : null);

const itemEn = (data, itemId) => {
  const item = data.items.find((i) => i.id === itemId);
  if (!item) throw new Error("El hito no existe.");
  return item;
};

// Escribe en el hito lo que dice el flujo. "No aplica" no se toca; un hito
// completado conserva su última fecha límite.
function sincronizarItemEn(data, item) {
  const flujo = flujoItemEn(data, item);
  if (!flujo || item.estado === "No aplica") return flujo;
  item.estado = flujo.estado;
  if (flujo.estado === "Completado") {
    if (!item.fecha) {
      const fechas = flujo.pasos.filter((p) => p.movimiento).map((p) => p.movimiento.fecha).sort();
      item.fecha = fechas[fechas.length - 1] || hoy();
    }
  } else {
    item.fecha_limite = flujo.fechaLimite;
  }
  return flujo;
}

// Crea el movimiento dentro de una escritura que ya está abierta: lo usan
// registrarMovimiento, registrarSilencio y la mesa de partes.
export const crearMovimientoEn = (data, item, datos) => {
  exigirEn(data, "registrar", item.tramite_id);
  if (!item.pasos?.length) throw new Error("Este hito no tiene seguimiento por pasos.");
  if (!item.pasos.some((p) => p.clave === datos.pasoClave)) throw new Error("El paso no existe en este hito.");
  if (!TIPOS_MOVIMIENTO.includes(datos.tipo)) throw new Error("El tipo de movimiento no es válido.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(datos.fecha || ""))) throw new Error("Indica la fecha del movimiento.");
  const usuario = usuarioActual(data);
  if (!Array.isArray(data.movimientos)) data.movimientos = [];
  const observaciones = data.movimientos.filter((m) => m.itemId === item.id && !m.anulado && m.tipo === "observado").length;
  const movimiento = {
    id: uid(),
    tramiteId: item.tramite_id,
    itemId: item.id,
    pasoClave: datos.pasoClave,
    ciclo: observaciones + (datos.tipo === "observado" ? 1 : 0),
    tipo: datos.tipo,
    fecha: datos.fecha,
    hora: datos.hora || "",
    numeroDocumento: String(datos.numeroDocumento || "").trim(),
    asientoCO: String(datos.asientoCO || "").trim(),
    cargoId: datos.cargoId || null,
    archivoId: datos.archivoId || null,
    archivoNombre: datos.archivoNombre || "",
    nota: String(datos.nota || "").trim(),
    usuario: usuario?.nombre || "Sistema",
    usuarioId: usuario?.id || null,
    registrado: new Date().toISOString(),
  };
  data.movimientos.push(movimiento);
  sincronizarItemEn(data, item);
  return movimiento;
};

export const registrarMovimiento = (itemId, datos = {}) => {
  const data = read();
  const movimiento = crearMovimientoEn(data, itemEn(data, itemId), datos);
  write(data);
  return clonar(movimiento);
};

export const anularMovimiento = (id, motivo) => {
  const data = read();
  const movimiento = (data.movimientos || []).find((m) => m.id === id);
  if (!movimiento) throw new Error("El movimiento no existe.");
  exigirEn(data, "corregir", movimiento.tramiteId);
  if (movimiento.anulado) throw new Error("El movimiento ya está anulado.");
  const razon = String(motivo || "").trim();
  if (!razon) throw new Error("Indica el motivo de la anulación.");
  const usuario = usuarioActual(data);
  movimiento.anulado = true;
  movimiento.anuladoPor = usuario?.nombre || "Sistema";
  movimiento.motivoAnulacion = razon;
  const item = data.items.find((i) => i.id === movimiento.itemId);
  if (item) sincronizarItemEn(data, item);
  anotarHistorial(data, {
    accion: "anular",
    objeto: "movimiento",
    objetoId: id,
    tramiteId: movimiento.tramiteId,
    detalle: `${item ? `${item.codigo} — ${item.nombre}` : "Hito"}: se anuló «${movimiento.tipo}» del ${movimiento.fecha}. Motivo: ${razon}`,
  });
  write(data);
  return clonar(movimiento);
};

export const listarMovimientos = (itemId) => {
  const data = read();
  const item = data.items.find((i) => i.id === itemId);
  if (!item || !veContrato(data.permisosRoles, usuarioActual(data), item.tramite_id)) return [];
  return clonar((data.movimientos || [])
    .filter((m) => m.itemId === itemId)
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)) || String(a.registrado).localeCompare(String(b.registrado))));
};

export const flujoDeItem = (itemId) => {
  const data = read();
  const item = data.items.find((i) => i.id === itemId);
  if (!item || !veContrato(data.permisosRoles, usuarioActual(data), item.tramite_id)) return null;
  const flujo = flujoItemEn(data, item);
  return flujo ? clonar(flujo) : null;
};

// La plantilla del catálogo de un hito, si tiene pasos definidos.
const plantillaConPasosEn = (data, item) => {
  const tramite = data.tramites.find((t) => t.id === item.tramite_id);
  const ruta = item.tipo === "eventual" ? `eventual:${item.clave}` : item.tipo === "opcional" ? item.plantilla : item.clavePlantilla;
  const ubicada = ubicarPlantillas(data.catalogo, ruta).find((u) => u.ambito === ambitoDe(tramite?.tipo_objeto));
  return ubicada && (ubicada.plantilla.pasos || []).length ? ubicada : null;
};

// Para mostrar "Activar seguimiento por pasos" solo donde el catálogo lo permite.
export const pasosDisponibles = (itemId) => {
  const data = read();
  const item = data.items.find((i) => i.id === itemId);
  return Boolean(item && !item.pasos?.length && item.estado !== "Completado" && plantillaConPasosEn(data, item));
};

// Copia a un hito existente los pasos que su plantilla tiene hoy en el catálogo.
export const activarPasos = (itemId) => {
  const data = read();
  const item = itemEn(data, itemId);
  exigirEn(data, "estado", item.tramite_id);
  if (item.pasos?.length) throw new Error("Este hito ya tiene seguimiento por pasos.");
  if (item.estado === "Completado") throw new Error("Un hito completado no puede pasar a seguimiento por pasos.");
  const ubicada = plantillaConPasosEn(data, item);
  if (!ubicada) throw new Error("Este hito no tiene pasos definidos en el catálogo.");
  item.pasos = instanciarPasos(ubicada.plantilla.pasos, item.tipo === "eventual" ? "" : item.fecha_limite);
  item.plazoLevantamiento = ubicada.plantilla.plazoLevantamiento || null;
  sincronizarItemEn(data, item);
  anotarHistorial(data, {
    accion: "editar",
    objeto: "hito",
    objetoId: item.id,
    tramiteId: item.tramite_id,
    detalle: `Seguimiento por pasos activado en ${item.codigo} — ${item.nombre}.`,
  });
  write(data);
  return clonar(item);
};

// La entidad no se pronunció a tiempo y el usuario confirma el silencio positivo.
// Nada se aprueba solo: esta acción la ejecuta una persona (§5.9 regla 8).
export const registrarSilencio = (itemId) => {
  const data = read();
  const item = itemEn(data, itemId);
  exigirEn(data, "registrar", item.tramite_id);
  const flujo = flujoItemEn(data, item);
  if (!flujo?.silencioVencido) throw new Error("El plazo de la entidad todavía no vence.");
  const paso = flujo.pasos[flujo.actual];
  const movimiento = crearMovimientoEn(data, item, {
    pasoClave: paso.clave,
    tipo: "pronunciamiento",
    fecha: sumarDias(paso.fechaLimite, 1),
    nota: "Aprobado por silencio positivo",
  });
  write(data);
  return clonar(movimiento);
};

// ---------- Alertas del Panel (§5.6) ----------
// Se calculan al momento, solo para los roles con `alertas` y sobre los contratos
// que el usuario ve. Cuatro grupos:
//   te_toca            paso del contratista que vence pronto o ya venció
//   otra_parte         paso de la supervisión o la entidad vencido sin respuesta
//   sin_pasos          hitos con una sola fecha límite (comportamiento anterior)
//   plazo_sin_definir  pasos de la otra parte sin plazo (solo quien edita el catálogo)
const ORDEN_GRUPOS = ["te_toca", "otra_parte", "sin_pasos", "plazo_sin_definir"];
const NOMBRE_PARTE = { supervision: "Supervisión", entidad: "Entidad" };

const textoDias = (dias) => (dias === 0 ? "vence hoy" : dias > 0 ? `vence en ${dias} día(s)` : `venció hace ${Math.abs(dias)} día(s)`);
const fechaCorta = (iso) => {
  const [anio, mes, dia] = String(iso).split("-");
  return `${dia}/${mes}/${anio}`;
};

export const alertasPanel = (hoyIso = hoy()) => {
  const data = read();
  if (!puedeEn(data, "alertas")) return [];
  const usuario = usuarioActual(data);
  const veCatalogo = puedeEn(data, "catalogo");
  const tramites = new Map(data.tramites.map((t) => [t.id, t]));
  const alertas = [];
  let sinPlazoDefinir = 0;

  for (const item of data.items) {
    if (item.estado === "Completado" || item.estado === "No aplica") continue;
    const tramite = tramites.get(item.tramite_id);
    if (!tramite || !veContrato(data.permisosRoles, usuario, tramite.id)) continue;
    const prefijo = `${tramite.codigo} · ${item.codigo} ${item.nombre}`;
    const url = `/tramite/${tramite.id}?tarea=${item.id}`;

    if (!item.pasos?.length) {
      if (!item.fecha_limite) continue;
      const dias = diasEntre(hoyIso, item.fecha_limite);
      if (dias < 0) {
        const silencio = item.silencioPositivo ? "Posible silencio positivo: " : "";
        alertas.push({ grupo: "sin_pasos", nivel: "rojo", dias, url, texto: `${silencio}${prefijo}: plazo vencido hace ${Math.abs(dias)} día(s).` });
      } else if (dias <= 7) {
        alertas.push({ grupo: "sin_pasos", nivel: "ambar", dias, url, texto: `${prefijo}: ${textoDias(dias)}.` });
      }
      continue;
    }

    const flujo = calcularFlujo(item, (data.movimientos || []).filter((m) => m.itemId === item.id), { feriados: data.feriados, hoy: hoyIso });
    if (flujo.actual < 0) continue;
    const paso = flujo.pasos[flujo.actual];
    const limite = flujo.observado ? flujo.levantamientoLimite : paso.fechaLimite;
    const aCargoContratista = flujo.observado || paso.responsable === "contratista";

    if (!aCargoContratista && Number(paso.plazoDias) === 0) sinPlazoDefinir += 1;
    if (!limite) continue;
    const dias = diasEntre(hoyIso, limite);

    if (aCargoContratista) {
      const ventana = Math.max(0, ...(paso.alertas?.length ? paso.alertas : [5]));
      if (dias <= ventana) {
        const texto = flujo.observado ? `Levantar observaciones de «${paso.nombre}»` : paso.nombre;
        alertas.push({ grupo: "te_toca", nivel: dias < 0 ? "rojo" : "ambar", dias, url, texto: `${prefijo}: ${texto} ${textoDias(dias)}.` });
      }
    } else if (dias < 0) {
      const texto = flujo.silencioVencido
        ? `Posible aprobación por silencio: la entidad no se pronunció; plazo vencido el ${fechaCorta(limite)} (hace ${Math.abs(dias)} días).`
        : `${NOMBRE_PARTE[paso.responsable]} sin respuesta: ${paso.nombre} venció hace ${Math.abs(dias)} día(s).`;
      alertas.push({ grupo: "otra_parte", nivel: "rojo", dias, url, texto: `${prefijo}: ${texto}` });
    }
  }

  if (veCatalogo && sinPlazoDefinir > 0) {
    alertas.push({
      grupo: "plazo_sin_definir",
      nivel: "ambar",
      dias: 0,
      url: "/catalogo",
      texto: `${sinPlazoDefinir} paso(s) de la supervisión o la entidad no tienen plazo definido y no generan alerta. Defínelos en el catálogo.`,
    });
  }

  return alertas.sort((a, b) => ORDEN_GRUPOS.indexOf(a.grupo) - ORDEN_GRUPOS.indexOf(b.grupo) || a.dias - b.dias);
};
