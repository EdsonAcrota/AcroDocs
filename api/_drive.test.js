// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { carpetaDestino, iniciarSubida, enviarTrozo, limpiarNombre, olvidarAcceso, ErrorDrive } from "./_drive.js";

// Un Google mínimo: token, carpetas con `appProperties.ruta`, ids reservados y sesión de subida.
const crearGoogle = () => {
  const carpetas = []; // { id, name, parents, appProperties }
  const peticiones = [];
  const json = (o, init = {}) => new Response(JSON.stringify(o), { status: 200, ...init });
  const fetchFalso = vi.fn(async (url, init = {}) => {
    const u = new URL(String(url));
    const cuerpo = init.body && typeof init.body === "string" ? init.body : "";
    peticiones.push({ metodo: init.method || "GET", ruta: u.pathname, query: u.searchParams, headers: init.headers || {}, cuerpo });
    if (u.hostname === "oauth2.googleapis.com") return json({ access_token: "acceso", expires_in: 3600 });
    if (u.pathname === "/drive/v3/files/generateIds") return json({ ids: ["id-reservado"] });
    if (u.pathname === "/upload/drive/v3/files") {
      return new Response("", { status: 200, headers: { Location: "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=abc" } });
    }
    if (u.pathname === "/drive/v3/files" && (init.method || "GET") === "GET") {
      const ruta = /value='([^']*)'/.exec(u.searchParams.get("q"))[1];
      return json({ files: carpetas.filter((c) => c.appProperties.ruta === ruta) });
    }
    if (u.pathname === "/drive/v3/files" && init.method === "POST") {
      const c = JSON.parse(cuerpo);
      const creada = { id: `carpeta-${carpetas.length + 1}`, name: c.name, parents: c.parents, appProperties: c.appProperties };
      carpetas.push(creada);
      return json({ id: creada.id });
    }
    if (init.method === "PATCH") {
      carpetas.find((c) => u.pathname.endsWith(c.id)).name = JSON.parse(cuerpo).name;
      return json({});
    }
    throw new Error(`ruta no prevista: ${init.method} ${u.pathname}`);
  });
  return { carpetas, peticiones, fetchFalso };
};

let google;
beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = "cliente";
  process.env.GOOGLE_CLIENT_SECRET = "secreto";
  process.env.GOOGLE_REFRESH_TOKEN = "refresco";
  olvidarAcceso();
  google = crearGoogle();
  vi.stubGlobal("fetch", google.fetchFalso);
});
afterEach(() => vi.unstubAllGlobals());

describe("Drive del servidor", () => {
  it("crea AcroDocs/{contrato}/{etapa}/{hito}, reutiliza lo existente y renombra si cambió el nombre", async () => {
    const destino = { contrato: { id: "t1", nombre: "OC-001 - Colegio" }, etapa: { codigo: "1.3", nombre: "EJECUCIÓN DE OBRA" }, hito: { id: "h1", nombre: "1.3.2.1 VALORIZACIÓN 01" } };
    const carpeta = await carpetaDestino(destino);

    expect(google.carpetas.map((c) => c.name)).toEqual(["AcroDocs", "OC-001 - Colegio", "1.3 EJECUCIÓN DE OBRA", "1.3.2.1 VALORIZACIÓN 01"]);
    expect(google.carpetas.map((c) => c.parents?.[0])).toEqual([undefined, "carpeta-1", "carpeta-2", "carpeta-3"]);
    expect(google.carpetas.map((c) => c.appProperties.ruta)).toEqual(["raiz", "c:t1", "e:t1:1.3", "h:h1"]);
    expect(carpeta).toBe("carpeta-4");

    // Segunda vez: no crea nada; con el contrato renombrado, solo cambia el nombre de su carpeta.
    expect(await carpetaDestino({ ...destino, contrato: { id: "t1", nombre: "OC-001 - Colegio nuevo" } })).toBe("carpeta-4");
    expect(google.carpetas).toHaveLength(4);
    expect(google.carpetas[1].name).toBe("OC-001 - Colegio nuevo");

    // Sin hito, el archivo va a «General» del contrato.
    await carpetaDestino({ contrato: destino.contrato, etapa: null, hito: null });
    expect(google.carpetas[4]).toMatchObject({ name: "General", appProperties: { ruta: "g:t1" } });
  });

  it("crea la sesión de subida con el id reservado, las propiedades del servidor y el origen de la página", async () => {
    const r = await iniciarSubida({
      nombre: "plano.pdf", mime: "application/pdf", tamano: 1234, carpeta: "carpeta-9",
      propiedades: { tramite: "t1", usuario: "u1" }, origen: "https://acrodocs.vercel.app",
    });
    expect(r).toEqual({ archivoId: "id-reservado", sesion: "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=abc" });

    const sesion = google.peticiones.find((p) => p.ruta === "/upload/drive/v3/files");
    expect(sesion.metodo).toBe("POST");
    expect(sesion.query.get("uploadType")).toBe("resumable");
    expect(sesion.headers).toMatchObject({
      Authorization: "Bearer acceso", Origin: "https://acrodocs.vercel.app", "X-Upload-Content-Length": "1234", "X-Upload-Content-Type": "application/pdf",
    });
    expect(JSON.parse(sesion.cuerpo)).toEqual({
      id: "id-reservado", name: "plano.pdf", parents: ["carpeta-9"], appProperties: { acrodocs: "1", tramite: "t1", usuario: "u1" },
    });
  });

  it("solo reenvía trozos a sesiones de subida de Google", async () => {
    await expect(enviarTrozo({ sesion: "https://malo.example.com/x?upload_id=1", desde: 0, total: 3, cuerpo: Buffer.from("abc") }))
      .rejects.toBeInstanceOf(ErrorDrive);
    await expect(enviarTrozo({ sesion: "http://localhost:3000/?upload_id=1", desde: 0, total: 3, cuerpo: Buffer.from("abc") }))
      .rejects.toMatchObject({ estado: 400 });
  });

  it("limpia los nombres de carpeta", () => {
    expect(limpiarNombre('1.3/2 "Informe": <final>')).toBe("1.3 2 Informe final");
    expect(limpiarNombre("   ")).toBe("Sin nombre");
    expect(limpiarNombre("x".repeat(300))).toHaveLength(100);
  });
});
