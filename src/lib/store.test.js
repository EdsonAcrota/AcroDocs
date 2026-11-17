import { describe, it, expect, beforeEach, vi } from "vitest";
import { MATRIZ_INICIAL } from "./permisos.js";

// IndexedDB no existe en jsdom: se sustituye el borrado de archivos por un mock
// que resuelve, así el borrado "fire and forget" del store no produce rechazos.
const eliminarArchivo = vi.fn(() => Promise.resolve());
vi.mock("./archivos.js", () => ({ eliminarArchivo: (...args) => eliminarArchivo(...args) }));

const CLAVES = {
  gerente: ["gerente@acrodocs.local", "gerente123"],
  socio: ["socio@acrodocs.local", "socio123"],
  jefe: ["jefe@acrodocs.local", "jefe123"],
  residente: ["residente@acrodocs.local", "residente123"],
  asis_tec: ["tecnico@acrodocs.local", "tecnico123"],
  asis_adm: ["administrativo@acrodocs.local", "administrativo123"],
  finanzas: ["finanzas@acrodocs.local", "finanzas123"],
  legal: ["legal@acrodocs.local", "legal123"],
  consulta: ["consulta@acrodocs.local", "consulta123"],
};

let store;

// El store guarda una copia en memoria a nivel de módulo; se reinicia el módulo
// en cada prueba para que no se filtre estado entre ellas.
beforeEach(async () => {
  localStorage.clear();
  eliminarArchivo.mockClear();
  vi.resetModules();
  store = await import("./store.js");
});

const entrar = (rol) => {
  const res = store.loginDemo(...CLAVES[rol]);
  expect(res.error).toBeUndefined();
  return res.session;
};

const leerV7 = () => JSON.parse(localStorage.getItem("acrodocs_demo_v7"));
const escribirV7 = (data) => localStorage.setItem("acrodocs_demo_v7", JSON.stringify(data));

describe("instalación nueva (seed v7)", () => {
  it("genera la misma forma que la migración", () => {
    store.listTramites(); // fuerza la lectura inicial
    const data = leerV7();
    expect(data.version).toBe(7);
    expect(data.session).toBeNull();
    expect(data.usuarios).toHaveLength(9);
    expect(data.permisosRoles).toEqual(MATRIZ_INICIAL);
    expect(data.historial).toEqual([]);
    expect(data.empresa).toEqual({ razonSocial: "", ruc: "" });
    expect(data.movimientos).toEqual([]);
    expect(data.cargos).toEqual([]);
    expect(data.tramites).toHaveLength(2);
    const t1 = data.tramites.find((t) => t.id === "t-001");
    expect(t1.ejecutor).toMatchObject({ tipo: "consorcio", nombre: "Consorcio Educativo Quelcaya" });
    expect(data.tramites.find((t) => t.id === "t-002").ejecutor).toEqual({ tipo: "empresa" });
    expect(data.items.length).toBeGreaterThan(0);
    expect(data.items.every((i) => Array.isArray(i.pasos) && i.pasos.length === 0)).toBe(true);
  });
});

describe("sesión y usuarios", () => {
  it("loginDemo entra con cada usuario demo y getSession devuelve su ficha", () => {
    for (const rol of Object.keys(CLAVES)) {
      const session = entrar(rol);
      expect(session).toMatchObject({ rol, email: CLAVES[rol][0] });
      expect(typeof session.usuarioId).toBe("string");
      expect(typeof session.nombre).toBe("string");
      expect(Array.isArray(session.contratos)).toBe(true);
      expect(store.getSession()).toEqual(session);
    }
  });

  it("el correo no distingue mayúsculas ni espacios", () => {
    const res = store.loginDemo("  Gerente@AcroDocs.local ", "gerente123");
    expect(res.session.rol).toBe("gerente");
  });

  it("rechaza contraseña incorrecta y correo desconocido", () => {
    expect(store.loginDemo("gerente@acrodocs.local", "mala").error).toBeTruthy();
    expect(store.loginDemo("nadie@acrodocs.local", "x").error).toBeTruthy();
    expect(store.getSession()).toBeNull();
  });

  it("rechaza a un usuario inactivo", () => {
    store.listTramites();
    const data = leerV7();
    data.usuarios.find((u) => u.rol === "legal").activo = false;
    escribirV7(data);
    const res = store.loginDemo(...CLAVES.legal);
    expect(res.error).toBeTruthy();
    expect(res.session).toBeUndefined();
    expect(store.getSession()).toBeNull();
  });

  it("la sesión se cae si el usuario se desactiva mientras está dentro", () => {
    entrar("legal");
    const data = leerV7();
    data.usuarios.find((u) => u.rol === "legal").activo = false;
    escribirV7(data);
    expect(store.getSession()).toBeNull();
    expect(store.puede("descargar")).toBe(false);
  });

  it("logout limpia la sesión", () => {
    entrar("gerente");
    store.logout();
    expect(store.getSession()).toBeNull();
    expect(store.listTramites()).toEqual([]);
  });

  it("la sesión sobrevive a una nueva lectura (se guarda en el almacenamiento)", () => {
    entrar("jefe");
    expect(leerV7().session).toEqual({ usuarioId: store.getSession().usuarioId });
  });
});

describe("puede y exigir", () => {
  it("puede usa la sesión y la matriz guardada", () => {
    expect(store.puede("descargar")).toBe(false); // sin sesión
    entrar("asis_adm");
    expect(store.puede("subir")).toBe(true);
    expect(store.puede("borrar_doc")).toBe(false);
    store.logout();
    entrar("gerente");
    expect(store.puede("borrar_doc")).toBe(true);
  });

  it("puede con tramiteId exige ver ese contrato", () => {
    entrar("residente");
    expect(store.puede("subir", "t-001")).toBe(true);
    expect(store.puede("subir", "t-002")).toBe(false);
  });

  it("puede respeta cambios hechos a la matriz guardada", () => {
    entrar("asis_adm");
    const data = leerV7();
    data.permisosRoles.asis_adm.push("borrar_doc");
    escribirV7(data);
    expect(store.puede("borrar_doc")).toBe(true);
  });

  it("exigir lanza el error esperado si no se tiene el permiso", () => {
    entrar("asis_adm");
    expect(() => store.exigir("borrar_hito")).toThrow("No tienes permiso para esta acción.");
    expect(() => store.exigir("subir")).not.toThrow();
  });

  it("exigir falla sin sesión", () => {
    expect(() => store.exigir("descargar")).toThrow("No tienes permiso para esta acción.");
  });
});

describe("visibilidad de contratos", () => {
  it("residente sin asignaciones no ve contratos", () => {
    entrar("residente");
    expect(store.listTramites().map((t) => t.id)).toEqual(["t-001"]);
    const data = leerV7();
    data.usuarios.find((u) => u.rol === "residente").contratos = [];
    escribirV7(data);
    expect(store.listTramites()).toEqual([]);
  });

  it("los roles con ver_todos ven todos los contratos", () => {
    for (const rol of ["gerente", "socio", "jefe", "asis_tec", "asis_adm", "finanzas", "legal", "consulta"]) {
      store.logout();
      entrar(rol);
      expect(store.listTramites()).toHaveLength(2);
    }
  });

  it("getTramite devuelve null si el usuario no ve ese contrato", () => {
    entrar("residente");
    expect(store.getTramite("t-001")).not.toBeNull();
    expect(store.getTramite("t-002")).toBeNull();
    store.logout();
    entrar("gerente");
    expect(store.getTramite("t-002")).not.toBeNull();
    expect(store.getTramite("no-existe")).toBeNull();
  });
});

describe("historial", () => {
  it("registrarHistorial anota usuario, fecha y datos; listarHistorial va de lo más nuevo a lo más viejo", () => {
    const session = entrar("jefe");
    store.registrarHistorial({ accion: "crear", objeto: "contrato", objetoId: "c1", tramiteId: "t-001", detalle: "primero" });
    store.registrarHistorial({ accion: "editar", objeto: "contrato", objetoId: "c1", tramiteId: "t-001", detalle: "segundo" });
    const lista = store.listarHistorial();
    expect(lista.map((h) => h.detalle)).toEqual(["segundo", "primero"]);
    expect(lista[0]).toMatchObject({
      accion: "editar",
      objeto: "contrato",
      objetoId: "c1",
      tramiteId: "t-001",
      usuario: session.nombre,
      usuarioId: session.usuarioId,
    });
    expect(typeof lista[0].id).toBe("string");
    expect(lista[0].fecha).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  });

  it("listarHistorial filtra por tramiteId y por objeto (texto o lista)", () => {
    entrar("gerente");
    store.registrarHistorial({ accion: "eliminar", objeto: "hito", objetoId: "h1", tramiteId: "t-001", detalle: "a" });
    store.registrarHistorial({ accion: "eliminar", objeto: "documento", objetoId: "d1", tramiteId: "t-001", detalle: "b" });
    store.registrarHistorial({ accion: "eliminar", objeto: "cargo", objetoId: "k1", tramiteId: "t-002", detalle: "c" });
    store.registrarHistorial({ accion: "cambiar", objeto: "permiso", objetoId: "p1", detalle: "d" });

    expect(store.listarHistorial()).toHaveLength(4);
    expect(store.listarHistorial({ tramiteId: "t-001" }).map((h) => h.detalle)).toEqual(["b", "a"]);
    expect(store.listarHistorial({ objeto: "cargo" }).map((h) => h.detalle)).toEqual(["c"]);
    expect(store.listarHistorial({ objeto: ["hito", "documento", "cargo"] }).map((h) => h.detalle)).toEqual(["c", "b", "a"]);
    expect(store.listarHistorial({ tramiteId: "t-001", objeto: ["documento", "cargo"] }).map((h) => h.detalle)).toEqual(["b"]);
    expect(store.listarHistorial({ objeto: [] })).toEqual([]);
  });

  it("listarHistorial no muestra entradas de contratos que el usuario no ve", () => {
    entrar("gerente");
    store.registrarHistorial({ accion: "x", objeto: "hito", objetoId: "h1", tramiteId: "t-001", detalle: "visible" });
    store.registrarHistorial({ accion: "x", objeto: "hito", objetoId: "h2", tramiteId: "t-002", detalle: "oculta" });
    store.registrarHistorial({ accion: "x", objeto: "permiso", objetoId: "p", detalle: "general" });
    store.logout();
    entrar("residente");
    expect(store.listarHistorial().map((h) => h.detalle)).toEqual(["general", "visible"]);
    store.logout();
    expect(store.listarHistorial()).toEqual([]);
  });
});

describe("funciones destructivas", () => {
  const primerItem = () => store.listItems("t-001")[0];

  it("asistente administrativo no puede eliminar un hito", () => {
    entrar("asis_adm");
    const item = primerItem();
    const antes = store.listItems("t-001").length;
    expect(() => store.removeItem(item.id)).toThrow("No tienes permiso para esta acción.");
    expect(store.getItem(item.id)).not.toBeNull();
    expect(store.listItems("t-001")).toHaveLength(antes);
    expect(store.listarHistorial()).toEqual([]);
  });

  it("sin sesión no se puede eliminar un hito", () => {
    const item = primerItem();
    expect(() => store.removeItem(item.id)).toThrow("No tienes permiso para esta acción.");
    expect(store.getItem(item.id)).not.toBeNull();
  });

  it("gerente elimina un hito y queda en historial", () => {
    entrar("gerente");
    const item = primerItem();
    store.removeItem(item.id);
    expect(store.getItem(item.id)).toBeNull();
    const [registro] = store.listarHistorial();
    expect(registro.accion).toBe("eliminar");
    expect(registro.objeto).toBe("hito");
    expect(registro.objetoId).toBe(item.id);
    expect(registro.tramiteId).toBe("t-001");
    expect(registro.detalle).toContain(item.nombre);
  });

  it("socio también puede eliminar un hito (la matriz se lo permite)", () => {
    entrar("socio");
    const item = primerItem();
    store.removeItem(item.id);
    expect(store.getItem(item.id)).toBeNull();
  });

  it("eliminar un hito borra los archivos de sus documentos", () => {
    entrar("gerente");
    const item = primerItem();
    store.updateItem(item.id, { documentos: [{ id: "d1", archivoId: "arch-1" }, { id: "d2" }] });
    store.removeItem(item.id);
    expect(eliminarArchivo).toHaveBeenCalledTimes(1);
    expect(eliminarArchivo).toHaveBeenCalledWith("arch-1");
  });

  it("eliminar un hito inexistente no falla ni deja historial", () => {
    entrar("gerente");
    expect(() => store.removeItem("no-existe")).not.toThrow();
    expect(store.listarHistorial()).toEqual([]);
  });

  it("deleteTramite exige el permiso eliminar", () => {
    entrar("jefe");
    expect(() => store.deleteTramite("t-002")).toThrow("No tienes permiso para esta acción.");
    expect(store.getTramite("t-002")).not.toBeNull();
    expect(store.listarHistorial()).toEqual([]);
  });

  it("gerente elimina un contrato con sus hitos y archivos, y queda en historial", () => {
    entrar("gerente");
    const item = primerItem();
    store.updateItem(item.id, { documentos: [{ id: "d1", archivoId: "arch-9" }] });
    const otros = store.listItems("t-002").length;
    expect(otros).toBeGreaterThan(0);

    expect(store.deleteTramite("t-001")).toBe(true);

    expect(store.getTramite("t-001")).toBeNull();
    expect(store.listItems("t-001")).toEqual([]);
    expect(store.listItems("t-002")).toHaveLength(otros);
    expect(store.listTramites().map((t) => t.id)).toEqual(["t-002"]);
    expect(eliminarArchivo).toHaveBeenCalledWith("arch-9");
    // la configuración de fianzas y las asignaciones del contrato también se limpian
    const data = leerV7();
    expect(data.configFianzas["t-001"]).toBeUndefined();
    expect(data.usuarios.find((u) => u.rol === "residente").contratos).toEqual([]);

    const [registro] = store.listarHistorial();
    expect(registro).toMatchObject({ accion: "eliminar", objeto: "contrato", objetoId: "t-001", tramiteId: "t-001" });
    expect(registro.detalle).toContain("DEMO-OC-2026-001");
  });

  it("deleteTramite de un contrato inexistente devuelve false sin historial", () => {
    entrar("gerente");
    expect(store.deleteTramite("no-existe")).toBe(false);
    expect(store.listarHistorial()).toEqual([]);
  });
});

describe("migración desde v6", () => {
  const v6Crudo = () =>
    JSON.stringify({
      version: 6,
      session: { email: "admin@acrodocs.local", nombre: "Administrador", rol: "admin" },
      feriados: ["2026-12-25"],
      plantillasDocs: {},
      catalogoHitos: [],
      configFianzas: {},
      tramites: [
        { id: "x-1", codigo: "C-1", denominacion: "Uno", contratista: "Consorcio Norte", created_at: "2026-01-01" },
        { id: "x-2", codigo: "C-2", denominacion: "Dos", contratista: "Empresa Sur", created_at: "2026-02-01" },
      ],
      items: [
        { id: "i-1", tramite_id: "x-1", codigo: "1.1.1", nombre: "Contrato", estado: "Completado", documentos: [{ archivoId: "a1" }] },
        { id: "i-2", tramite_id: "x-2", codigo: "2.1.1", nombre: "Contrato", estado: "Pendiente", documentos: [] },
      ],
      ampliaciones: [],
    });

  it("read migra acrodocs_demo_v6 y borra la clave vieja", () => {
    localStorage.setItem("acrodocs_demo_v6", v6Crudo());
    store.listTramites();
    expect(localStorage.getItem("acrodocs_demo_v6")).toBeNull();
    const data = leerV7();
    expect(data.version).toBe(7);
    expect(data.tramites.map((t) => t.id)).toEqual(["x-1", "x-2"]);
    expect(data.items).toHaveLength(2);
    expect(data.items.find((i) => i.id === "i-1")).toMatchObject({ estado: "Completado", documentos: [{ archivoId: "a1" }], pasos: [] });
    expect(data.tramites[0].ejecutor.tipo).toBe("consorcio");
    expect(data.tramites[1].ejecutor.tipo).toBe("empresa");
    expect(data.usuarios).toHaveLength(9);
    // el demo no se vuelve a sembrar encima de los datos migrados
    expect(data.tramites.some((t) => t.id === "t-001")).toBe(false);
  });

  it("read guarda acrodocs_respaldo_v6 con el texto original", () => {
    const crudo = v6Crudo();
    localStorage.setItem("acrodocs_demo_v6", crudo);
    store.listTramites();
    expect(localStorage.getItem("acrodocs_respaldo_v6")).toBe(crudo);
  });

  it("la sesión antigua se reinicia: hay que volver a entrar con un usuario nuevo", () => {
    localStorage.setItem("acrodocs_demo_v6", v6Crudo());
    expect(store.getSession()).toBeNull();
    expect(store.loginDemo("admin@acrodocs.local", "admin123").error).toBeTruthy();
    entrar("gerente");
    expect(store.listTramites().map((t) => t.id)).toEqual(["x-2", "x-1"]);
  });

  it("no migra de nuevo ni pisa el respaldo cuando ya existe v7", () => {
    localStorage.setItem("acrodocs_demo_v6", v6Crudo());
    store.listTramites();
    localStorage.setItem("acrodocs_demo_v6", "otro texto");
    store.listTramites();
    expect(leerV7().tramites.map((t) => t.id)).toEqual(["x-1", "x-2"]);
    expect(localStorage.getItem("acrodocs_demo_v6")).toBe("otro texto");
    expect(localStorage.getItem("acrodocs_respaldo_v6")).not.toBe("otro texto");
  });

  it("un respaldo que no se puede guardar no bloquea la migración", () => {
    localStorage.setItem("acrodocs_demo_v6", v6Crudo());
    const original = Storage.prototype.setItem;
    const espia = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (clave, valor) {
      if (clave === "acrodocs_respaldo_v6") throw new Error("cuota excedida");
      return original.call(this, clave, valor);
    });
    try {
      store.listTramites();
    } finally {
      espia.mockRestore();
    }
    expect(leerV7().tramites).toHaveLength(2);
    expect(localStorage.getItem("acrodocs_demo_v6")).toBeNull();
  });
});

describe("inicio de sesión con contraseña vacía", () => {
  it("loginDemo rechaza a un usuario cuya contraseña guardada está vacía", () => {
    store.listTramites();
    const data = leerV7();
    data.usuarios.find((u) => u.rol === "legal").password = "";
    escribirV7(data);
    expect(store.loginDemo(CLAVES.legal[0], "").error).toBeTruthy();
    expect(store.loginDemo(CLAVES.legal[0], "   ").error).toBeTruthy();
    expect(store.getSession()).toBeNull();
  });
});

describe("gestión de usuarios", () => {
  const MENSAJE_GERENTE = "La cuenta del gerente general no se puede modificar.";
  const MENSAJE_ULTIMO = "Debe haber al menos un gerente general activo.";
  const MENSAJE_PERMISO = "No tienes permiso para esta acción.";
  const MENSAJE_ASIGNAR = "Solo un gerente general puede asignar el rol de gerente general.";
  const exacto = (fn, mensaje) => expect(fn).toThrow(new Error(mensaje));

  const idDe = (rol) => leerV7().usuarios.find((u) => u.rol === rol).id;
  const nuevo = (extra = {}) => ({
    nombre: "Marta Quispe",
    email: "marta@acrodocs.local",
    password: "marta123",
    rol: "asis_adm",
    contratos: [],
    ...extra,
  });

  it("listarUsuarios exige el permiso usuarios y no expone contraseñas", () => {
    entrar("jefe");
    exacto(() => store.listarUsuarios(), MENSAJE_PERMISO);
    store.logout();
    entrar("socio");
    const lista = store.listarUsuarios();
    expect(lista).toHaveLength(9);
    expect(lista.every((u) => u.password === undefined)).toBe(true);
    expect(lista.find((u) => u.rol === "residente").contratos).toEqual(["t-001"]);
    // es una copia: modificarla no altera los datos
    lista[0].nombre = "X";
    lista.find((u) => u.rol === "residente").contratos.push("t-002");
    expect(store.listarUsuarios().find((u) => u.rol === "residente").contratos).toEqual(["t-001"]);
    expect(store.listarUsuarios()[0].nombre).not.toBe("X");
  });

  it("sin sesión no se puede listar, crear ni actualizar", () => {
    exacto(() => store.listarUsuarios(), MENSAJE_PERMISO);
    exacto(() => store.crearUsuario(nuevo()), MENSAJE_PERMISO);
    exacto(() => store.actualizarUsuario("u-socio", { nombre: "X" }), MENSAJE_PERMISO);
  });

  it("un rol sin el permiso usuarios no puede crear ni actualizar", () => {
    entrar("asis_adm");
    exacto(() => store.crearUsuario(nuevo()), MENSAJE_PERMISO);
    exacto(() => store.actualizarUsuario(idDe("consulta"), { activo: false }), MENSAJE_PERMISO);
    expect(leerV7().usuarios).toHaveLength(9);
    expect(leerV7().historial).toEqual([]);
  });

  it("crearUsuario agrega al usuario, puede entrar y queda en historial sin la contraseña", () => {
    entrar("socio");
    const creado = store.crearUsuario(
      nuevo({ nombre: "  Marta Quispe ", email: "  Marta@AcroDocs.local ", contratos: ["t-002", "t-002", "no-existe"] })
    );
    expect(creado).toMatchObject({
      nombre: "Marta Quispe",
      email: "marta@acrodocs.local",
      rol: "asis_adm",
      contratos: ["t-002"],
      activo: true,
    });
    expect(typeof creado.id).toBe("string");
    expect(creado.password).toBeUndefined();
    expect(store.listarUsuarios()).toHaveLength(10);

    const [registro] = store.listarHistorial();
    expect(registro).toMatchObject({ accion: "crear", objeto: "usuarios", objetoId: creado.id });
    expect(registro.detalle).toContain("Marta Quispe");
    expect(registro.detalle).not.toContain("marta123");

    store.logout();
    const res = store.loginDemo("marta@acrodocs.local", "marta123");
    expect(res.error).toBeUndefined();
    expect(res.session).toMatchObject({ rol: "asis_adm", contratos: ["t-002"] });
  });

  it("crearUsuario con email repetido lanza error", () => {
    entrar("socio");
    expect(() => store.crearUsuario(nuevo({ email: "legal@acrodocs.local" }))).toThrow("Ya existe un usuario con ese correo.");
    expect(() => store.crearUsuario(nuevo({ email: " LEGAL@acrodocs.local " }))).toThrow("Ya existe un usuario con ese correo.");
    store.crearUsuario(nuevo());
    expect(() => store.crearUsuario(nuevo())).toThrow("Ya existe un usuario con ese correo.");
    expect(store.listarUsuarios()).toHaveLength(10);
  });

  it("crearUsuario valida los datos obligatorios y no deja rastro si falla", () => {
    entrar("socio");
    expect(() => store.crearUsuario(nuevo({ nombre: "   " }))).toThrow("El nombre es obligatorio.");
    expect(() => store.crearUsuario(nuevo({ email: "no-es-correo" }))).toThrow("Escribe un correo válido.");
    expect(() => store.crearUsuario(nuevo({ email: "" }))).toThrow("Escribe un correo válido.");
    expect(() => store.crearUsuario(nuevo({ password: "" }))).toThrow("La contraseña es obligatoria.");
    expect(() => store.crearUsuario(nuevo({ password: "   " }))).toThrow("La contraseña es obligatoria.");
    expect(() => store.crearUsuario(nuevo({ password: undefined }))).toThrow("La contraseña es obligatoria.");
    expect(() => store.crearUsuario(nuevo({ rol: "inventado" }))).toThrow("Elige un rol válido.");
    expect(store.listarUsuarios()).toHaveLength(9);
    expect(store.listarHistorial()).toEqual([]);
  });

  it("solo un gerente puede crear a otro gerente", () => {
    entrar("socio");
    exacto(() => store.crearUsuario(nuevo({ rol: "gerente" })), MENSAJE_ASIGNAR);
    expect(store.listarUsuarios()).toHaveLength(9);
    store.logout();
    entrar("gerente");
    expect(store.crearUsuario(nuevo({ rol: "gerente" })).rol).toBe("gerente");
  });

  it("no se puede editar ni desactivar a un gerente", () => {
    entrar("socio");
    const idGerente = idDe("gerente");
    exacto(() => store.actualizarUsuario(idGerente, { activo: false }), MENSAJE_GERENTE);
    exacto(() => store.actualizarUsuario(idGerente, { rol: "socio" }), MENSAJE_GERENTE);
    exacto(() => store.actualizarUsuario(idGerente, { nombre: "Otro nombre" }), MENSAJE_GERENTE);
    exacto(() => store.actualizarUsuario(idGerente, { password: "nueva123" }), MENSAJE_GERENTE);
    exacto(() => store.actualizarUsuario(idGerente, {}), MENSAJE_GERENTE);
    expect(leerV7().usuarios.find((u) => u.id === idGerente)).toMatchObject({
      rol: "gerente", activo: true, nombre: "Gerente General", password: "gerente123",
    });
    expect(leerV7().historial).toEqual([]);
  });

  it("un rol con el permiso usuarios tampoco puede tocar a un gerente", () => {
    entrar("socio");
    store.setPermisoRol("jefe", "usuarios", true);
    store.logout();
    entrar("jefe");
    exacto(() => store.actualizarUsuario(idDe("gerente"), { activo: false }), MENSAJE_GERENTE);
  });

  it("solo un gerente puede asignar el rol de gerente a otra cuenta", () => {
    entrar("socio");
    exacto(() => store.actualizarUsuario(idDe("consulta"), { rol: "gerente" }), MENSAJE_ASIGNAR);
    expect(leerV7().usuarios.find((u) => u.id === idDe("consulta")).rol).toBe("consulta");
    store.logout();
    entrar("gerente");
    expect(store.actualizarUsuario(idDe("consulta"), { rol: "gerente" }).rol).toBe("gerente");
  });

  it("nunca puede quedar sin ningún gerente activo", () => {
    entrar("gerente");
    const g1 = idDe("gerente");
    exacto(() => store.actualizarUsuario(g1, { activo: false }), MENSAJE_ULTIMO);
    exacto(() => store.actualizarUsuario(g1, { rol: "socio" }), MENSAJE_ULTIMO);
    expect(leerV7().usuarios.find((u) => u.id === g1)).toMatchObject({ rol: "gerente", activo: true });

    // con un segundo gerente se puede desactivar uno, pero no el último que queda
    const g2 = store.crearUsuario(nuevo({ rol: "gerente" })).id;
    store.actualizarUsuario(g2, { activo: false });
    exacto(() => store.actualizarUsuario(g1, { activo: false }), MENSAJE_ULTIMO);
    exacto(() => store.actualizarUsuario(g1, { rol: "jefe" }), MENSAJE_ULTIMO);

    // reactivado el segundo, el primero ya puede dejar de serlo
    store.actualizarUsuario(g2, { activo: true });
    expect(store.actualizarUsuario(g1, { rol: "jefe" }).rol).toBe("jefe");
  });

  it("un gerente puede editar sus propios datos y los de otro gerente", () => {
    entrar("gerente");
    const g1 = idDe("gerente");
    expect(store.actualizarUsuario(g1, { nombre: "Gerente Principal" }).nombre).toBe("Gerente Principal");
    const g2 = store.crearUsuario(nuevo({ rol: "gerente" })).id;
    expect(store.actualizarUsuario(g2, { nombre: "Segunda gerente" }).nombre).toBe("Segunda gerente");
    expect(store.getSession().nombre).toBe("Gerente Principal");
  });

  it("el cambio y su registro se guardan juntos aunque el usuario se desactive a sí mismo", () => {
    entrar("gerente");
    const g1 = idDe("gerente");
    store.crearUsuario(nuevo({ rol: "gerente" }));
    store.actualizarUsuario(g1, { activo: false });
    const ultimo = leerV7().historial.at(-1);
    expect(ultimo).toMatchObject({ accion: "editar", objeto: "usuarios", objetoId: g1, usuarioId: g1, usuario: "Gerente General" });
    expect(store.getSession()).toBeNull();
  });

  it("actualizarUsuario cambia rol, contratos y estado, y se refleja al instante", () => {
    entrar("socio");
    const idResidente = idDe("residente");
    const actualizado = store.actualizarUsuario(idResidente, { contratos: ["t-002", "t-002", "x"], activo: true });
    expect(actualizado.contratos).toEqual(["t-002"]);
    store.logout();
    entrar("residente");
    expect(store.listTramites().map((t) => t.id)).toEqual(["t-002"]);
    store.logout();

    entrar("socio");
    store.actualizarUsuario(idResidente, { rol: "consulta" });
    store.logout();
    entrar("residente");
    expect(store.getSession().rol).toBe("consulta");
    expect(store.puede("subir")).toBe(false);
    expect(store.listTramites()).toHaveLength(2);
    store.logout();

    entrar("socio");
    store.actualizarUsuario(idResidente, { activo: false });
    store.logout();
    expect(store.loginDemo(...CLAVES.residente).error).toBeTruthy();
    entrar("socio");
    store.actualizarUsuario(idResidente, { activo: true });
    store.logout();
    entrar("residente");
  });

  it("actualizarUsuario registra cada cambio en el historial sin guardar la contraseña", () => {
    entrar("socio");
    const id = idDe("legal");
    store.actualizarUsuario(id, { nombre: "Asesora Legal", password: "secreta-9", rol: "finanzas", activo: false });
    const [registro] = store.listarHistorial();
    expect(registro).toMatchObject({ accion: "editar", objeto: "usuarios", objetoId: id });
    expect(registro.detalle).toContain("Asesora Legal");
    expect(registro.detalle).not.toContain("secreta-9");
    expect(registro.detalle).not.toContain("legal123");
    store.actualizarUsuario(id, { activo: true });
    expect(store.loginDemo(CLAVES.legal[0], "secreta-9").session.rol).toBe("finanzas");
    expect(store.loginDemo(CLAVES.legal[0], "legal123").error).toBeTruthy();
  });

  it("actualizarUsuario sin cambios reales no escribe historial", () => {
    entrar("socio");
    store.actualizarUsuario(idDe("legal"), { nombre: "Asesor Legal", rol: "legal", activo: true, contratos: [] });
    expect(store.listarHistorial()).toEqual([]);
  });

  it("actualizarUsuario valida correo, nombre, rol y contraseña", () => {
    entrar("socio");
    const id = idDe("legal");
    expect(() => store.actualizarUsuario(id, { email: "consulta@acrodocs.local" })).toThrow("Ya existe un usuario con ese correo.");
    expect(() => store.actualizarUsuario(id, { email: "roto" })).toThrow("Escribe un correo válido.");
    expect(() => store.actualizarUsuario(id, { nombre: " " })).toThrow("El nombre es obligatorio.");
    expect(() => store.actualizarUsuario(id, { rol: "inventado" })).toThrow("Elige un rol válido.");
    expect(() => store.actualizarUsuario(id, { password: "" })).toThrow("La contraseña es obligatoria.");
    expect(() => store.actualizarUsuario(id, { password: "  " })).toThrow("La contraseña es obligatoria.");
    expect(() => store.actualizarUsuario("no-existe", { nombre: "X" })).toThrow("El usuario no existe.");
    // conservar su propio correo (en otras mayúsculas) no cuenta como repetido
    expect(store.actualizarUsuario(id, { email: "LEGAL@acrodocs.local" }).email).toBe("legal@acrodocs.local");
    expect(leerV7().usuarios.find((u) => u.id === id).password).toBe("legal123");
    expect(store.listarHistorial()).toEqual([]);
  });

  it("omitir la contraseña en los cambios conserva la actual", () => {
    entrar("socio");
    store.actualizarUsuario(idDe("legal"), { nombre: "Asesora Legal" });
    expect(leerV7().usuarios.find((u) => u.rol === "legal").password).toBe("legal123");
  });
});

describe("matriz de permisos", () => {
  const MENSAJE_PERMISO = "No tienes permiso para esta acción.";

  it("getPermisosRoles exige usuarios y devuelve una copia", () => {
    entrar("asis_adm");
    expect(() => store.getPermisosRoles()).toThrow(MENSAJE_PERMISO);
    store.logout();
    entrar("socio");
    const matriz = store.getPermisosRoles();
    expect(matriz).toEqual(MATRIZ_INICIAL);
    matriz.consulta.push("borrar_doc");
    expect(store.getPermisosRoles().consulta).toEqual(MATRIZ_INICIAL.consulta);
  });

  it("setPermisoRol(\"gerente\", ...) lanza error y no cambia nada", () => {
    entrar("socio");
    expect(() => store.setPermisoRol("gerente", "borrar_doc", false)).toThrow("Los permisos del gerente general no se pueden modificar.");
    expect(() => store.setPermisoRol("gerente", "borrar_doc", true)).toThrow();
    expect(store.getPermisosRoles().gerente).toEqual(MATRIZ_INICIAL.gerente);
    expect(store.listarHistorial()).toEqual([]);
    // el gerente tampoco puede tocar su propia fila
    store.logout();
    entrar("gerente");
    expect(() => store.setPermisoRol("gerente", "usuarios", false)).toThrow();
  });

  it("setPermisoRol(\"asis_adm\",\"borrar_doc\",true) habilita borrar_doc al asistente", () => {
    entrar("asis_adm");
    expect(store.puede("borrar_doc")).toBe(false);
    store.logout();

    entrar("socio");
    const matriz = store.setPermisoRol("asis_adm", "borrar_doc", true);
    expect(matriz.asis_adm).toContain("borrar_doc");
    expect(store.getPermisosRoles().asis_adm).toContain("borrar_doc");
    store.logout();

    entrar("asis_adm");
    expect(store.puede("borrar_doc")).toBe(true);
    expect(leerV7().permisosRoles.asis_adm.filter((p) => p === "borrar_doc")).toHaveLength(1);
    // los demás roles no se alteran
    expect(leerV7().permisosRoles.asis_tec).toEqual(MATRIZ_INICIAL.asis_tec);
  });

  it("setPermisoRol quita un permiso y deja ambos cambios en el historial", () => {
    entrar("socio");
    store.setPermisoRol("asis_adm", "borrar_doc", true);
    store.setPermisoRol("asis_adm", "subir", false);
    const lista = store.listarHistorial();
    expect(lista).toHaveLength(2);
    expect(lista[0]).toMatchObject({ accion: "editar", objeto: "permisos" });
    expect(lista[0].detalle).toContain("Asistente administrativo");
    expect(lista[0].detalle).toContain("Subir documentos");
    expect(lista[1].detalle).toContain("Eliminar documentos");
    expect(lista[1].objeto).toBe("permisos");
    store.logout();
    entrar("asis_adm");
    expect(store.puede("subir")).toBe(false);
    expect(store.puede("descargar")).toBe(true);
  });

  it("repetir el mismo valor no cambia nada ni escribe historial", () => {
    entrar("socio");
    store.setPermisoRol("asis_adm", "subir", true);
    store.setPermisoRol("asis_adm", "borrar_doc", false);
    expect(store.listarHistorial()).toEqual([]);
    expect(store.getPermisosRoles().asis_adm).toEqual(MATRIZ_INICIAL.asis_adm);
  });

  it("rechaza roles y permisos que no existen", () => {
    entrar("socio");
    expect(() => store.setPermisoRol("inventado", "subir", true)).toThrow("El rol no existe.");
    expect(() => store.setPermisoRol("consulta", "inventado", true)).toThrow("El permiso no existe.");
    expect(Object.keys(store.getPermisosRoles())).not.toContain("inventado");
    expect(store.listarHistorial()).toEqual([]);
  });

  it("solo quien tiene el permiso usuarios puede cambiar la matriz", () => {
    entrar("jefe");
    expect(() => store.setPermisoRol("consulta", "subir", true)).toThrow(MENSAJE_PERMISO);
    store.logout();
    entrar("socio");
    store.setPermisoRol("jefe", "usuarios", true);
    store.logout();
    entrar("jefe");
    expect(store.setPermisoRol("consulta", "subir", true).consulta).toContain("subir");
  });
});

describe("respaldo previo a la migración", () => {
  it("getRespaldoV6 devuelve el texto crudo guardado y exige el permiso respaldo", () => {
    const crudo = JSON.stringify({ version: 6, tramites: [], items: [] });
    localStorage.setItem("acrodocs_demo_v6", crudo);
    entrar("gerente");
    expect(store.getRespaldoV6()).toBe(crudo);
    store.logout();
    entrar("jefe");
    expect(() => store.getRespaldoV6()).toThrow("No tienes permiso para esta acción.");
  });

  it("getRespaldoV6 devuelve null si no hubo migración", () => {
    entrar("gerente");
    expect(store.getRespaldoV6()).toBeNull();
  });
});

describe("contratos asignables a un usuario", () => {
  it("listarContratosAsignables devuelve todos los contratos aunque el usuario no vea todos, y exige usuarios", () => {
    entrar("jefe");
    expect(() => store.listarContratosAsignables()).toThrow("No tienes permiso para esta acción.");
    store.logout();
    entrar("socio");
    store.setPermisoRol("residente", "usuarios", true);
    store.logout();
    entrar("residente"); // sin ver_todos: solo ve t-001
    expect(store.listTramites().map((t) => t.id)).toEqual(["t-001"]);
    const lista = store.listarContratosAsignables();
    expect(lista.map((c) => c.id).sort()).toEqual(["t-001", "t-002"]);
    expect(lista[0]).toEqual({ id: expect.any(String), codigo: expect.any(String), denominacion: expect.any(String) });
  });
});

describe("versiones de documentos", () => {
  const MENSAJE_PERMISO = "No tienes permiso para esta acción.";
  const meta = (n, extra = {}) => ({
    id: `arch-${n}`,
    archivoId: `arch-${n}`,
    nombre: "Contrato.pdf",
    mime: "application/pdf",
    tamano: 1000 * n,
    fecha: `2026-06-0${n}`,
    tipoDoc: "Contrato",
    ...extra,
  });
  const hitoDe = (tramiteId = "t-001") => store.listItems(tramiteId)[0];
  const docsDe = (itemId) => store.getItem(itemId).documentos;

  // Deja un hito con un documento ya cargado por el gerente y vuelve a la sesión pedida.
  const conDocumentoCargado = (rol) => {
    entrar("gerente");
    const item = hitoDe();
    store.agregarDocumento(item.id, meta(1));
    const doc = docsDe(item.id)[0];
    store.logout();
    entrar(rol);
    return { item, doc };
  };

  it("agregarDocumento guarda el documento en el hito", () => {
    entrar("asis_adm");
    const item = hitoDe();
    const doc = store.agregarDocumento(item.id, meta(1));
    expect(doc).toMatchObject({ archivoId: "arch-1", nombre: "Contrato.pdf", tipoDoc: "Contrato" });
    expect(typeof doc.id).toBe("string");
    expect(docsDe(item.id)).toEqual([doc]);
  });

  it("agregarDocumento exige subir y ver el contrato", () => {
    const item = hitoDe();
    expect(() => store.agregarDocumento(item.id, meta(1))).toThrow(MENSAJE_PERMISO); // sin sesión
    entrar("consulta");
    expect(() => store.agregarDocumento(item.id, meta(1))).toThrow(MENSAJE_PERMISO);
    store.logout();
    entrar("residente"); // solo ve t-001
    const ajeno = hitoDe("t-002");
    expect(() => store.agregarDocumento(ajeno.id, meta(2))).toThrow(MENSAJE_PERMISO);
    expect(docsDe(ajeno.id)).toEqual([]);
    expect(docsDe(item.id)).toEqual([]);
  });

  it("agregarDocumento sobre un hito inexistente lanza error", () => {
    entrar("gerente");
    expect(() => store.agregarDocumento("no-existe", meta(1))).toThrow("El hito no existe.");
  });

  it("reemplazarDocumento guarda la versión anterior", () => {
    const { item, doc } = conDocumentoCargado("jefe");
    const sesion = store.getSession();
    const resultado = store.reemplazarDocumento(item.id, doc.id, meta(2, { nombre: "Contrato v2.pdf" }));

    const [actual] = docsDe(item.id);
    expect(docsDe(item.id)).toHaveLength(1);
    expect(actual.id).toBe(doc.id); // conserva su id
    expect(actual).toMatchObject({ archivoId: "arch-2", nombre: "Contrato v2.pdf", tamano: 2000, fecha: "2026-06-02" });
    expect(actual.tipoDoc).toBe("Contrato");
    expect(actual.versiones).toEqual([
      {
        archivoId: "arch-1",
        nombre: "Contrato.pdf",
        tamano: 1000,
        fecha: "2026-06-01",
        reemplazadoPor: sesion.nombre,
        reemplazadoEl: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/),
      },
    ]);
    expect(resultado).toEqual(actual);
    // el archivo anterior se conserva: no se borra de IndexedDB
    expect(eliminarArchivo).not.toHaveBeenCalled();
    // y el reemplazo queda en el historial
    const [registro] = store.listarHistorial({ tramiteId: "t-001" });
    expect(registro).toMatchObject({ accion: "reemplazar", objeto: "documento", objetoId: doc.id, tramiteId: "t-001" });
    expect(registro.detalle).toContain("Contrato v2.pdf");
  });

  it("reemplazar varias veces acumula las versiones de la más antigua a la más reciente", () => {
    const { item, doc } = conDocumentoCargado("jefe");
    store.reemplazarDocumento(item.id, doc.id, meta(2));
    store.reemplazarDocumento(item.id, doc.id, meta(3));
    const [actual] = docsDe(item.id);
    expect(actual.archivoId).toBe("arch-3");
    expect(actual.versiones.map((v) => v.archivoId)).toEqual(["arch-1", "arch-2"]);
  });

  it("asis_tec puede agregarDocumento a un documento ya cargado sin tocar el anterior", () => {
    const { item, doc } = conDocumentoCargado("asis_tec");
    const antes = JSON.stringify(docsDe(item.id)[0]);
    const nuevo = store.agregarDocumento(item.id, meta(2));
    const docs = docsDe(item.id);
    expect(docs).toHaveLength(2);
    expect(JSON.stringify(docs[0])).toBe(antes); // el anterior queda intacto
    expect(docs[0].versiones).toBeUndefined();
    expect(docs[1]).toEqual(nuevo);
    expect(docs[1].id).not.toBe(doc.id);
    expect(eliminarArchivo).not.toHaveBeenCalled();
  });

  it("asis_tec no puede reemplazarDocumento", () => {
    const { item, doc } = conDocumentoCargado("asis_tec");
    const antes = JSON.stringify(docsDe(item.id));
    expect(() => store.reemplazarDocumento(item.id, doc.id, meta(2))).toThrow(MENSAJE_PERMISO);
    expect(JSON.stringify(docsDe(item.id))).toBe(antes);
    expect(store.listarHistorial()).toEqual([]);
  });

  it("reemplazarDocumento falla si el hito o el documento no existen", () => {
    const { item } = conDocumentoCargado("jefe");
    expect(() => store.reemplazarDocumento("no-existe", "x", meta(2))).toThrow("El hito no existe.");
    expect(() => store.reemplazarDocumento(item.id, "no-existe", meta(2))).toThrow("El documento no existe.");
    expect(docsDe(item.id)[0].archivoId).toBe("arch-1");
  });

  it("eliminarDocumento exige borrar_doc", () => {
    const { item, doc } = conDocumentoCargado("asis_adm");
    expect(() => store.eliminarDocumento(item.id, doc.id)).toThrow(MENSAJE_PERMISO);
    expect(docsDe(item.id)).toHaveLength(1);
    expect(eliminarArchivo).not.toHaveBeenCalled();
    expect(store.listarHistorial()).toEqual([]);
  });

  it("eliminarDocumento borra también los archivos de sus versiones y queda en historial", () => {
    entrar("gerente");
    const item = hitoDe();
    store.agregarDocumento(item.id, meta(1));
    const doc = docsDe(item.id)[0];
    store.reemplazarDocumento(item.id, doc.id, meta(2));
    store.reemplazarDocumento(item.id, doc.id, meta(3));
    // un segundo documento del mismo hito no se toca
    store.agregarDocumento(item.id, meta(4, { tipoDoc: "Otros", nombre: "Otros.pdf" }));

    expect(store.eliminarDocumento(item.id, doc.id)).toBe(true);

    expect(docsDe(item.id).map((d) => d.archivoId)).toEqual(["arch-4"]);
    expect(eliminarArchivo.mock.calls.map((c) => c[0]).sort()).toEqual(["arch-1", "arch-2", "arch-3"]);
    const [registro] = store.listarHistorial();
    expect(registro).toMatchObject({ accion: "eliminar", objeto: "documento", objetoId: doc.id, tramiteId: "t-001" });
    expect(registro.detalle).toContain("Contrato");
    expect(registro.detalle).toContain("2 versiones");
  });

  it("eliminarDocumento devuelve false si el documento no existe", () => {
    entrar("gerente");
    const item = hitoDe();
    expect(store.eliminarDocumento(item.id, "no-existe")).toBe(false);
    expect(store.eliminarDocumento("no-existe", "x")).toBe(false);
    expect(store.listarHistorial()).toEqual([]);
  });
});

describe("guardarConfigFianzas con documentos cargados", () => {
  const MENSAJE_PERMISO = "No tienes permiso para esta acción.";
  const renovaciones = () => store.listItems("t-001").filter((i) => i.seccionCodigo === "1.2.10");
  const docFianza = (n) => ({
    id: `arch-f${n}`, archivoId: `arch-f${n}`, nombre: "Carta.pdf", tamano: 10, fecha: "2026-06-01", tipoDoc: "Carta fianza renovada",
  });

  // Pasa a renovación mensual (varios hitos) y deja un documento en el último.
  const prepararMensual = () => {
    entrar("gerente");
    store.guardarConfigFianzas("t-001", { periodo: "mensual", tipos: ["fiel_cumplimiento"] });
    const lista = renovaciones();
    expect(lista.length).toBeGreaterThan(1);
    const ultimo = lista[lista.length - 1];
    store.agregarDocumento(ultimo.id, docFianza(1));
    return { lista, ultimo };
  };

  it("quitar hitos con documentos exige borrar_hito y no cambia nada si falta", () => {
    const { lista } = prepararMensual();
    store.logout();
    entrar("asis_adm");
    const antes = JSON.stringify(store.listItems("t-001"));
    expect(() => store.guardarConfigFianzas("t-001", { periodo: "anual", tipos: ["fiel_cumplimiento"] })).toThrow(MENSAJE_PERMISO);
    expect(JSON.stringify(store.listItems("t-001"))).toBe(antes);
    expect(renovaciones()).toHaveLength(lista.length);
    expect(eliminarArchivo).not.toHaveBeenCalled();
    expect(store.getConfigFianzas("t-001").periodo).toBe("mensual");
    expect(store.listarHistorial()).toEqual([]);
  });

  it("con borrar_hito quita los hitos sobrantes, borra sus archivos y deja el historial", () => {
    const { lista, ultimo } = prepararMensual();
    store.guardarConfigFianzas("t-001", { periodo: "anual", tipos: ["fiel_cumplimiento"] });
    expect(renovaciones()).toHaveLength(1);
    expect(eliminarArchivo).toHaveBeenCalledWith("arch-f1");
    const [registro] = store.listarHistorial();
    expect(registro).toMatchObject({ accion: "eliminar", objeto: "hito", tramiteId: "t-001" });
    expect(registro.detalle).toContain(ultimo.codigo);
    expect(registro.detalle).toContain(lista[1].codigo);
    expect(registro.detalle).toContain("1 documento");
  });

  it("sin documentos en los hitos sobrantes no exige borrar_hito ni escribe historial", () => {
    entrar("gerente");
    store.guardarConfigFianzas("t-001", { periodo: "mensual", tipos: ["fiel_cumplimiento"] });
    store.logout();
    entrar("asis_adm");
    expect(() => store.guardarConfigFianzas("t-001", { periodo: "anual", tipos: ["fiel_cumplimiento"] })).not.toThrow();
    expect(renovaciones()).toHaveLength(1);
    expect(store.listarHistorial()).toEqual([]);
  });

  it("si los documentos caben en los hitos nuevos, tampoco exige borrar_hito", () => {
    entrar("gerente");
    const [primero] = renovaciones();
    store.agregarDocumento(primero.id, docFianza(2));
    store.logout();
    entrar("asis_adm");
    store.guardarConfigFianzas("t-001", { periodo: "mensual", tipos: ["fiel_cumplimiento"] });
    expect(renovaciones()[0].documentos.map((d) => d.archivoId)).toEqual(["arch-f2"]);
    expect(eliminarArchivo).not.toHaveBeenCalled();
  });
});

describe("respaldo completo", () => {
  it("exportarDatos exige el permiso respaldo", () => {
    expect(() => store.exportarDatos()).toThrow("No tienes permiso para esta acción."); // sin sesión
    entrar("jefe");
    expect(() => store.exportarDatos()).toThrow("No tienes permiso para esta acción.");
  });

  it("exportarDatos incluye los datos pero no las contraseñas", () => {
    entrar("socio");
    const texto = store.exportarDatos();
    const exportado = JSON.parse(texto);
    expect(exportado.tramites).toHaveLength(2);
    expect(exportado.items.length).toBeGreaterThan(0);
    expect(exportado.usuarios).toHaveLength(9);
    expect(exportado.usuarios.every((u) => !("password" in u))).toBe(true);
    expect(exportado.usuarios.find((u) => u.rol === "residente")).toMatchObject({ email: "residente@acrodocs.local", contratos: ["t-001"] });
    expect(exportado.permisosRoles.consulta).toEqual(MATRIZ_INICIAL.consulta);
    expect(texto).not.toContain("residente123");
    expect(texto).not.toContain("gerente123");
    // la exportación no altera los datos guardados
    expect(leerV7().usuarios.every((u) => typeof u.password === "string")).toBe(true);
  });
});

describe("tareas visibles según el contrato", () => {
  const hacerVencer = () => {
    entrar("gerente");
    for (const id of ["t-001", "t-002"]) {
      const item = store.listItems(id).find((i) => i.estado === "Pendiente");
      store.updateItem(item.id, { fecha_limite: "2026-01-01" });
    }
    store.logout();
  };

  it("listAllTareas y tareasConPlazo solo consideran los contratos que el usuario ve", () => {
    hacerVencer();
    entrar("residente"); // solo ve t-001
    const todas = store.listAllTareas();
    expect(todas.length).toBeGreaterThan(0);
    expect(todas.every((t) => t.tramite_id === "t-001")).toBe(true);
    const conPlazo = store.tareasConPlazo();
    expect(conPlazo.length).toBeGreaterThan(0);
    expect(conPlazo.every((t) => t.tramite_id === "t-001")).toBe(true);
  });

  it("un rol con ver_todos ve las tareas de todos los contratos y sin sesión no hay ninguna", () => {
    hacerVencer();
    expect(store.listAllTareas()).toEqual([]);
    expect(store.tareasConPlazo()).toEqual([]);
    entrar("consulta");
    expect(new Set(store.listAllTareas().map((t) => t.tramite_id))).toEqual(new Set(["t-001", "t-002"]));
    expect(new Set(store.tareasConPlazo().map((t) => t.tramite_id))).toEqual(new Set(["t-001", "t-002"]));
  });
});
