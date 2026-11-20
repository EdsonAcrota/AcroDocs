// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { randomBytes } from "node:crypto";

vi.mock("./supabase.js", () => ({
  MODO_NUBE: true,
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "jwt" } } }) } },
}));

import { crearManejador } from "../../api/archivos.js";
import { subirADrive, descargarDeDrive, eliminarDeDrive, TROZO_SERVIDOR } from "./drive.js";
import { crearDriveFalso, autenticarFalso, fetchFalso } from "./__fixtures__/driveFalso.js";

const MB = 1024 * 1024;
const meta = { tramiteId: "t1", tareaId: "h1", tipoDoc: "Otros", nombre: "plano.pdf", permiso: "subir" };
const hito = { id: "h1", nombre: "1.3.2.1 VALORIZACIÓN 01", etapa: { codigo: "1.3", nombre: "EJECUCIÓN DE OBRA" } };

let drive;
let respuestas;
let llamadas;
const preparar = ({ directo, usuario } = {}) => {
  drive = crearDriveFalso();
  respuestas = [];
  const autenticar = autenticarFalso({ permisos: ["subir", "descargar", "registrar"], contratos: ["t1"], hitos: { h1: hito }, ...usuario });
  llamadas = vi.fn(fetchFalso({
    manejador: crearManejador({ autenticar, drive }),
    directo: directo || ((sesion, cuerpo) => { drive.pendientes.get(sesion).bytes = cuerpo; drive.completar(sesion); }),
    alResponder: (res) => respuestas.push(res),
  }));
  vi.stubGlobal("fetch", llamadas);
};
const llamadasA = (accion) => llamadas.mock.calls.filter(([url]) => String(url).includes(`accion=${accion}`)).length;
// Archivo del contrato «t1» ya guardado en el Drive falso.
const archivoDeT1 = (id) => ({
  id, nombre: "a.pdf", mime: "application/pdf", tamano: 3, propiedades: { acrodocs: "1", tramite: "t1", usuario: "u1" }, bytes: Buffer.from("abc"),
});

beforeEach(() => preparar());
afterEach(() => vi.unstubAllGlobals());

describe("archivos en Drive", () => {
  it("sube directo a Google y deja el archivo en la carpeta del hito", async () => {
    const contenido = randomBytes(300 * 1024);
    const resultado = await subirADrive(new File([contenido], "plano.pdf", { type: "application/pdf" }), meta);

    expect(resultado).toMatchObject({ nombre: "plano.pdf", mime: "application/pdf", tamano: contenido.length, tipoDoc: "Otros" });
    expect(resultado.archivoId).toBe(resultado.id);
    expect(drive.archivos.get(resultado.archivoId).bytes.equals(contenido)).toBe(true);
    expect(drive.carpetas[0]).toMatchObject({ contrato: { id: "t1" }, etapa: { codigo: "1.3" }, hito: { id: "h1" } });
  });

  it("si el navegador no puede subir directo (CORS o red), lo sube por trozos a través del servidor", async () => {
    preparar({ directo: () => { throw new TypeError("Failed to fetch"); } });
    const contenido = randomBytes(7 * MB); // 3 trozos de ≤ 3 MiB
    const resultado = await subirADrive(new File([contenido], "informe.pdf", { type: "application/pdf" }), meta);

    expect(drive.archivos.get(resultado.archivoId).bytes.equals(contenido)).toBe(true);
    expect(llamadasA("trozo")).toBe(Math.ceil((7 * MB) / TROZO_SERVIDOR));
  });

  it("descarga un archivo de 30 MB por trozos y llega idéntico, sin pasar el límite de 4,5 MB por respuesta", async () => {
    const contenido = randomBytes(30 * MB);
    const { archivoId } = await subirADrive(new File([contenido], "grande.zip", { type: "application/zip" }), { ...meta, nombre: "grande.zip" });
    respuestas.length = 0;

    const { blob, nombre } = await descargarDeDrive(archivoId);

    expect(nombre).toBe("grande.zip");
    expect(blob.size).toBe(contenido.length);
    expect(Buffer.from(await blob.arrayBuffer()).equals(contenido)).toBe(true);
    expect(respuestas.length).toBe(8); // 30 MB / 4 MiB
    expect(Math.max(...respuestas.map((r) => r.cuerpo.length))).toBeLessThanOrEqual(4.5 * 1000 * 1000);
  });

  it("rechaza al usuario que no ve el contrato del archivo o que no tiene el permiso", async () => {
    // Otro usuario con todos los permisos, pero sin el contrato «t1».
    preparar({ usuario: { id: "u2", contratos: ["otro"] } });
    drive.archivos.set("f1", archivoDeT1("f1"));
    await expect(descargarDeDrive("f1")).rejects.toMatchObject({ estado: 403 });
    await expect(eliminarDeDrive("f1")).rejects.toMatchObject({ estado: 403 });
    await expect(subirADrive(new File([randomBytes(10)], "b.pdf"), meta)).rejects.toMatchObject({ estado: 403 });
    expect(drive.archivos.has("f1")).toBe(true);

    // Ve el contrato, pero su rol no puede descargar.
    preparar({ usuario: { permisos: ["subir"] } });
    drive.archivos.set("f1", archivoDeT1("f1"));
    await expect(descargarDeDrive("f1")).rejects.toMatchObject({ estado: 403 });

    // Puede descargar, pero no subir.
    preparar({ usuario: { permisos: ["descargar"] } });
    await expect(subirADrive(new File([randomBytes(10)], "c.pdf"), meta)).rejects.toMatchObject({ estado: 403 });
  });

  it("manda a la papelera al eliminar y no falla si el archivo ya no estaba", async () => {
    const { archivoId } = await subirADrive(new File([randomBytes(1000)], "a.pdf", { type: "application/pdf" }), meta);
    await eliminarDeDrive(archivoId);
    expect(drive.archivos.has(archivoId)).toBe(false);
    await expect(eliminarDeDrive(archivoId)).resolves.toBeUndefined();
    await expect(descargarDeDrive(archivoId)).rejects.toMatchObject({ estado: 404 });
  });
});
