import { describe, it, expect } from "vitest";
import { cargosVisibles, cargosACsv } from "./cargos.js";
import { MATRIZ_INICIAL } from "./permisos.js";

const cargo = (id, extra) => ({ id, fecha: "2026-11-17", entidad: "Municipalidad", numeroRegistro: id, asunto: "x", ...extra });

describe("cargos", () => {
  it("un residente ve los cargos de sus contratos y los que registró él, y nadie más", () => {
    const residente = { id: "u-res", rol: "residente", contratos: ["t-001"] };
    const cargos = [
      cargo("a", { tramiteId: "t-001", registradoPor: "otro" }),
      cargo("b", { tramiteId: null, registradoPor: "u-res" }),
      cargo("c", { tramiteId: "t-002", registradoPor: "otro" }),
      cargo("d", { tramiteId: null, registradoPor: "otro" }),
    ];
    expect(cargosVisibles(cargos, residente, MATRIZ_INICIAL).map((c) => c.id)).toEqual(["a", "b"]);
    expect(cargosVisibles(cargos, { id: "u-adm", rol: "asis_adm" }, MATRIZ_INICIAL)).toHaveLength(4);
    expect(cargosVisibles(cargos, null, MATRIZ_INICIAL)).toEqual([]);
  });

  it("el CSV empieza con BOM, usa punto y coma y escapa los textos con punto y coma, comillas y saltos de línea", () => {
    const csv = cargosACsv([cargo("a", { asunto: 'Carta; "urgente"\nsegunda línea', tramiteId: "t-001" })], { "t-001": { codigo: "OC-1" } });
    expect(csv.startsWith("﻿Fecha;Hora;Entidad")).toBe(true);
    expect(csv).toContain('"Carta; ""urgente""\nsegunda línea"');
    expect(csv).toContain(";OC-1;");
  });
});
