import { describe, it, expect } from "vitest";
import {
  catalogoSemilla,
  crearTareas,
  crearTareaEventual,
  listarEventuales,
  listarHitosOpcionales,
  ordenarGrupos,
  moverHitoASeccion,
  claseDeHito,
  CLASES_HITO,
} from "./catalogo.js";
import { FERIADOS_2026 } from "./fechas.js";
import golden from "./__fixtures__/tareas-golden.json";

const T001 = {
  id: "t-001", tipo_objeto: "Obra",
  fecha_inicio: "2026-06-01", fecha_fin: "2026-12-15", fecha_suscripcion: "2026-05-25", created_at: "2026-05-20",
};
const T002 = {
  id: "t-002", tipo_objeto: "Consultoría de obra",
  fecha_inicio: "2026-08-03", fecha_fin: "2026-11-30", fecha_suscripcion: "2026-07-28", created_at: "2026-07-15",
};

const ordenar = (lista) =>
  [...lista].sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), "es", { numeric: true }));

const proyectar = (t) => ({
  codigo: t.codigo,
  nombre: t.nombre,
  fecha_limite: t.fecha_limite,
  tipo: t.tipo,
  clavePlantilla: t.clavePlantilla,
  docsRequeridos: t.docsRequeridos,
  docCumplimiento: t.docCumplimiento,
  plazoDias: t.plazoDias,
  plazoBase: t.plazoBase,
  plazoHabiles: t.plazoHabiles,
  norma: t.norma,
  nota: t.nota,
  periodo: t.periodo,
});

// Todas las plantillas del catálogo, con su ubicación.
const plantillasDe = (catalogo) => {
  const salida = [];
  for (const ambito of ["obra", "consultoria"]) {
    for (const etapa of catalogo[ambito].etapas) {
      for (const seccion of etapa.secciones) {
        if (seccion.plantilla) salida.push(seccion.plantilla);
        for (const h of seccion.hitos || []) salida.push(h);
      }
    }
    salida.push(...catalogo.eventuales[ambito], ...catalogo.opcionales[ambito]);
  }
  return salida;
};

const hitoPorClave = (arbol, clave) => {
  for (const etapa of arbol.etapas) {
    for (const seccion of etapa.secciones) {
      const h = (seccion.hitos || []).find((x) => x.clave === clave);
      if (h) return h;
    }
  }
  return null;
};

const seccionPorCodigo = (arbol, codigo) =>
  arbol.etapas.flatMap((e) => e.secciones).find((s) => s.codigo === codigo);

describe("catalogoSemilla", () => {
  it("es serializable y tiene las cuatro partes", () => {
    const cat = catalogoSemilla();
    expect(JSON.parse(JSON.stringify(cat))).toEqual(cat);
    expect(cat.obra).toMatchObject({ codigo: "1", nombre: "Obra" });
    expect(cat.consultoria).toMatchObject({ codigo: "2", nombre: "Consultoría de obra" });
    expect(cat.eventuales.obra.map((e) => e.clave)).toContain("ampliacion");
    expect(cat.eventuales.consultoria.map((e) => e.clave)).toContain("cambio_personal");
    expect(cat.opcionales.obra.map((e) => e.clave)).toEqual(["seace_obra", "conformidad_expediente", "residente_obra"]);
    expect(cat.opcionales.consultoria.map((e) => e.clave)).toEqual(["seace_consultoria"]);
  });

  it("cada plantilla nace activa, con verificación explícita y id propio; solo los trámites con secuencia traen pasos", () => {
    const todas = plantillasDe(catalogoSemilla());
    expect(todas.length).toBe(80);
    for (const p of todas) {
      expect(typeof p.id).toBe("string");
      expect(typeof p.clave).toBe("string");
      expect(typeof p.verificado).toBe("boolean");
      expect(p).toMatchObject({ activo: true, plazoLevantamiento: null });
      expect(Array.isArray(p.pasos)).toBe(true);
      expect(Array.isArray(p.docs)).toBe(true);
    }
    expect(new Set(todas.map((p) => p.id)).size).toBe(todas.length);
    expect(hitoPorClave(catalogoSemilla().obra, "1.1.1")).toMatchObject({ verificado: true, plazoDias: 8 });
  });

  it("la clave es el código del hito, de la sección recurrente o del eventual", () => {
    const cat = catalogoSemilla();
    expect(hitoPorClave(cat.obra, "1.1.1")).toMatchObject({
      nombre: "Perfeccionamiento de contrato", plazoDias: 8, plazoBase: "suscripcion", plazoHabiles: true,
      cumplimiento: "Contrato suscrito",
    });
    const valorizaciones = seccionPorCodigo(cat.obra, "1.3.2");
    expect(valorizaciones).toMatchObject({ recurrente: "mensual", diaLimite: 25, soloPrimerPeriodo: true });
    expect(valorizaciones.plantilla).toMatchObject({ clave: "1.3.2", nombre: "Valorización" });
    expect(seccionPorCodigo(cat.obra, "1.2.10")).toMatchObject({ recurrente: "anual", diaLimite: 15 });
    const ampliacion = cat.eventuales.obra.find((e) => e.clave === "ampliacion");
    expect(ampliacion).toMatchObject({ silencioPositivo: true, plazoDias: 10, plazoHabiles: true });
    expect(cat.opcionales.obra.find((o) => o.clave === "residente_obra")).toMatchObject({ etapaCodigo: "1.1", plazoDias: 5 });
  });

  it("cada llamada devuelve objetos nuevos", () => {
    const a = catalogoSemilla();
    const b = catalogoSemilla();
    hitoPorClave(a.obra, "1.1.1").docs.push("X");
    expect(hitoPorClave(b.obra, "1.1.1").docs).not.toContain("X");
  });
});

describe("crearTareas con el catálogo almacenado", () => {
  it("crearTareas con catalogoSemilla genera los mismos códigos que antes", () => {
    const sinEventuales = (lista) => lista.filter((t) => t.tipo !== "eventual").map(({ estado, etapaNombre, seccionNombre, etapaCodigo, seccionCodigo, ...resto }) => resto);
    const obra = ordenar(crearTareas(T001, catalogoSemilla(), FERIADOS_2026)).map(proyectar);
    const consul = ordenar(crearTareas(T002, catalogoSemilla(), FERIADOS_2026)).map(proyectar);
    expect(obra.map((t) => t.codigo)).toEqual(sinEventuales(golden.seed_t001).map((t) => t.codigo));
    expect(obra).toEqual(sinEventuales(golden.seed_t001));
    expect(consul).toEqual(sinEventuales(golden.seed_t002));
  });

  it("hito desactivado no se genera y los demás conservan su código", () => {
    const cat = catalogoSemilla();
    hitoPorClave(cat.obra, "1.1.3").activo = false;
    const codigos = crearTareas(T001, cat, FERIADOS_2026).map((t) => t.codigo);
    expect(codigos).not.toContain("1.1.3");
    expect(codigos).toContain("1.1.4");
    expect(codigos).toContain("1.1.5");
  });

  it("una sección recurrente con la plantilla desactivada no genera periodos", () => {
    const cat = catalogoSemilla();
    seccionPorCodigo(cat.obra, "1.3.3").plantilla.activo = false;
    const codigos = crearTareas(T001, cat, FERIADOS_2026).map((t) => t.codigo);
    expect(codigos.some((c) => c.startsWith("1.3.3."))).toBe(false);
    expect(codigos).toContain("1.3.2.1");
  });

  it("las valorizaciones y los informes mensuales nacen solo con el primer periodo, en obra y en consultoría", () => {
    const cat = catalogoSemilla();
    const obra = crearTareas(T001, cat, FERIADOS_2026).map((t) => t.codigo);
    expect(obra.filter((c) => c.startsWith("1.3.2."))).toEqual(["1.3.2.1"]);
    expect(obra.filter((c) => c.startsWith("1.3.3."))).toEqual(["1.3.3.1"]);
    const consultoria = crearTareas(T002, cat, FERIADOS_2026).map((t) => t.codigo);
    expect(consultoria.filter((c) => c.startsWith("2.3.2."))).toEqual(["2.3.2.1"]);
    expect(consultoria.filter((c) => c.startsWith("2.3.3."))).toEqual(["2.3.3.1"]);
  });

  it("usa los datos editados de la plantilla", () => {
    const cat = catalogoSemilla();
    Object.assign(hitoPorClave(cat.obra, "1.1.2"), { docs: ["Solo uno"], plazoDias: 3, nombre: "Garantía editada" });
    const t = crearTareas(T001, cat, FERIADOS_2026).find((x) => x.codigo === "1.1.2");
    expect(t).toMatchObject({ nombre: "Garantía editada", docsRequeridos: ["Solo uno"], plazoDias: 3, fecha_limite: "2026-05-28" });
  });

  it("un hito propio recibe el correlativo siguiente de su sección, aunque esté en medio", () => {
    const cat = catalogoSemilla();
    const seccion = seccionPorCodigo(cat.obra, "1.1");
    // Sin `codigo`: así llegan los hitos de catálogos guardados antes de ese campo.
    const propio = { ...hitoPorClave(cat.obra, "1.1.5"), id: "x", clave: "cat_abc", codigo: undefined, nombre: "Propio" };
    seccion.hitos.splice(1, 0, propio);
    const tareas = crearTareas(T001, cat, FERIADOS_2026);
    const codigos = tareas.map((t) => t.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
    expect(tareas.find((t) => t.clavePlantilla === "cat_abc")).toMatchObject({
      codigo: "1.1.6", seccionCodigo: "1.1", origen: "catalogo", plantilla: "cat_abc",
    });
  });
});

describe("eventuales y opcionales desde el catálogo", () => {
  it("crearTareaEventual toma la plantilla del catálogo", () => {
    const cat = catalogoSemilla();
    cat.eventuales.obra.find((e) => e.clave === "ampliacion").docs = ["Solicitud", "Resolución"];
    const t = crearTareaEventual(T001, "ampliacion", [], cat, FERIADOS_2026);
    expect(t).toMatchObject({
      codigo: "1.4.1", tipo: "eventual", clave: "ampliacion", docsRequeridos: ["Solicitud", "Resolución"],
      silencioPositivo: true, diasSilencio: 10, plazoBase: "manual",
    });
    expect(crearTareaEventual(T002, "no-existe", [], cat, FERIADOS_2026)).toBeNull();
  });

  it("listarEventuales y listarHitosOpcionales omiten los desactivados", () => {
    const cat = catalogoSemilla();
    cat.eventuales.consultoria.find((e) => e.clave === "adicional").activo = false;
    cat.opcionales.obra.find((e) => e.clave === "seace_obra").activo = false;
    expect(listarEventuales("Consultoría de obra", cat).map((e) => e.clave)).not.toContain("adicional");
    expect(listarEventuales("Obra", cat).map((e) => e.clave)).toContain("adicional");
    expect(listarHitosOpcionales("Obra", cat).map((e) => e.clave)).toEqual(["conformidad_expediente", "residente_obra"]);
    expect(crearTareaEventual(T002, "adicional", [], cat, FERIADOS_2026)).toBeNull();
  });
});

describe("orden y lugar de los hitos en el catálogo", () => {
  it("ordenarGrupos recoloca los grupos con orden entre sus lugares y deja los demás donde los pone el código", () => {
    const g = (codigo, orden) => ({ codigo, orden });
    const salida = ordenarGrupos([g("1.5", 3), g("1.4"), g("1.1", 1), g("1.3", 0), g("1.2", 2)]).map((x) => x.codigo);
    expect(salida).toEqual(["1.3", "1.1", "1.2", "1.4", "1.5"]);
  });

  it("los hitos nuevos recuerdan el lugar de su etapa y su sección en el catálogo, aunque el código no cambie", () => {
    const cat = catalogoSemilla();
    const etapas = cat.obra.etapas;
    [etapas[0], etapas[1]] = [etapas[1], etapas[0]];
    const tareas = crearTareas(T001, cat, FERIADOS_2026);
    const hito = (codigo) => tareas.find((t) => t.codigo === codigo);
    expect(hito("1.2.1")).toMatchObject({ etapaCodigo: "1.2", etapaOrden: 0, seccionOrden: 0 });
    expect(hito("1.1.1")).toMatchObject({ etapaCodigo: "1.1", etapaOrden: 1, seccionOrden: 0 });
    expect(hito("1.2.11.1")).toMatchObject({ etapaOrden: 0, seccionOrden: 2 });
  });

  it("moverHitoASeccion pasa un hito a otra sección y renumera las dos, pero no a una sección recurrente", () => {
    const cat = catalogoSemilla();
    const origen = seccionPorCodigo(cat.obra, "1.1");
    const destino = seccionPorCodigo(cat.obra, "1.2");
    const hito = origen.hitos[1];

    expect(moverHitoASeccion(cat, hito.id, destino.id)).toBe(true);
    expect(origen.hitos.map((h) => h.codigo)).toEqual(["1.1.1", "1.1.2", "1.1.3", "1.1.4"]);
    expect(destino.hitos).toHaveLength(9);
    expect(destino.hitos.at(-1)).toMatchObject({ id: hito.id, codigo: "1.2.9" });

    const recurrente = seccionPorCodigo(cat.obra, "1.3.2");
    expect(moverHitoASeccion(cat, origen.hitos[0].id, recurrente.id)).toBe(false);
    expect(origen.hitos).toHaveLength(4);
  });

  it("claseDeHito reparte los hitos del expediente en sus clases y un hito propio convertido toma la de su plantilla", () => {
    expect(claseDeHito({ tipo: "fijo" })).toBe("catalogo");
    expect(claseDeHito({ tipo: "recurrente" })).toBe("recurrente");
    expect(claseDeHito({ tipo: "eventual" })).toBe("eventual");
    expect(claseDeHito({ tipo: "opcional" })).toBe("opcional");
    expect(claseDeHito({ tipo: "propio", clavePlantilla: "" })).toBe("propio");
    expect(claseDeHito({ tipo: "propio", clavePlantilla: "cat_abc", origen: "catalogo" })).toBe("catalogo");
    expect(claseDeHito({ tipo: "propio", clavePlantilla: "eventual:revision" })).toBe("eventual");
    expect(claseDeHito({ tipo: "propio", clavePlantilla: "opcional:charla" })).toBe("opcional");
    expect(Object.keys(CLASES_HITO)).toEqual(["catalogo", "recurrente", "eventual", "opcional", "propio"]);
  });
});
