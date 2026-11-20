// Capa de datos en la nube (Supabase). Un documento por fila: cada colección de la app
// es una tabla con `id`, `tramite_id` y el objeto completo en `data` (jsonb).
//
// Al entrar se carga a memoria todo lo que el usuario puede ver, con la misma forma que
// tiene el estado local, así store.js y las pantallas siguen funcionando igual. Al guardar
// se compara con la última copia conocida del servidor y se envía solo lo que cambió.
// Quién puede escribir qué lo decide la base (RLS), no esta capa.
import { supabase } from "./supabase.js";

const PAGINA = 1000; // PostgREST devuelve como máximo 1000 filas por petición
const LOTE = 200;
const ESPERA_GUARDADO = 400;
const REINTENTOS = [3000, 10000, 30000];
const SIN_PERMISO = "El servidor no permitió guardar este cambio con tus permisos.";

// ---------- Forma de los datos ----------
// Colecciones de objetos con `id`. `contrato` dice de dónde sale el id del contrato.
const COLECCIONES = [
  { tabla: "tramites", campo: "tramites", contrato: null },
  { tabla: "items", campo: "items", contrato: (o) => o.tramite_id },
  { tabla: "movimientos", campo: "movimientos", contrato: (o) => o.tramiteId },
  { tabla: "procedimientos", campo: "procedimientos", contrato: (o) => o.tramiteId },
  { tabla: "cargos", campo: "cargos", contrato: (o) => o.tramiteId },
  { tabla: "historial", campo: "historial", contrato: (o) => o.tramiteId },
];
const CLAVES_CONFIG = [["catalogo", "catalogo"], ["feriados", "feriados"], ["empresa", "empresa"]];
// Altas y cambios van de padres a hijos; las bajas de contratos primero (la base borra en cascada).
const SUBIDA = ["permisos_roles", "config", "tramites", "items", "movimientos", "procedimientos", "cargos", "config_fianzas", "historial", "usuario_contratos", "perfiles"];
const BAJADA = ["tramites", "items", "movimientos", "procedimientos", "cargos", "config_fianzas", "usuario_contratos"];
const COLUMNAS = {
  tramites: "id, data", items: "id, tramite_id, data", movimientos: "id, tramite_id, data",
  procedimientos: "id, tramite_id, data", cargos: "id, tramite_id, data", historial: "id, tramite_id, data",
  config_fianzas: "id, tramite_id, data", config: "clave, valor", permisos_roles: "rol, permisos",
  perfiles: "id, nombre, email, rol, activo, solo_asignados, cambiar_clave",
  usuario_contratos: "usuario_id, tramite_id",
};
const ORDEN = { usuario_contratos: ["usuario_id", "tramite_id"], permisos_roles: ["rol"], config: ["clave"] };
const CLAVE_PRIMARIA = { permisos_roles: "rol", config: "clave" };

export const llaveDe = (tabla, fila) => {
  if (tabla === "usuario_contratos") return `${fila.usuario_id}|${fila.tramite_id}`;
  return fila[CLAVE_PRIMARIA[tabla] || "id"];
};

// Texto con las claves ordenadas: jsonb no conserva el orden de las claves, así que
// comparar el JSON "tal cual" daría cambios falsos.
export const estable = (valor) =>
  JSON.stringify(valor, (_, x) =>
    x && typeof x === "object" && !Array.isArray(x)
      ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]]))
      : x);

// Para saber si el servidor trae algo distinto: las listas con `id` se comparan sin importar
// el orden (la base las devuelve por id; la app las ordena a su manera al mostrarlas).
const canonico = (data) => {
  const copia = { ...data };
  for (const [clave, valor] of Object.entries(copia)) {
    if (Array.isArray(valor) && valor.every((x) => x && typeof x === "object" && "id" in x)) {
      copia[clave] = [...valor].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    }
  }
  if (Array.isArray(copia.usuarios)) copia.usuarios = copia.usuarios.map((u) => ({ ...u, contratos: [...(u.contratos || [])].sort() }));
  return copia;
};

export const mismoContenido = (a, b) => estable(canonico(a)) === estable(canonico(b));

// Estado de la app -> filas por tabla.
export const aFilas = (data) => {
  const filas = {};
  for (const { tabla, campo, contrato } of COLECCIONES) {
    filas[tabla] = (data[campo] || []).map((o) =>
      contrato ? { id: o.id, tramite_id: contrato(o) ?? null, data: o } : { id: o.id, data: o });
  }
  filas.config_fianzas = Object.entries(data.configFianzas || {}).map(([id, cfg]) => ({ id, tramite_id: id, data: cfg }));
  filas.permisos_roles = Object.entries(data.permisosRoles || {}).map(([rol, permisos]) => ({ rol, permisos }));
  filas.config = CLAVES_CONFIG.filter(([, campo]) => data[campo] !== undefined).map(([clave, campo]) => ({ clave, valor: data[campo] }));
  const usuarios = data.usuarios || [];
  filas.perfiles = usuarios.map((u) => ({
    id: u.id, nombre: u.nombre, rol: u.rol, activo: Boolean(u.activo), solo_asignados: Boolean(u.soloAsignados),
  }));
  filas.usuario_contratos = usuarios.flatMap((u) => (u.contratos || []).map((tramite_id) => ({ usuario_id: u.id, tramite_id })));
  return filas;
};

// Filas del servidor -> estado de la app (misma forma que el estado local v7).
export const deFilas = (filas, usuarioId) => {
  const objetos = (tabla) => (filas[tabla] || []).map((f) => f.data);
  const contratosDe = new Map();
  for (const f of filas.usuario_contratos || []) {
    if (!contratosDe.has(f.usuario_id)) contratosDe.set(f.usuario_id, []);
    contratosDe.get(f.usuario_id).push(f.tramite_id);
  }
  const config = Object.fromEntries((filas.config || []).map((f) => [f.clave, f.valor]));
  const data = {
    version: 7,
    session: { usuarioId },
    tramites: objetos("tramites"),
    items: objetos("items"),
    movimientos: objetos("movimientos"),
    procedimientos: objetos("procedimientos"),
    cargos: objetos("cargos"),
    // El historial se muestra en orden de llegada: se ordena por fecha.
    historial: objetos("historial").sort((a, b) => String(a.fecha || "").localeCompare(String(b.fecha || ""))),
    ampliaciones: [],
    configFianzas: Object.fromEntries((filas.config_fianzas || []).map((f) => [f.id, f.data])),
    permisosRoles: Object.fromEntries((filas.permisos_roles || []).map((f) => [f.rol, f.permisos])),
    usuarios: (filas.perfiles || []).map((p) => ({
      id: p.id, nombre: p.nombre, email: p.email, rol: p.rol, activo: p.activo,
      soloAsignados: p.solo_asignados, cambiarClave: p.cambiar_clave, contratos: contratosDe.get(p.id) || [],
    })),
  };
  // Lo que falta en el servidor (catálogo inicial) lo completa store.js al normalizar.
  for (const [clave, campo] of CLAVES_CONFIG) if (config[clave] !== undefined) data[campo] = config[clave];
  return data;
};

// Qué subir y qué borrar: compara las filas actuales con la última copia del servidor
// (`anterior`: Map llave -> texto estable). Los cambios se detectan por `id`.
export const diferencias = (tabla, anterior, filas) => {
  const nuevos = [];
  const cambiados = [];
  const vistas = new Set();
  for (const fila of filas) {
    const llave = llaveDe(tabla, fila);
    vistas.add(llave);
    const previa = anterior.get(llave);
    if (previa === undefined) nuevos.push(fila);
    else if (previa !== estable(fila)) cambiados.push(fila);
  }
  const borrados = [...anterior.keys()].filter((llave) => !vistas.has(llave));
  return { nuevos, cambiados, borrados };
};

// ---------- Mensajes ----------
export const mensajeDe = (error) => {
  const texto = String(error?.message || error || "");
  if (error?.code === "42501" || /row-level security|permission denied/i.test(texto)) return SIN_PERMISO;
  if (/failed to fetch|network|load failed/i.test(texto)) return "Sin conexión con el servidor. Se reintentará.";
  if (/jwt|refresh token/i.test(texto)) return "Tu sesión venció. Vuelve a ingresar.";
  return texto || "No se pudo guardar.";
};

const traducirAuth = (error) => {
  const texto = String(error?.message || "");
  if (/invalid login credentials/i.test(texto)) return "Correo o contraseña incorrectos.";
  if (/different from the old/i.test(texto)) return "La nueva contraseña debe ser distinta de la actual.";
  if (/at least/i.test(texto)) return "La contraseña es demasiado corta.";
  if (/rate limit|too many/i.test(texto)) return "Demasiados intentos. Espera un momento.";
  return texto || "No se pudo completar la acción.";
};

// ---------- Estado de guardado ----------
let base = null; // tabla -> Map(llave -> texto estable): la última copia conocida del servidor
let datos = null; // último estado que pidió guardar store.js
let temporizador = null;
let enCurso = false;
let repetir = false;
let intentos = 0;
let escrituras = 0;
let estado = { fase: "guardado", mensaje: "" };
const oyentes = new Set();

const poner = (fase, mensaje = "") => {
  estado = { fase, mensaje };
  oyentes.forEach((fn) => fn(estado));
};

export const estadoGuardado = () => estado;
export const suscribirEstado = (fn) => { oyentes.add(fn); return () => oyentes.delete(fn); };
// ¿Hay algo sin guardar o con error? (no conviene recargar ni cerrar sesión sin avisar)
export const hayPendientes = () => temporizador !== null || enCurso || estado.fase === "error";

const fijarBase = (filas, tablas = Object.keys(filas)) => {
  if (!base) base = {};
  for (const tabla of tablas) {
    base[tabla] = new Map((filas[tabla] || []).map((f) => [llaveDe(tabla, f), estable(f)]));
  }
};

// Da por conocidas (sin enviarlas) las filas de estas tablas tal como están en `data`.
export const adoptar = (data, tablas) => fijarBase(aFilas(data), tablas);

const marcar = (tabla, filas) => {
  for (const f of filas) base[tabla].set(llaveDe(tabla, f), estable(f));
};

const lotes = (lista, tamano = LOTE) => {
  const salida = [];
  for (let i = 0; i < lista.length; i += tamano) salida.push(lista.slice(i, i + tamano));
  return salida;
};

const subir = async (tabla, { nuevos, cambiados }) => {
  const clave = CLAVE_PRIMARIA[tabla] || "id";
  if (tabla === "perfiles") {
    // Los perfiles se crean desde /api/usuarios; aquí solo se editan los existentes.
    for (const fila of cambiados) {
      const { id, ...campos } = fila;
      const { data, error } = await supabase.from("perfiles").update(campos).eq("id", id).select("id");
      if (error) return error;
      if (!data?.length) return { message: SIN_PERMISO };
      marcar(tabla, [fila]);
    }
    marcar(tabla, nuevos);
    return null;
  }
  if (tabla === "permisos_roles") {
    for (const fila of cambiados) {
      const { data, error } = await supabase.from(tabla).update({ permisos: fila.permisos }).eq("rol", fila.rol).select("rol");
      if (error) return error;
      if (!data?.length) return { message: SIN_PERMISO };
      marcar(tabla, [fila]);
    }
  }
  for (const lote of lotes(nuevos)) {
    let { error } = await supabase.from(tabla).insert(lote);
    // Un alta cuya respuesta se perdió ya existe en el servidor: se completa como cambio.
    if (error?.code === "23505") ({ error } = await supabase.from(tabla).upsert(lote, { onConflict: clave }));
    if (error) return error;
    marcar(tabla, lote);
  }
  if (tabla !== "permisos_roles") {
    for (const lote of lotes(cambiados)) {
      const { error } = await supabase.from(tabla).upsert(lote, { onConflict: clave });
      if (error) return error;
      marcar(tabla, lote);
    }
  }
  return null;
};

const bajar = async (tabla, llaves) => {
  for (const lote of lotes(llaves)) {
    if (tabla === "usuario_contratos") {
      for (const llave of lote) {
        const corte = llave.indexOf("|");
        const { error } = await supabase.from(tabla).delete()
          .eq("usuario_id", llave.slice(0, corte)).eq("tramite_id", llave.slice(corte + 1));
        if (error) return error;
        base[tabla].delete(llave);
      }
    } else {
      const { error } = await supabase.from(tabla).delete().in("id", lote);
      if (error) return error;
      for (const llave of lote) base[tabla].delete(llave);
    }
  }
  return null;
};

const volcar = async () => {
  temporizador = null;
  if (enCurso) { repetir = true; return; }
  if (!datos || !base) return;
  enCurso = true;
  let primerError = null;
  try {
    const filas = aFilas(datos);
    const difs = Object.fromEntries(SUBIDA.map((tabla) => [tabla, diferencias(tabla, base[tabla] || new Map(), filas[tabla] || [])]));
    const hayCambios = SUBIDA.some((t) => difs[t].nuevos.length || difs[t].cambiados.length || difs[t].borrados.length);
    if (hayCambios) {
      poner("guardando");
      const anotar = (error) => { if (error && !primerError) primerError = mensajeDe(error); };
      for (const tabla of SUBIDA) anotar(await subir(tabla, difs[tabla]));
      for (const tabla of BAJADA) anotar(await bajar(tabla, difs[tabla].borrados));
    }
  } catch (error) {
    primerError = mensajeDe(error);
  } finally {
    enCurso = false;
  }
  if (primerError) {
    poner("error", primerError);
    // Un permiso negado no mejora reintentando; un corte de red sí.
    if (primerError !== SIN_PERMISO && intentos < REINTENTOS.length) {
      temporizador = setTimeout(volcar, REINTENTOS[intentos++]);
    }
    return;
  }
  intentos = 0;
  if (repetir) { repetir = false; temporizador = setTimeout(volcar, ESPERA_GUARDADO); return; }
  poner("guardado");
};

// store.js la llama después de cada escritura; agrupa los cambios cercanos en un solo envío.
export const guardar = (data) => {
  datos = data;
  escrituras += 1;
  clearTimeout(temporizador);
  temporizador = setTimeout(volcar, ESPERA_GUARDADO);
};

// Botón "Reintentar" del aviso de error.
export const reintentarGuardado = () => {
  intentos = 0;
  clearTimeout(temporizador);
  temporizador = setTimeout(volcar, 0);
};

const esperarGuardado = async () => {
  clearTimeout(temporizador);
  temporizador = null;
  for (let i = 0; i < 50 && enCurso; i += 1) await new Promise((r) => setTimeout(r, 100));
  await volcar();
};

// ---------- Ingreso ----------
export const ingresar = async (email, clave) => {
  const { error } = await supabase.auth.signInWithPassword({ email: String(email).trim(), password: clave });
  return error ? { error: traducirAuth(error) } : {};
};

export const haySesion = async () => {
  const { data } = await supabase.auth.getSession();
  return Boolean(data?.session);
};

export const cerrarSesion = async () => {
  try { await esperarGuardado(); } catch { /* se cierra igual */ }
  // Solo este dispositivo: el cierre «global» de Supabase tumba también la sesión del celular o de la PC
  // del mismo usuario, que seguiría viendo la app pero ya no podría subir ni descargar archivos.
  await supabase.auth.signOut({ scope: "local" });
  base = null;
  datos = null;
  intentos = 0;
  poner("guardado");
};

// Avisa cuando Supabase da la sesión por terminada (por ejemplo, token que no se pudo renovar).
export const alTerminarSesion = (fn) => {
  const { data } = supabase.auth.onAuthStateChange((evento) => { if (evento === "SIGNED_OUT") fn(); });
  return () => data.subscription.unsubscribe();
};

export const cambiarMiClave = async (clave) => {
  const { error } = await supabase.auth.updateUser({ password: clave });
  if (error) throw new Error(traducirAuth(error));
  const { error: errorMarca } = await supabase.rpc("marcar_clave_cambiada");
  if (errorMarca) throw new Error(mensajeDe(errorMarca));
};

const llamarUsuarios = async (metodo, cuerpo) => {
  const { data } = await supabase.auth.getSession();
  const respuesta = await fetch("/api/usuarios", {
    method: metodo,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data?.session?.access_token || ""}` },
    body: JSON.stringify(cuerpo),
  });
  let json = {};
  try { json = await respuesta.json(); } catch { /* respuesta sin cuerpo JSON */ }
  if (!respuesta.ok) throw new Error(json.error || "No se pudo completar la acción en el servidor.");
  return json;
};

// Crea un usuario (solo con permiso `usuarios`). Devuelve { id, password? }: la contraseña
// solo vuelve si la generó el servidor.
export const crearUsuario = (datos) => llamarUsuarios("POST", datos);
export const restablecerClave = (id, password) => llamarUsuarios("PATCH", { id, password });

// ---------- Carga ----------
const leerTodo = async (tabla) => {
  const filas = [];
  for (let desde = 0; ; desde += PAGINA) {
    let consulta = supabase.from(tabla).select(COLUMNAS[tabla]);
    for (const columna of ORDEN[tabla] || ["id"]) consulta = consulta.order(columna);
    const { data, error } = await consulta.range(desde, desde + PAGINA - 1);
    if (error) throw error;
    filas.push(...data);
    if (data.length < PAGINA) return filas;
  }
};

// Lee del servidor todo lo que el usuario puede ver y lo devuelve con la forma del estado de la app.
// Devuelve null si mientras tanto el usuario guardó algo (para no pisar sus cambios).
export const cargar = async () => {
  const { data: sesion } = await supabase.auth.getSession();
  const usuario = sesion?.session?.user;
  if (!usuario) throw new Error("Falta iniciar sesión.");
  const { data: propio, error } = await supabase.from("perfiles").select("id, activo").eq("id", usuario.id).maybeSingle();
  if (error) throw error;
  if (!propio) throw new Error("Tu usuario todavía no tiene perfil en AcroDocs. Consulta con el gerente general.");
  if (!propio.activo) throw new Error("Este usuario está desactivado. Consulta con el gerente general.");

  const antes = escrituras;
  const tablas = Object.keys(COLUMNAS);
  const leidas = await Promise.all(tablas.map(async (tabla) => [tabla, await leerTodo(tabla)]));
  if (escrituras !== antes) return null;
  const data = deFilas(Object.fromEntries(leidas), usuario.id);
  fijarBase(aFilas(data));
  intentos = 0;
  poner("guardado");
  return data;
};
