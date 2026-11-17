import { describe, it, expect } from "vitest";
import { hoy, sumarDias, esHabil, sumarHabiles, diasEntre, FERIADOS_2026 } from "./fechas.js";

describe("fechas", () => {
  it("sumarHabiles salta sábado, domingo y feriado", () => {
    // Viernes 24 + 2 hábiles: salta sáb 25 y dom 26, cuenta lun 27,
    // salta el feriado mar 28 y cae el mié 29.
    expect(sumarHabiles("2026-07-24", 2, ["2026-07-28"])).toBe("2026-07-29");
  });

  it("sumarHabiles con 0 devuelve la misma fecha", () => {
    expect(sumarHabiles("2026-11-17", 0, [])).toBe("2026-11-17");
  });

  it("sumarHabiles admite días negativos", () => {
    // Lunes 27 - 1 hábil salta dom 26 y sáb 25, cae el vie 24.
    expect(sumarHabiles("2026-07-27", -1, [])).toBe("2026-07-24");
  });

  it("diasEntre", () => {
    expect(diasEntre("2026-11-17", "2026-11-20")).toBe(3);
    expect(diasEntre("2026-11-20", "2026-11-17")).toBe(-3);
  });

  it("esHabil", () => {
    expect(esHabil("2026-11-21", [])).toBe(false); // sábado
    expect(esHabil("2026-11-17", [])).toBe(true); // martes
    expect(esHabil("2026-11-17", ["2026-11-17"])).toBe(false); // feriado
  });

  it("sumarDias suma días calendario", () => {
    expect(sumarDias("2026-11-17", 3)).toBe("2026-11-20");
    expect(sumarDias("2026-11-17", -3)).toBe("2026-11-14");
  });

  it("hoy devuelve una fecha ISO", () => {
    expect(hoy()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("FERIADOS_2026 es una lista de fechas ISO", () => {
    expect(FERIADOS_2026.length).toBeGreaterThan(0);
    for (const f of FERIADOS_2026) expect(f).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
