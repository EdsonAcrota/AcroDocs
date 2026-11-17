import { describe, it, expect } from "vitest";
import { migrarV6aV7, USUARIOS_DEMO } from "./migracion.js";
import { MATRIZ_INICIAL, ROLES } from "./permisos.js";

const v6Base = () => ({
  version: 6,
  session: { email: "admin@acrodocs.local", nombre: "Administrador", rol: "admin" },
  feriados: ["2026-12-25"],
  plantillasDocs: { "1.1.1": { docs: ["Contrato firmado"], cumplimiento: "Contrato firmado" } },
  catalogoHitos: [],
  configFianzas: { "t-001": { periodo: "anual", tipos: ["fiel_cumplimiento"] } },
  tramites: [
    { id: "t-001", codigo: "OC-1", denominacion: "Obra uno", contratista: "Consorcio Educativo Quelcaya" },
    { id: "t-002", codigo: "CA-2", denominacion: "Consultoría dos", contratista: "Ingeniería y Proyectos del Sur S.A.C." },
  ],
  items: [
    { id: "i-1", tramite_id: "t-001", codigo: "1.1.1", nombre: "Contrato", estado: "Completado", documentos: [{ archivoId: "a1" }] },
    { id: "i-2", tramite_id: "t-001", codigo: "1.1.2", nombre: "Garantía", estado: "Pendiente", documentos: [] },
    { id: "i-3", tramite_id: "t-002", codigo: "2.1.1", nombre: "Contrato", estado: "En revisión", documentos: [] },
  ],
  ampliaciones: [],
});

describe("migrarV6aV7", () => {
  it("conserva items, documentos y estados", () => {
    const v7 = migrarV6aV7(v6Base());
    expect(v7.version).toBe(7);
    expect(v7.tramites).toHaveLength(2);
    expect(v7.items).toHaveLength(3);
    const i1 = v7.items.find((i) => i.id === "i-1");
    expect(i1.estado).toBe("Completado");
    expect(i1.documentos).toEqual([{ archivoId: "a1" }]);
    // los datos de configuración también se conservan
    expect(v7.feriados).toEqual(["2026-12-25"]);
    expect(v7.configFianzas["t-001"].periodo).toBe("anual");
    expect(v7.plantillasDocs["1.1.1"].docs).toEqual(["Contrato firmado"]);
  });

  it("agrega pasos vacíos a cada hito sin tocar los que ya los tengan", () => {
    const v6 = v6Base();
    v6.items[2].pasos = [{ id: "p1" }];
    const v7 = migrarV6aV7(v6);
    expect(v7.items.find((i) => i.id === "i-1").pasos).toEqual([]);
    expect(v7.items.find((i) => i.id === "i-3").pasos).toEqual([{ id: "p1" }]);
  });

  it('contratista "Consorcio X" pasa a ejecutor consorcio', () => {
    const v7 = migrarV6aV7(v6Base());
    expect(v7.tramites[0].ejecutor).toEqual({
      tipo: "consorcio",
      nombre: "Consorcio Educativo Quelcaya",
      ruc: "",
      representante: "",
      integrantes: [],
    });
    expect(v7.tramites[1].ejecutor).toEqual({ tipo: "empresa" });
  });

  it("detecta consorcio sin distinguir mayúsculas ni espacios iniciales", () => {
    const v6 = v6Base();
    v6.tramites[1].contratista = "  CONSORCIO Sur";
    const v7 = migrarV6aV7(v6);
    expect(v7.tramites[1].ejecutor.tipo).toBe("consorcio");
    // "Consorcio" debe ser la primera palabra: un nombre que solo lo contiene no cuenta
    v6.tramites[1].contratista = "Constructora Consorciada S.A.";
    expect(migrarV6aV7(v6).tramites[1].ejecutor).toEqual({ tipo: "empresa" });
  });

  it("no pisa un ejecutor ya definido", () => {
    const v6 = v6Base();
    v6.tramites[0].ejecutor = { tipo: "empresa" };
    expect(migrarV6aV7(v6).tramites[0].ejecutor).toEqual({ tipo: "empresa" });
  });

  it("crea los 9 usuarios demo y la matriz inicial", () => {
    const v7 = migrarV6aV7(v6Base());
    expect(v7.usuarios).toHaveLength(9);
    expect(v7.usuarios.map((u) => u.rol).sort()).toEqual(ROLES.map((r) => r.clave).sort());
    expect(v7.permisosRoles).toEqual(MATRIZ_INICIAL);
    expect(v7.historial).toEqual([]);
    expect(v7.empresa).toEqual({ razonSocial: "", ruc: "" });
    expect(v7.movimientos).toEqual([]);
    expect(v7.cargos).toEqual([]);
  });

  it("USUARIOS_DEMO sigue la convención de correo y clave, y asigna t-001 al residente", () => {
    const porRol = Object.fromEntries(USUARIOS_DEMO.map((u) => [u.rol, u]));
    expect(porRol.gerente).toMatchObject({ email: "gerente@acrodocs.local", password: "gerente123", activo: true });
    expect(porRol.asis_tec).toMatchObject({ email: "tecnico@acrodocs.local", password: "tecnico123" });
    expect(porRol.asis_adm).toMatchObject({ email: "administrativo@acrodocs.local", password: "administrativo123" });
    expect(porRol.residente.contratos).toEqual(["t-001"]);
    expect(porRol.jefe.contratos).toEqual([]);
    expect(new Set(USUARIOS_DEMO.map((u) => u.id)).size).toBe(9);
  });

  it("deja la sesión en null y no hereda usuarios del modelo anterior", () => {
    const v7 = migrarV6aV7(v6Base());
    expect(v7.session).toBeNull();
  });

  it("es pura: no modifica la entrada y no comparte arreglos con las constantes", () => {
    const v6 = v6Base();
    const copia = JSON.parse(JSON.stringify(v6));
    const v7 = migrarV6aV7(v6);
    expect(v6).toEqual(copia);

    v7.permisosRoles.jefe.push("peligro");
    expect(MATRIZ_INICIAL.jefe).not.toContain("peligro");
    v7.usuarios.find((u) => u.rol === "residente").contratos.push("t-999");
    expect(USUARIOS_DEMO.find((u) => u.rol === "residente").contratos).toEqual(["t-001"]);
    v7.items[0].documentos.push({ archivoId: "nuevo" });
    expect(v6.items[0].documentos).toEqual([{ archivoId: "a1" }]);
  });

  it("tolera un v6 incompleto", () => {
    const v7 = migrarV6aV7({ version: 6 });
    expect(v7.tramites).toEqual([]);
    expect(v7.items).toEqual([]);
    expect(Array.isArray(v7.feriados)).toBe(true);
    expect(v7.usuarios).toHaveLength(9);
  });
});
