import { describe, expect, it } from "vitest";
import { tipoVisor, escalaDeRender, PIXELES_MAX_CANVAS } from "./visor.js";

describe("visor de archivos", () => {
  it("decide el visor por tipo MIME o, si no hay, por la extensión; Word y Excel no tienen vista previa", () => {
    expect(tipoVisor("application/pdf", "carta.pdf")).toBe("pdf");
    expect(tipoVisor("", "Informe FINAL.PDF")).toBe("pdf");
    expect(tipoVisor("application/octet-stream", "plano.pdf")).toBe("pdf");
    expect(tipoVisor("image/jpeg", "foto")).toBe("imagen");
    expect(tipoVisor("", "foto.JPG")).toBe("imagen");
    expect(tipoVisor("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "carta.docx")).toBe("otro");
    expect(tipoVisor("", "presupuesto.xlsx")).toBe("otro");
    expect(tipoVisor("image/heic", "foto.heic")).toBe("otro");
  });

  it("dibuja las páginas con la nitidez de la pantalla pero sin pasar del tope de píxeles", () => {
    const A4 = { ancho: 595, alto: 842 };
    expect(escalaDeRender({ k: 0.6, dpr: 3, ...A4 })).toBeCloseTo(1.2); // tope de 2× la escala CSS
    const alta = escalaDeRender({ k: 4, dpr: 3, ...A4 }); // zoom máximo: se limita para no agotar la memoria
    expect(A4.ancho * alta * A4.alto * alta).toBeLessThanOrEqual(PIXELES_MAX_CANVAS + 1);
  });
});
