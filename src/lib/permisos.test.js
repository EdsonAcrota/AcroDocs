import { describe, it, expect } from "vitest";
import { PERMISOS, ROLES, MATRIZ_INICIAL, ROL_ANTIGUO, tienePermiso, veContrato } from "./permisos.js";

describe("permisos", () => {
  it("gerente tiene todo aunque la matriz diga otra cosa", () => {
    expect(tienePermiso({ gerente: [] }, { rol: "gerente" }, "borrar_doc")).toBe(true);
  });

  it("asis_adm no puede borrar_doc ni borrar_hito", () => {
    const u = { rol: "asis_adm" };
    expect(tienePermiso(MATRIZ_INICIAL, u, "borrar_doc")).toBe(false);
    expect(tienePermiso(MATRIZ_INICIAL, u, "borrar_hito")).toBe(false);
    // pero sí puede subir (permiso que sí tiene)
    expect(tienePermiso(MATRIZ_INICIAL, u, "subir")).toBe(true);
  });

  it("residente sin asignaciones no ve contratos", () => {
    expect(veContrato(MATRIZ_INICIAL, { rol: "residente", contratos: [] }, "t-001")).toBe(false);
  });

  it("residente asignado ve su contrato y puede subir en él", () => {
    const u = { rol: "residente", contratos: ["t-001"] };
    expect(veContrato(MATRIZ_INICIAL, u, "t-001")).toBe(true);
    expect(tienePermiso(MATRIZ_INICIAL, u, "subir", "t-001")).toBe(true);
    expect(tienePermiso(MATRIZ_INICIAL, u, "subir", "t-002")).toBe(false);
  });

  it("usuario null no tiene permisos", () => {
    expect(tienePermiso(MATRIZ_INICIAL, null, "descargar")).toBe(false);
    expect(veContrato(MATRIZ_INICIAL, null, "t-001")).toBe(false);
  });

  it("sin tramiteId solo se evalúa el permiso del rol", () => {
    // residente tiene "subir" en su rol, aunque no tenga contratos asignados
    expect(tienePermiso(MATRIZ_INICIAL, { rol: "residente", contratos: [] }, "subir")).toBe(true);
  });

  it("rol con ver_todos ve cualquier contrato", () => {
    expect(veContrato(MATRIZ_INICIAL, { rol: "consulta" }, "t-999")).toBe(true);
    expect(tienePermiso(MATRIZ_INICIAL, { rol: "consulta" }, "descargar", "t-999")).toBe(true);
    expect(tienePermiso(MATRIZ_INICIAL, { rol: "consulta" }, "subir", "t-999")).toBe(false);
  });

  it("rol desconocido o ausente de la matriz no tiene permisos", () => {
    expect(tienePermiso(MATRIZ_INICIAL, { rol: "inexistente" }, "descargar")).toBe(false);
    expect(veContrato(MATRIZ_INICIAL, { rol: "inexistente" }, "t-001")).toBe(false);
  });

  it("gerente ve todos los contratos aunque la matriz no lo diga", () => {
    expect(veContrato({ gerente: [] }, { rol: "gerente" }, "t-001")).toBe(true);
  });

  it("catálogo de permisos: 19 claves en orden, con los peligrosos marcados", () => {
    expect(PERMISOS.map((p) => p.clave)).toEqual([
      "ver_todos", "crear", "editar", "eliminar",
      "estado", "agregar", "plazos", "borrar_hito",
      "subir", "descargar", "reemplazar", "borrar_doc",
      "registrar", "corregir", "alertas",
      "catalogo", "feriados", "usuarios", "respaldo",
    ]);
    expect(PERMISOS.filter((p) => p.peligroso).map((p) => p.clave)).toEqual(["eliminar", "borrar_hito", "borrar_doc"]);
  });

  it("roles y matriz inicial son coherentes", () => {
    expect(ROLES.map((r) => r.clave)).toEqual([
      "gerente", "socio", "jefe", "residente", "asis_tec", "asis_adm", "finanzas", "legal", "consulta",
    ]);
    const todas = PERMISOS.map((p) => p.clave);
    expect(MATRIZ_INICIAL.gerente).toEqual(todas);
    expect(MATRIZ_INICIAL.socio).toEqual(todas);
    expect(Object.keys(MATRIZ_INICIAL)).toEqual(ROLES.map((r) => r.clave));
    expect(MATRIZ_INICIAL.residente).toEqual(["estado", "subir", "descargar", "registrar", "alertas"]);
    expect(MATRIZ_INICIAL.consulta).toEqual(["ver_todos", "descargar"]);
  });

  it("migración de roles antiguos", () => {
    expect(ROL_ANTIGUO).toEqual({
      admin: "gerente", logistica: "asis_adm", area_usuaria: "asis_tec", legal: "legal", lectura: "consulta",
    });
  });
});
