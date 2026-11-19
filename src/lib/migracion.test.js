import { describe, it, expect } from "vitest";
import {
  migrarV6aV7, USUARIOS_DEMO, aplicarPerfeccionamientoBases, actualizarPerfeccionamientoItems,
  aplicarPrimerPeriodoManual,
} from "./migracion.js";
import { catalogoSemilla } from "./catalogo.js";
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

const hitoPorClave = (arbol, clave) => {
  for (const etapa of arbol.etapas) {
    for (const seccion of etapa.secciones) {
      const h = (seccion.hitos || []).find((x) => x.clave === clave);
      if (h) return { etapa, seccion, hito: h };
    }
  }
  return null;
};
const seccionPorCodigo = (arbol, codigo) => arbol.etapas.flatMap((e) => e.secciones).find((s) => s.codigo === codigo);

describe("migrarV6aV7: catálogo almacenado", () => {
  it("migración funde plantillasDocs (docs editados) en el catálogo", () => {
    const v6 = v6Base();
    v6.plantillasDocs = {
      "1.1.1": { docs: ["Contrato firmado"], cumplimiento: "Contrato firmado" },
      "1.1.2": { docs: ["Carta"], cumplimiento: "Carta", nombre: "Garantía editada", plazoDias: 7, plazoHabiles: true, nota: "N" },
      "1.3.2": { docs: ["Valorización", "Anexo"], cumplimiento: "Anexo", nombre: "Valorización 03 — x", plazoDias: 99 },
      "eventual:ampliacion": { docs: ["Solicitud"], cumplimiento: "" },
      "opcional:seace_obra": { docs: ["Ficha"], cumplimiento: "Ficha" },
      "1.4.1": { docs: ["huérfana"] },
    };
    const v7 = migrarV6aV7(v6);
    expect(v7.plantillasDocs).toBeUndefined();
    expect(v7.catalogoHitos).toBeUndefined();
    const { hito } = hitoPorClave(v7.catalogo.obra, "1.1.1");
    expect(hito).toMatchObject({ docs: ["Contrato firmado"], cumplimiento: "Contrato firmado", verificado: true, pasos: [] });
    expect(hitoPorClave(v7.catalogo.obra, "1.1.2").hito).toMatchObject({
      nombre: "Garantía editada", plazoDias: 7, plazoHabiles: true, nota: "N", docs: ["Carta"],
    });
    // En una sección recurrente solo cuentan documentos, cumplimiento y norma.
    expect(seccionPorCodigo(v7.catalogo.obra, "1.3.2").plantilla).toMatchObject({
      nombre: "Valorización", plazoDias: 0, docs: ["Valorización", "Anexo"], cumplimiento: "Anexo",
    });
    expect(v7.catalogo.eventuales.obra.find((e) => e.clave === "ampliacion").docs).toEqual(["Solicitud"]);
    expect(v7.catalogo.eventuales.consultoria.find((e) => e.clave === "ampliacion").docs).toEqual(["Solicitud"]);
    expect(v7.catalogo.opcionales.obra.find((e) => e.clave === "seace_obra")).toMatchObject({ docs: ["Ficha"], cumplimiento: "Ficha" });
    // las demás plantillas quedan como en la semilla
    expect(hitoPorClave(v7.catalogo.consultoria, "2.1.1").hito.docs).toContain("Contrato suscrito");
  });

  it("migración inserta catalogoHitos en su etapa", () => {
    const v6 = v6Base();
    v6.catalogoHitos = [
      {
        id: "h1", clave: "cat_1", nombre: "Hito obra", tipoObjeto: "Obra", etapaCodigo: "1.2", etapaNombre: "Inicio y aseguramiento",
        docs: ["A"], cumplimiento: "A", dias: 3, base: "suscripcion", habiles: false, norma: "Norma X", nota: "Nota", activo: true,
      },
      { id: "h2", clave: "cat_2", nombre: "Hito consultoría", tipoObjeto: "Consultoría de obra", etapaCodigo: "2.1", etapaNombre: "Contrato y expediente", docs: [], dias: 0, activo: false },
      { id: "h3", clave: "cat_3", nombre: "Hito ejecución", tipoObjeto: "Obra", etapaCodigo: "1.3", etapaNombre: "Ejecución de obra", docs: [] },
      { id: "h4", clave: "cat_4", nombre: "Hito propio", tipoObjeto: "Obra", etapaCodigo: "P", etapaNombre: "Hitos propios", docs: [] },
    ];
    v6.plantillasDocs = { cat_1: { docs: ["A", "B"], cumplimiento: "B" } };
    const v7 = migrarV6aV7(v6);

    const uno = hitoPorClave(v7.catalogo.obra, "cat_1");
    expect(uno.seccion.codigo).toBe("1.2");
    expect(uno.seccion.hitos[uno.seccion.hitos.length - 1].clave).toBe("cat_1");
    expect(uno.hito).toMatchObject({
      nombre: "Hito obra", docs: ["A", "B"], cumplimiento: "B", plazoDias: 3, plazoBase: "suscripcion", plazoHabiles: false,
      norma: "Norma X", nota: "Nota", activo: true, verificado: false, pasos: [], plazoLevantamiento: null,
    });
    expect(typeof uno.hito.id).toBe("string");

    const dos = hitoPorClave(v7.catalogo.consultoria, "cat_2");
    expect(dos.seccion.codigo).toBe("2.1");
    expect(dos.hito.activo).toBe(false);
    expect(hitoPorClave(v7.catalogo.obra, "cat_2")).toBeNull();

    // La etapa 1.3 no tiene una sección 1.3: va a la última sección no recurrente de la etapa.
    expect(hitoPorClave(v7.catalogo.obra, "cat_3").seccion.codigo).toBe("1.3.1");
    // "P" (hitos propios) no existe en la semilla: se crea al final.
    const cuatro = hitoPorClave(v7.catalogo.obra, "cat_4");
    expect(cuatro.etapa).toMatchObject({ codigo: "P", nombre: "Hitos propios" });
    expect(cuatro.seccion.codigo).toBe("P");
  });

  it("conserva un catálogo que ya venga en los datos", () => {
    const v6 = v6Base();
    v6.catalogo = { obra: { etapas: [] }, consultoria: { etapas: [] }, eventuales: { obra: [], consultoria: [] }, opcionales: { obra: [], consultoria: [] } };
    expect(migrarV6aV7(v6).catalogo).toEqual(v6.catalogo);
  });
});

describe("perfeccionamiento según bases integradas", () => {
  const anteriorObra = [
    "Contrato suscrito",
    "Vigencia de poder del representante legal",
    "DNI del representante legal",
    "RUC de la empresa contratista",
    "Presupuesto de obra",
    "Declaración jurada de no impedimento",
    "Relación de maquinarias y equipos",
  ];

  it("actualiza la plantilla de obra y respeta una lista editada por el usuario", () => {
    const catalogo = catalogoSemilla();
    const plantilla = hitoPorClave(catalogo.obra, "1.1.1").hito;
    plantilla.docs = [...anteriorObra];
    expect(aplicarPerfeccionamientoBases(catalogo)).toBe(true);
    expect(plantilla.docs).toContain("CCLC del ejecutor de obra (RNP)");
    expect(plantilla).toMatchObject({ plazoDias: 8, plazoHabiles: true, verificado: true });

    const editado = catalogoSemilla();
    const otra = hitoPorClave(editado.obra, "1.1.1").hito;
    otra.docs = ["Solo mi lista"];
    expect(aplicarPerfeccionamientoBases(editado)).toBe(false);
    expect(otra.docs).toEqual(["Solo mi lista"]);
  });

  it("un catálogo guardado con todos los periodos pasa a generar solo el primero, una sola vez", () => {
    const catalogo = catalogoSemilla();
    const secciones = ["obra", "consultoria"].flatMap((ambito) => catalogo[ambito].etapas.flatMap((e) => e.secciones));
    const mensuales = secciones.filter((s) => ["1.3.2", "2.3.2", "1.3.3", "2.3.3"].includes(s.codigo));
    expect(mensuales).toHaveLength(4);
    mensuales.forEach((s) => { s.soloPrimerPeriodo = false; });

    expect(aplicarPrimerPeriodoManual(catalogo)).toBe(true);
    expect(mensuales.map((s) => s.soloPrimerPeriodo)).toEqual([true, true, true, true]);
    expect(aplicarPrimerPeriodoManual(catalogo)).toBe(false);
  });

  it("actualiza el hito existente sin tocar archivos ni estado", () => {
    const data = {
      tramites: [{ id: "t-001", fecha_suscripcion: "2026-05-25" }],
      feriados: [],
      items: [{
        codigo: "1.1.1", tramite_id: "t-001", estado: "Completado",
        documentos: [{ archivoId: "a1" }], docsRequeridos: [...anteriorObra],
      }],
    };
    expect(actualizarPerfeccionamientoItems(data)).toBe(true);
    expect(data.items[0]).toMatchObject({
      plazoDias: 8, plazoHabiles: true, fecha_limite: "2026-06-04", estado: "Completado",
    });
    expect(data.items[0].docsRequeridos).toContain("CCLC del ejecutor de obra (RNP)");
    expect(data.items[0].documentos).toEqual([{ archivoId: "a1" }]);
  });
});
