import { describe, it, expect } from "vitest";
import { calcularFlujo, instanciarPasos } from "./flujo.js";
import { PASOS_SEMILLA } from "./pasosSemilla.js";

const OPC = { feriados: [], hoy: "2026-11-17" };
const ampliacion = (cambios = {}) => {
  // Plazos de la supervisión (5) y de la entidad (10), definidos para probar el encadenamiento.
  const pasos = instanciarPasos(PASOS_SEMILLA.ampliacion, "").map((p) => {
    if (p.clave === "informe_supervision") return { ...p, plazoDias: 5 };
    if (p.clave === "pronunciamiento_entidad") return { ...p, plazoDias: 10 };
    return p;
  });
  return { pasos, plazoLevantamiento: { dias: 5, habiles: true }, ...cambios };
};
const mov = (pasoClave, fecha, tipo = "presentado", extra = {}) => ({ id: `${pasoClave}-${fecha}-${tipo}`, itemId: "i", pasoClave, tipo, fecha, ...extra });
const paso = (flujo, clave) => flujo.pasos.find((p) => p.clave === clave);

describe("calcularFlujo", () => {
  it("sin movimientos el primer paso es el actual: Pendiente, a cargo del contratista, sin plazo definido", () => {
    const f = calcularFlujo(ampliacion(), [], OPC);
    expect(f.actual).toBe(0);
    expect(f.estado).toBe("Pendiente");
    expect(f.aCargo).toBe("contratista");
    expect(f.fechaLimite).toBe("");
  });

  it("el fin de causal el 2026-11-10 fija la solicitud el 2026-11-24 (10 días hábiles)", () => {
    const f = calcularFlujo(ampliacion(), [mov("inicio_causal", "2026-11-03", "asiento"), mov("fin_causal", "2026-11-10", "asiento")], OPC);
    expect(f.actual).toBe(2);
    expect(f.fechaLimite).toBe("2026-11-24");
    expect(f.estado).toBe("Pendiente");
  });

  it("si la supervisión no actúa, el plazo de la entidad corre desde el vencimiento del de la supervisión", () => {
    const movs = [mov("inicio_causal", "2026-11-03", "asiento"), mov("fin_causal", "2026-11-10", "asiento"), mov("solicitud", "2026-11-24")];
    const f = calcularFlujo(ampliacion(), movs, OPC);
    expect(paso(f, "informe_supervision").fechaLimite).toBe("2026-12-01");
    expect(paso(f, "pronunciamiento_entidad").inicio).toBe("2026-12-01");
    expect(f.estado).toBe("En revisión");
    expect(f.aCargo).toBe("supervision");
  });

  it("silencio: vence el pronunciamiento de la entidad sin respuesta; con plazo 0 no hay vencimiento", () => {
    const movs = [mov("fin_causal", "2026-09-01", "asiento"), mov("solicitud", "2026-09-10"), mov("informe_supervision", "2026-09-15", "conformidad")];
    const vencido = calcularFlujo(ampliacion(), movs, OPC);
    expect(vencido.actual).toBe(4);
    expect(paso(vencido, "pronunciamiento_entidad").fechaLimite).toBe("2026-09-29");
    expect(vencido.silencioVencido).toBe(true);

    const sinPlazo = calcularFlujo({ pasos: instanciarPasos(PASOS_SEMILLA.ampliacion, "") }, movs, OPC);
    expect(sinPlazo.fechaLimite).toBe("");
    expect(sinPlazo.silencioVencido).toBe(false);
  });

  it("un registro fuera de orden deja los pasos saltados sin respuesta; todo cumplido es Completado", () => {
    const f = calcularFlujo(ampliacion(), [mov("pronunciamiento_entidad", "2026-11-20", "pronunciamiento")], OPC);
    expect(f.pasos.map((p) => p.estado)).toEqual(["sin_respuesta", "sin_respuesta", "sin_respuesta", "sin_respuesta", "cumplido"]);
    expect(f.actual).toBe(-1);
    expect(f.estado).toBe("Completado");
  });

  it("observado y levantado devuelven el trámite al paso que observó, con ciclo 1", () => {
    const base = [mov("fin_causal", "2026-11-10", "asiento"), mov("solicitud", "2026-11-24")];
    const observado = calcularFlujo(ampliacion(), [...base, mov("informe_supervision", "2026-11-26", "observado")], OPC);
    expect(observado.estado).toBe("Observado");
    expect(observado.aCargo).toBe("contratista");
    expect(observado.ciclo).toBe(1);
    expect(observado.fechaLimite).toBe("2026-12-03");

    const levantado = calcularFlujo(ampliacion(), [...base, mov("informe_supervision", "2026-11-26", "observado"), mov("informe_supervision", "2026-11-30", "levantado")], OPC);
    expect(levantado.observado).toBe(false);
    expect(levantado.actual).toBe(3);
    expect(levantado.aCargo).toBe("supervision");
    expect(levantado.fechaLimite).toBe("2026-12-07");
    expect(levantado.ciclo).toBe(1);
  });

  it("anular el movimiento que cerró un paso lo reabre", () => {
    const movs = [mov("fin_causal", "2026-11-10", "asiento"), mov("solicitud", "2026-11-24")];
    expect(calcularFlujo(ampliacion(), movs, OPC).actual).toBe(3);
    const f = calcularFlujo(ampliacion(), movs.map((m) => (m.pasoClave === "solicitud" ? { ...m, anulado: true } : m)), OPC);
    expect(f.actual).toBe(2);
    expect(f.estado).toBe("Pendiente");
  });
});
