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
