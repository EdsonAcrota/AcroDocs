import { describe, it, expect } from "vitest";
import { aFilas, deFilas, diferencias, estable, llaveDe } from "./nube.js";

const mapa = (tabla, filas) => new Map(filas.map((f) => [llaveDe(tabla, f), estable(f)]));

describe("nube: diferencias por id", () => {
  const previas = [
    { id: "a", tramite_id: "t1", data: { id: "a", nombre: "A", estado: "Pendiente" } },
    { id: "b", tramite_id: "t1", data: { id: "b", nombre: "B" } },
  ];

  it("detecta altas, cambios y bajas, y no envía lo que no cambió", () => {
    const anterior = mapa("items", previas);
    const actuales = [
      { id: "a", tramite_id: "t1", data: { id: "a", nombre: "A", estado: "Completado" } }, // cambió
      { id: "c", tramite_id: "t1", data: { id: "c", nombre: "C" } }, // nuevo; "b" desapareció
    ];
    const { nuevos, cambiados, borrados } = diferencias("items", anterior, actuales);
    expect(nuevos.map((f) => f.id)).toEqual(["c"]);
    expect(cambiados.map((f) => f.id)).toEqual(["a"]);
    expect(borrados).toEqual(["b"]);
  });

  it("el orden de las claves no cuenta como cambio (jsonb las reordena)", () => {
    const anterior = mapa("items", previas);
    const igual = [
      { id: "a", tramite_id: "t1", data: { estado: "Pendiente", nombre: "A", id: "a" } },
      { data: { nombre: "B", id: "b" }, tramite_id: "t1", id: "b" },
    ];
    expect(diferencias("items", anterior, igual)).toEqual({ nuevos: [], cambiados: [], borrados: [] });
  });
});

describe("nube: aFilas y deFilas conservan la forma de los datos", () => {
  it("ida y vuelta del estado de la app", () => {
    const data = {
      tramites: [{ id: "t1", codigo: "C-1" }],
      items: [{ id: "i1", tramite_id: "t1", nombre: "Hito" }],
      movimientos: [{ id: "m1", tramiteId: "t1", itemId: "i1" }],
      procedimientos: [],
      cargos: [{ id: "c1", tramiteId: null, asunto: "Sin contrato" }],
      historial: [{ id: "h1", fecha: "2026-11-01T10:00:00Z" }, { id: "h2", fecha: "2026-11-02T10:00:00Z", tramiteId: "t1" }],
      configFianzas: { t1: { periodo: "anual" } },
      permisosRoles: { residente: ["estado"] },
      catalogo: { obra: [] },
      feriados: ["2026-12-25"],
      empresa: { razonSocial: "Acro" },
      usuarios: [{ id: "u1", nombre: "Ana", email: "ana@x.pe", rol: "jefe", activo: true, soloAsignados: false, contratos: ["t1"] }],
    };
    const filas = aFilas(data);
    expect(filas.items[0]).toEqual({ id: "i1", tramite_id: "t1", data: data.items[0] });
    expect(filas.movimientos[0].tramite_id).toBe("t1");
    expect(filas.cargos[0].tramite_id).toBeNull();
    expect(filas.usuario_contratos).toEqual([{ usuario_id: "u1", tramite_id: "t1" }]);

    // Lo que devuelve el servidor trae además el correo y el sello de cambio de clave.
    const servidor = {
      ...filas,
      perfiles: [{ id: "u1", nombre: "Ana", email: "ana@x.pe", rol: "jefe", activo: true, solo_asignados: false, cambiar_clave: false }],
    };
    const vuelta = deFilas(servidor, "u1");
    expect(vuelta.items).toEqual(data.items);
    expect(vuelta.configFianzas).toEqual(data.configFianzas);
    expect(vuelta.catalogo).toEqual(data.catalogo);
    expect(vuelta.feriados).toEqual(data.feriados);
    expect(vuelta.usuarios[0]).toMatchObject({ id: "u1", email: "ana@x.pe", contratos: ["t1"], soloAsignados: false });
    expect(vuelta.historial.map((h) => h.id)).toEqual(["h1", "h2"]);
    expect(vuelta.session).toEqual({ usuarioId: "u1" });
  });

  it("sin filas de config, el catálogo queda sin definir para que la app ponga el inicial", () => {
    const vuelta = deFilas({}, "u1");
    expect(vuelta.catalogo).toBeUndefined();
    expect(vuelta.tramites).toEqual([]);
  });
});
