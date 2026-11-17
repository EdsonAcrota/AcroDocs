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
    expect(data.items.every((i) => Array.isArray(i.pasos))).toBe(true);
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

describe("ejecutor: empresa o consorcio", () => {
  const consorcio = (integrantes) => ({
    tipo: "consorcio",
    nombre: "Consorcio Andino",
    ruc: "20111111111",
    representante: "Ana Quispe",
    integrantes,
  });

  describe("validarEjecutor", () => {
    it("avisa si las participaciones no suman 100", () => {
      const avisos = store.validarEjecutor(consorcio([
        { razonSocial: "Alfa S.A.C.", ruc: "20222222222", participacion: 60 },
        { razonSocial: "Beta S.R.L.", ruc: "20333333333", participacion: 30 },
      ]));
      expect(avisos).toEqual(["Las participaciones suman 90 %; deben sumar 100 %."]);
    });

    it("no avisa cuando las participaciones suman 100", () => {
      expect(store.validarEjecutor(consorcio([
        { razonSocial: "Alfa", ruc: "", participacion: 60 },
        { razonSocial: "Beta", ruc: "", participacion: 40 },
      ]))).toEqual([]);
    });

    it("la suma se calcula con números aunque la participación llegue como texto del formulario", () => {
      expect(store.validarEjecutor(consorcio([
        { razonSocial: "Alfa", participacion: "70" },
        { razonSocial: "Beta", participacion: "20" },
      ]))).toEqual(["Las participaciones suman 90 %; deben sumar 100 %."]);
    });

    it("una suma con decimales exactos no avisa; una suma no entera se muestra con decimales", () => {
      expect(store.validarEjecutor(consorcio([
        { razonSocial: "A", participacion: 33.3 },
        { razonSocial: "B", participacion: 33.3 },
        { razonSocial: "C", participacion: 33.4 },
      ]))).toEqual([]);
      expect(store.validarEjecutor(consorcio([
        { razonSocial: "A", participacion: 33.3 },
        { razonSocial: "B", participacion: 33.3 },
      ]))).toEqual(["Las participaciones suman 66.6 %; deben sumar 100 %."]);
    });

    it("una participación vacía o inválida cuenta como cero", () => {
      expect(store.validarEjecutor(consorcio([
        { razonSocial: "A", participacion: "" },
        { razonSocial: "B", participacion: 50 },
      ]))).toEqual(["Las participaciones suman 50 %; deben sumar 100 %."]);
    });

    it("consorcio sin integrantes produce aviso", () => {
      expect(store.validarEjecutor(consorcio([]))).toEqual(["El consorcio no tiene integrantes."]);
      expect(store.validarEjecutor({ tipo: "consorcio", nombre: "X" })).toEqual(["El consorcio no tiene integrantes."]);
    });

    it("la empresa propia y un ejecutor ausente no producen avisos", () => {
      expect(store.validarEjecutor({ tipo: "empresa" })).toEqual([]);
      expect(store.validarEjecutor(undefined)).toEqual([]);
      expect(store.validarEjecutor(null)).toEqual([]);
    });

    it("no modifica el ejecutor recibido", () => {
      const ejecutor = consorcio([{ razonSocial: "A", participacion: "40" }]);
      const copia = JSON.parse(JSON.stringify(ejecutor));
      store.validarEjecutor(ejecutor);
      expect(ejecutor).toEqual(copia);
    });
  });

  describe("createTramite", () => {
    it("guarda ejecutor consorcio", () => {
      entrar("gerente");
      const t = store.createTramite({
        codigo: "OC-9", denominacion: "Obra nueva",
        ejecutor: consorcio([
          { razonSocial: "Alfa S.A.C.", ruc: "20222222222", participacion: 60 },
          { razonSocial: "Beta S.R.L.", ruc: "20333333333", participacion: 40 },
        ]),
      });
      expect(t.ejecutor).toEqual({
        tipo: "consorcio",
        nombre: "Consorcio Andino",
        ruc: "20111111111",
        representante: "Ana Quispe",
        integrantes: [
          { razonSocial: "Alfa S.A.C.", ruc: "20222222222", participacion: 60 },
          { razonSocial: "Beta S.R.L.", ruc: "20333333333", participacion: 40 },
        ],
      });
      expect(store.getTramite(t.id).ejecutor).toEqual(t.ejecutor);
      expect(leerV7().tramites.find((x) => x.id === t.id).ejecutor.tipo).toBe("consorcio");
    });

    it("sin ejecutor el contrato queda a cargo de la empresa y ya no escribe el campo libre contratista", () => {
      entrar("gerente");
      const t = store.createTramite({ codigo: "OC-10", denominacion: "Otra obra", contratista: "texto viejo" });
      expect(t.ejecutor).toEqual({ tipo: "empresa" });
      expect(t.contratista).toBeUndefined();
    });

    it("normaliza el ejecutor: recorta textos, convierte participaciones a número y descarta campos ajenos", () => {
      entrar("gerente");
      const t = store.createTramite({
        codigo: "OC-11", denominacion: "Obra",
        ejecutor: {
          tipo: "consorcio", nombre: "  Consorcio Sur ", ruc: " 20444444444 ", representante: " Luis ",
          integrantes: [{ razonSocial: " Alfa ", ruc: " 20 ", participacion: "55.5", otro: "x" }],
          basura: true,
        },
      });
      expect(t.ejecutor).toEqual({
        tipo: "consorcio", nombre: "Consorcio Sur", ruc: "20444444444", representante: "Luis",
        integrantes: [{ razonSocial: "Alfa", ruc: "20", participacion: 55.5 }],
      });
    });

    it("descarta las filas de integrantes totalmente vacías pero conserva las que tienen algún dato", () => {
      entrar("gerente");
      const t = store.createTramite({
        codigo: "OC-13", denominacion: "Obra",
        ejecutor: consorcio([
          { razonSocial: "", ruc: "", participacion: "" },
          { razonSocial: "Alfa", ruc: "", participacion: "" },
          { razonSocial: "", ruc: "", participacion: "40" },
        ]),
      });
      expect(t.ejecutor.integrantes).toEqual([
        { razonSocial: "Alfa", ruc: "", participacion: 0 },
        { razonSocial: "", ruc: "", participacion: 40 },
      ]);
    });

    it("un tipo desconocido se guarda como empresa", () => {
      entrar("gerente");
      const t = store.createTramite({ codigo: "OC-12", denominacion: "Obra", ejecutor: { tipo: "otro", nombre: "X" } });
      expect(t.ejecutor).toEqual({ tipo: "empresa" });
    });
  });

  describe("updateTramite", () => {
    it("normaliza el ejecutor al editar un contrato existente y conserva el resto", () => {
      entrar("gerente");
      const t = store.updateTramite("t-002", {
        ejecutor: { tipo: "consorcio", nombre: " Consorcio Nuevo ", integrantes: [{ razonSocial: "A", participacion: "100" }] },
      });
      expect(t.ejecutor).toEqual({
        tipo: "consorcio", nombre: "Consorcio Nuevo", ruc: "", representante: "",
        integrantes: [{ razonSocial: "A", ruc: "", participacion: 100 }],
      });
      expect(t.codigo).toBe("DEMO-CA-2026-002");
      const vuelta = store.updateTramite("t-002", { ejecutor: { tipo: "empresa", nombre: "residuo" } });
      expect(vuelta.ejecutor).toEqual({ tipo: "empresa" });
    });

    it("sin ejecutor en los cambios no lo toca", () => {
      entrar("gerente");
      const antes = store.getTramite("t-001").ejecutor;
      store.updateTramite("t-001", { estado: "Paralizado" });
      expect(store.getTramite("t-001").ejecutor).toEqual(antes);
    });
  });

  describe("empresa propia", () => {
    it("getEmpresa devuelve la empresa vacía de una instalación nueva, como copia", () => {
      expect(store.getEmpresa()).toEqual({ razonSocial: "", ruc: "" });
      store.getEmpresa().razonSocial = "mutada";
      expect(store.getEmpresa()).toEqual({ razonSocial: "", ruc: "" });
    });

    it("guardarEmpresa exige el permiso usuarios", () => {
      expect(() => store.guardarEmpresa({ razonSocial: "X", ruc: "1" })).toThrow("No tienes permiso para esta acción."); // sin sesión
      entrar("jefe");
      expect(() => store.guardarEmpresa({ razonSocial: "X", ruc: "1" })).toThrow("No tienes permiso para esta acción.");
      expect(store.getEmpresa()).toEqual({ razonSocial: "", ruc: "" });
      expect(store.listarHistorial({ objeto: "empresa" })).toEqual([]);
    });

    it("guardarEmpresa recorta los textos, guarda y deja un registro en el historial", () => {
      const session = entrar("gerente");
      const guardada = store.guardarEmpresa({ razonSocial: "  Constructora Acro S.A.C. ", ruc: " 20555555555 " });
      expect(guardada).toEqual({ razonSocial: "Constructora Acro S.A.C.", ruc: "20555555555" });
      expect(store.getEmpresa()).toEqual(guardada);
      expect(leerV7().empresa).toEqual(guardada);
      const [h] = store.listarHistorial({ objeto: "empresa" });
      expect(h).toMatchObject({ accion: "editar", objeto: "empresa", usuario: session.nombre });
      expect(h.detalle).toContain("Constructora Acro S.A.C.");
      expect(h.detalle).toContain("20555555555");
    });

    it("guardar sin cambios no escribe otra entrada en el historial", () => {
      entrar("gerente");
      store.guardarEmpresa({ razonSocial: "Acro", ruc: "20555555555" });
      store.guardarEmpresa({ razonSocial: " Acro ", ruc: "20555555555" });
      expect(store.listarHistorial({ objeto: "empresa" })).toHaveLength(1);
    });

    it("guardarEmpresa tolera datos ausentes", () => {
      entrar("gerente");
      expect(store.guardarEmpresa({ razonSocial: "Acro" })).toEqual({ razonSocial: "Acro", ruc: "" });
      expect(store.guardarEmpresa()).toEqual({ razonSocial: "", ruc: "" });
    });
  });

  describe("nombreEjecutor", () => {
    it("la empresa muestra su razón social; sin configurar muestra un texto de reemplazo", () => {
      entrar("gerente");
      const t = store.getTramite("t-002");
      expect(store.nombreEjecutor(t)).toBe("Empresa propia");
      store.guardarEmpresa({ razonSocial: "Constructora Acro S.A.C.", ruc: "" });
      expect(store.nombreEjecutor(t)).toBe("Constructora Acro S.A.C.");
    });

    it("el consorcio muestra su nombre", () => {
      entrar("gerente");
      expect(store.nombreEjecutor(store.getTramite("t-001"))).toBe("Consorcio Educativo Quelcaya");
      expect(store.nombreEjecutor({ ejecutor: consorcio([]) })).toBe("Consorcio Andino");
    });

    it("un consorcio antiguo sin nombre usa el texto libre de contratista y, si no hay, un rótulo", () => {
      expect(store.nombreEjecutor({ ejecutor: { tipo: "consorcio", nombre: "", integrantes: [] }, contratista: "Consorcio Viejo" })).toBe("Consorcio Viejo");
      expect(store.nombreEjecutor({ ejecutor: { tipo: "consorcio", integrantes: [] } })).toBe("Consorcio sin nombre");
    });

    it("un contrato sin ejecutor se trata como de la empresa", () => {
      expect(store.nombreEjecutor({ codigo: "X" })).toBe("Empresa propia");
      expect(store.nombreEjecutor(null)).toBe("Empresa propia");
    });
  });
});

// ---------------------------------------------------------------------------
// Regresión del catálogo almacenado (tarea 6). La referencia se capturó con el
// código ANTERIOR al catálogo almacenado (catálogo fijo + plantillasDocs +
// catalogoHitos). Para regenerarla: GOLDEN_WRITE=1 npx vitest run src/lib/store.test.js
// Solo debe regenerarse si un cambio de generación es intencional.
describe("regresión: generación de hitos igual que antes del catálogo almacenado", () => {
  const DIR = `${process.cwd()}/src/lib/__fixtures__`;
  const RUTA = `${DIR}/tareas-golden.json`;

  const proyectar = (t) => ({
    codigo: t.codigo,
    nombre: t.nombre,
    fecha_limite: t.fecha_limite,
    tipo: t.tipo,
    clavePlantilla: String(t.clavePlantilla || "").startsWith("cat_") ? "cat_*" : t.clavePlantilla,
    etapaCodigo: t.etapaCodigo,
    etapaNombre: t.etapaNombre,
    seccionCodigo: t.seccionCodigo,
    seccionNombre: t.seccionNombre,
    docsRequeridos: t.docsRequeridos,
    docCumplimiento: t.docCumplimiento,
    plazoDias: t.plazoDias,
    plazoBase: t.plazoBase,
    plazoHabiles: t.plazoHabiles,
    norma: t.norma,
    nota: t.nota,
    periodo: t.periodo,
    estado: t.estado,
  });

  const escenarios = () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-17T15:00:00Z"));
    try {
      const salida = {};
      salida.seed_t001 = store.listItems("t-001").map(proyectar);
      salida.seed_t002 = store.listItems("t-002").map(proyectar);
      entrar("gerente");
      const obra = store.createTramite({
        codigo: "G-OBRA", denominacion: "Obra golden", tipo_objeto: "Obra",
        fecha_inicio: "2026-03-02", fecha_fin: "2027-04-30", fecha_suscripcion: "2026-02-20",
      });
      const consul = store.createTramite({
        codigo: "G-CONS", denominacion: "Consultoría golden", tipo_objeto: "Consultoría de obra",
        fecha_inicio: "2026-09-14", fecha_fin: "2027-01-29", fecha_suscripcion: "2026-09-07",
      });
      salida.nueva_obra = store.listItems(obra.id).map(proyectar);
      salida.nueva_consultoria = store.listItems(consul.id).map(proyectar);

      store.addTareaEventual(obra.id, "ampliacion");
      store.addTareaEventual(consul.id, "adicional");
      store.addHitoOpcional(obra.id, "residente_obra");
      store.addHitoOpcional(consul.id, "seace_consultoria");
      store.agregarMesSCTR(obra.id);
      store.guardarConfigFianzas(obra.id, { periodo: "semestral", tipos: ["fiel_cumplimiento", "adelanto_directo"] });
      salida.obra_con_agregados = store.listItems(obra.id).map(proyectar);
      salida.consultoria_con_agregados = store.listItems(consul.id).map(proyectar);

      // Catálogo personalizado: plantilla editada + hito propio en la sección 1.2.
      store.guardarPlantilla("1.1.2", { docs: ["Carta fianza", "Otro documento"], cumplimiento: "Carta fianza", plazoDias: 7, nota: "Nota editada" });
      store.guardarPlantilla("1.3.2", { docs: ["Valorización firmada", "Anexo nuevo"], cumplimiento: "Valorización firmada" });
      store.guardarPlantilla("2.1.1", { docs: ["Contrato suscrito"], cumplimiento: "Contrato suscrito", nombre: "Perfeccionamiento editado" });
      store.agregarCatalogoHito({
        nombre: "Hito propio golden", tipoObjeto: "Obra", etapaCodigo: "1.2", etapaNombre: "Inicio y aseguramiento",
        docs: ["Doc A", "Doc B"], cumplimiento: "Doc A", dias: 3, base: "suscripcion", habiles: false,
      });
      store.agregarCatalogoHito({
        nombre: "Hito propio consultoría", tipoObjeto: "Consultoría de obra", etapaCodigo: "2.1", etapaNombre: "Contrato y expediente",
        docs: ["Doc C"], dias: 4,
      });
      const obra2 = store.createTramite({
        codigo: "G-OBRA2", denominacion: "Obra golden 2", tipo_objeto: "Obra",
        fecha_inicio: "2026-03-02", fecha_fin: "2026-08-31", fecha_suscripcion: "2026-02-20",
      });
      const consul2 = store.createTramite({
        codigo: "G-CONS2", denominacion: "Consultoría golden 2", tipo_objeto: "Consultoría de obra",
        fecha_inicio: "2026-09-14", fecha_fin: "2027-01-29", fecha_suscripcion: "2026-09-07",
      });
      salida.obra_catalogo_editado = store.listItems(obra2.id).map(proyectar);
      salida.consultoria_catalogo_editado = store.listItems(consul2.id).map(proyectar);
      return salida;
    } finally {
      vi.useRealTimers();
    }
  };

  it("los contratos demo, los nuevos y los agregados producen los mismos códigos, fechas y documentos", async () => {
    const fs = await import("node:fs");
    const actual = escenarios();
    if (process.env.GOLDEN_WRITE) {
      fs.mkdirSync(DIR, { recursive: true });
      fs.writeFileSync(RUTA, `${JSON.stringify(actual, null, 2)}\n`);
    }
    const esperado = JSON.parse(fs.readFileSync(RUTA, "utf8"));
    expect(Object.keys(actual)).toEqual(Object.keys(esperado));
    for (const clave of Object.keys(esperado)) {
      expect(actual[clave], clave).toEqual(esperado[clave]);
    }
  });
});

describe("catálogo almacenado", () => {
  const hitoEn = (catalogo, clave) => {
    for (const ambito of ["obra", "consultoria"]) {
      for (const etapa of catalogo[ambito].etapas) {
        for (const seccion of etapa.secciones) {
          const h = (seccion.hitos || []).find((x) => x.clave === clave);
          if (h) return h;
        }
      }
    }
    return null;
  };
  const historialCatalogo = () => store.listarHistorial({ objeto: "catalogo" });
  const nuevaObra = () => store.createTramite({
    codigo: "OC-CAT", denominacion: "Obra", tipo_objeto: "Obra",
    fecha_inicio: "2026-03-02", fecha_fin: "2026-08-31", fecha_suscripcion: "2026-02-20",
  });

  it("la instalación nueva guarda el catálogo y ya no tiene plantillasDocs ni catalogoHitos", () => {
    store.listTramites();
    const data = leerV7();
    expect(data.catalogo.obra.etapas.length).toBeGreaterThan(0);
    expect(data.plantillasDocs).toBeUndefined();
    expect(data.catalogoHitos).toBeUndefined();
  });

  it("getCatalogo exige sesión y devuelve una copia con ids estables entre lecturas", () => {
    expect(() => store.getCatalogo()).toThrow();
    entrar("consulta");
    const a = store.getCatalogo();
    const b = store.getCatalogo();
    expect(hitoEn(a, "1.1.1").id).toBe(hitoEn(b, "1.1.1").id);
    hitoEn(a, "1.1.1").docs.push("mutado");
    expect(hitoEn(store.getCatalogo(), "1.1.1").docs).not.toContain("mutado");
  });

  it("asis_adm no puede guardarCatalogo", () => {
    entrar("asis_adm");
    const cat = store.getCatalogo();
    expect(() => store.guardarCatalogo(cat, "x")).toThrow("No tienes permiso para esta acción.");
    expect(() => store.guardarPlantilla("1.1.1", { docs: ["X"] })).toThrow("No tienes permiso");
    expect(() => store.agregarCatalogoHito({ nombre: "X" })).toThrow("No tienes permiso");
    expect(() => store.restaurarCatalogo()).toThrow("No tienes permiso");
  });

  it("jefe sí puede guardarCatalogo y queda en el historial", () => {
    entrar("jefe");
    const cat = store.getCatalogo();
    hitoEn(cat, "1.1.1").docs = ["Contrato suscrito", "Nuevo requisito"];
    store.guardarCatalogo(cat, "Se agregó un requisito al perfeccionamiento");
    expect(hitoEn(store.getCatalogo(), "1.1.1").docs).toEqual(["Contrato suscrito", "Nuevo requisito"]);
    const [h] = historialCatalogo();
    expect(h).toMatchObject({ accion: "editar", objeto: "catalogo", detalle: "Se agregó un requisito al perfeccionamiento" });
  });

  it("guardarCatalogo completa los campos por defecto de las plantillas nuevas", () => {
    entrar("gerente");
    const cat = store.getCatalogo();
    cat.obra.etapas[0].secciones[0].hitos.push({ clave: "cat_nuevo", nombre: "Nuevo", docs: [] });
    store.guardarCatalogo(cat, "Hito nuevo");
    const nuevo = hitoEn(store.getCatalogo(), "cat_nuevo");
    expect(nuevo).toMatchObject({ activo: true, verificado: false, pasos: [], plazoLevantamiento: null });
    expect(typeof nuevo.id).toBe("string");
  });

  it("guardarPlantilla cambia los contratos nuevos y no los existentes", () => {
    entrar("gerente");
    const antes = nuevaObra();
    const docsAntes = store.listItems(antes.id).find((i) => i.codigo === "1.1.2").docsRequeridos;
    store.guardarPlantilla("1.1.2", { docs: ["Carta fianza", " Carta fianza ", "Anexo"], cumplimiento: "Carta fianza" });
    expect(store.getPlantilla("1.1.2")).toMatchObject({ docs: ["Carta fianza", "Anexo"], cumplimiento: "Carta fianza" });
    const despues = nuevaObra();
    expect(store.listItems(despues.id).find((i) => i.codigo === "1.1.2").docsRequeridos).toEqual(["Carta fianza", "Anexo"]);
    expect(store.listItems(antes.id).find((i) => i.codigo === "1.1.2").docsRequeridos).toEqual(docsAntes);
    const [h] = historialCatalogo();
    expect(h).toMatchObject({ accion: "editar", objeto: "catalogo" });
    expect(h.detalle).toContain("Garantía de fiel cumplimiento");
  });

  it("guardarPlantilla de una sección recurrente cambia sus periodos y no su nombre", () => {
    entrar("gerente");
    store.guardarPlantilla("1.3.2", { docs: ["Valorización firmada"], cumplimiento: "Valorización firmada", nombre: "Valorización 01 — marzo 2026" });
    const t = nuevaObra();
    const v = store.listItems(t.id).find((i) => i.codigo === "1.3.2.1");
    expect(v).toMatchObject({ nombre: "Valorización 01 — marzo 2026", docsRequeridos: ["Valorización firmada"] });
    const v2 = store.listItems(t.id).find((i) => i.codigo === "1.3.2.2");
    expect(v2.nombre).toBe("Valorización 02 — abril 2026");
  });

  it("guardarPlantilla con una clave que no está en el catálogo no escribe nada", () => {
    entrar("gerente");
    expect(store.guardarPlantilla("1.4.1", { docs: ["X"] })).toBeNull();
    expect(historialCatalogo()).toEqual([]);
  });

  it("agregar, actualizar y eliminar un hito personalizado quedan en el catálogo y en el historial", () => {
    entrar("jefe");
    const creado = store.agregarCatalogoHito({
      nombre: "Hito propio", tipoObjeto: "Obra", etapaCodigo: "1.2", etapaNombre: "Inicio y aseguramiento",
      docs: ["A", "A", " B "], dias: 3, base: "suscripcion", habiles: false,
    });
    expect(creado).toMatchObject({ nombre: "Hito propio", tipoObjeto: "Obra", etapaCodigo: "1.2", docs: ["A", "B"], dias: 3, habiles: false });
    expect(creado.clave.startsWith("cat_")).toBe(true);
    expect(store.listarCatalogoHitos().map((h) => h.clave)).toEqual([creado.clave]);
    let t = nuevaObra();
    expect(store.listItems(t.id).find((i) => i.clavePlantilla === creado.clave)).toMatchObject({ codigo: "1.2.10", fecha_limite: "2026-02-23" });

    store.actualizarCatalogoPorClave(creado.clave, { nombre: "Hito renombrado", dias: 0 });
    expect(store.listarCatalogoHitos()[0]).toMatchObject({ id: creado.id, nombre: "Hito renombrado", dias: 0 });
    store.actualizarCatalogoHito(creado.id, { activo: false });
    t = nuevaObra();
    expect(store.listItems(t.id).some((i) => i.clavePlantilla === creado.clave)).toBe(false);

    store.eliminarCatalogoHito(creado.id);
    expect(store.listarCatalogoHitos()).toEqual([]);
    expect(historialCatalogo().map((h) => h.accion)).toEqual(["eliminar", "editar", "editar", "agregar"]);
  });

  it("actualizarCatalogoHito puede mover el hito a otra etapa", () => {
    entrar("gerente");
    const creado = store.agregarCatalogoHito({ nombre: "Móvil", tipoObjeto: "Obra", etapaCodigo: "1.1", etapaNombre: "Contrato y expediente" });
    store.actualizarCatalogoHito(creado.id, { etapaCodigo: "1.5", etapaNombre: "Recepción y liquidación" });
    expect(store.listarCatalogoHitos()[0]).toMatchObject({ etapaCodigo: "1.5", etapaNombre: "Recepción y liquidación" });
    const t = nuevaObra();
    expect(store.listItems(t.id).find((i) => i.clavePlantilla === creado.clave).codigo).toBe("1.5.9");
  });

  it("restaurarCatalogo sin ruta vuelve a la semilla completa", () => {
    entrar("gerente");
    store.guardarPlantilla("1.1.1", { docs: ["Solo uno"] });
    store.agregarCatalogoHito({ nombre: "Propio", tipoObjeto: "Obra", etapaCodigo: "1.1" });
    store.restaurarCatalogo();
    const cat = store.getCatalogo();
    expect(hitoEn(cat, "1.1.1").docs).toContain("Vigencia de poder del representante legal");
    expect(store.listarCatalogoHitos()).toEqual([]);
    expect(historialCatalogo()[0]).toMatchObject({ accion: "restaurar", objeto: "catalogo" });
  });

  it("restaurarCatalogo con una clave restaura solo esa plantilla y conserva su id", () => {
    entrar("gerente");
    const id = hitoEn(store.getCatalogo(), "1.1.1").id;
    store.guardarPlantilla("1.1.1", { docs: ["Solo uno"] });
    store.guardarPlantilla("1.1.2", { docs: ["Otro"] });
    store.restaurarCatalogo("1.1.1");
    const cat = store.getCatalogo();
    expect(hitoEn(cat, "1.1.1")).toMatchObject({ id, nombre: "Perfeccionamiento de contrato" });
    expect(hitoEn(cat, "1.1.1").docs).toContain("Contrato suscrito");
    expect(hitoEn(cat, "1.1.2").docs).toEqual(["Otro"]);
    expect(historialCatalogo()[0]).toMatchObject({ accion: "restaurar", objeto: "catalogo" });
    expect(historialCatalogo()[0].detalle).toContain("Perfeccionamiento de contrato");
  });

  it("restaurarCatalogo de un hito que no está en la semilla avisa", () => {
    entrar("gerente");
    const creado = store.agregarCatalogoHito({ nombre: "Propio", tipoObjeto: "Obra", etapaCodigo: "1.1" });
    expect(() => store.restaurarCatalogo(creado.clave)).toThrow("Este hito no existe en el catálogo original.");
  });

  it("restaurarCatalogo devuelve un hito quitado a su sección", () => {
    entrar("gerente");
    const cat = store.getCatalogo();
    const seccion = cat.obra.etapas[0].secciones[0];
    seccion.hitos = seccion.hitos.filter((h) => h.clave !== "1.1.3");
    store.guardarCatalogo(cat, "Se quitó 1.1.3");
    expect(hitoEn(store.getCatalogo(), "1.1.3")).toBeNull();
    store.restaurarCatalogo("1.1.3");
    expect(hitoEn(store.getCatalogo(), "1.1.3")).toMatchObject({ nombre: "Garantía por adelanto directo" });
  });

  it("listarEventuales y listarHitosOpcionales leen del catálogo con los alias de siempre", () => {
    entrar("gerente");
    const ampliacion = store.listarEventuales("Obra").find((e) => e.clave === "ampliacion");
    expect(ampliacion).toMatchObject({ dias: 10, habiles: true, plazoDias: 10 });
    const cat = store.getCatalogo();
    cat.eventuales.obra.find((e) => e.clave === "ampliacion").activo = false;
    cat.opcionales.obra.find((e) => e.clave === "residente_obra").docs = ["Carta"];
    store.guardarCatalogo(cat, "x");
    expect(store.listarEventuales("Obra").map((e) => e.clave)).not.toContain("ampliacion");
    const t = nuevaObra();
    expect(store.addTareaEventual(t.id, "ampliacion")).toBeNull();
    expect(store.addHitoOpcional(t.id, "residente_obra").docsRequeridos).toEqual(["Carta"]);
  });

  it("un v7 guardado antes del catálogo almacenado se funde al leer y guarda ids estables", async () => {
    store.listTramites();
    const viejo = leerV7();
    delete viejo.catalogo;
    viejo.plantillasDocs = { "1.1.1": { docs: ["Editado"], cumplimiento: "Editado" } };
    viejo.catalogoHitos = [{ id: "h", clave: "cat_v", nombre: "Viejo", tipoObjeto: "Obra", etapaCodigo: "1.1", etapaNombre: "Contrato y expediente", docs: [] }];
    escribirV7(viejo);
    vi.resetModules();
    store = await import("./store.js");
    entrar("gerente");
    const guardado = leerV7();
    expect(guardado.plantillasDocs).toBeUndefined();
    expect(guardado.catalogoHitos).toBeUndefined();
    expect(hitoEn(guardado.catalogo, "1.1.1").docs).toEqual(["Editado"]);
    expect(hitoEn(guardado.catalogo, "cat_v")).toBeTruthy();
    expect(hitoEn(store.getCatalogo(), "1.1.1").id).toBe(hitoEn(guardado.catalogo, "1.1.1").id);
  });
  it("reordenar los hitos de una sección renumera por posición y el contrato nuevo los trae en ese orden", async () => {
    entrar("gerente");
    const { renumerarHitos } = await import("./catalogo.js");
    const cat = store.getCatalogo();
    const seccion = cat.obra.etapas[0].secciones.find((s) => (s.hitos || []).length > 1);
    const [primero, segundo] = seccion.hitos;
    [seccion.hitos[0], seccion.hitos[1]] = [segundo, primero];
    renumerarHitos(seccion);
    store.guardarCatalogo(cat, "reorden");
    const items = store.listItems(nuevaObra().id);
    expect(items.find((i) => i.nombre === segundo.nombre).codigo).toBe(`${seccion.codigo}.1`);
    expect(items.find((i) => i.nombre === primero.nombre).codigo).toBe(`${seccion.codigo}.2`);
  });

  it("guardarCatalogo rechaza hitos con la misma clave", () => {
    entrar("gerente");
    const cat = store.getCatalogo();
    const seccion = cat.obra.etapas[0].secciones.find((s) => (s.hitos || []).length > 1);
    seccion.hitos[1].clave = seccion.hitos[0].clave;
    expect(() => store.guardarCatalogo(cat, "x")).toThrow("El catálogo tiene hitos duplicados.");
  });
});
