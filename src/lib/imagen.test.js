import { describe, it, expect } from "vitest";
import { escalarA, reducirFoto } from "./imagen.js";

describe("fotos del celular", () => {
  it("deja el lado mayor en 1600 px y conserva la proporción", () => {
    expect(escalarA(4000, 3000)).toEqual({ ancho: 1600, alto: 1200 });
    expect(escalarA(3000, 4000)).toEqual({ ancho: 1200, alto: 1600 });
    expect(escalarA(1200, 800)).toEqual({ ancho: 1200, alto: 800 }); // ya es chica: no se toca
  });

  it("nunca impide subir: sin soporte del navegador (o si no es foto) devuelve el mismo archivo", async () => {
    const foto = new File(["x"], "foto.jpg", { type: "image/jpeg" });
    const pdf = new File(["x"], "doc.pdf", { type: "application/pdf" });
    expect(await reducirFoto(foto)).toBe(foto); // jsdom no puede decodificar imágenes
    expect(await reducirFoto(pdf)).toBe(pdf);
  });
});
