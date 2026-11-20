// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// Supabase falso: cada consulta de perfil devuelve lo que diga `respuestaPerfil`.
let respuestaPerfil;
const getUser = vi.fn();
const perfilesEq = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { getUser },
    from: () => ({ select: () => ({ eq: (...args) => ({ maybeSingle: async () => { perfilesEq(...args); return respuestaPerfil; } }) }) }),
  }),
}));

const { autenticarReal } = await import("./archivos.js");

const jwt = (carga) => `${Buffer.from("{}").toString("base64url")}.${Buffer.from(JSON.stringify(carga)).toString("base64url")}.firma`;
const pedido = (token) => ({ headers: { authorization: `Bearer ${token}` } });
const valido = () => jwt({ sub: "usuario-1", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 });

beforeEach(() => {
  process.env.SUPABASE_URL = "https://proyecto.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_x";
  getUser.mockReset();
  perfilesEq.mockReset();
  respuestaPerfil = { data: { id: "usuario-1", activo: true }, error: null, status: 200 };
});

describe("ingreso de /api/archivos", () => {
  it("acepta un token vigente aunque la sesión se haya cerrado en otro dispositivo", async () => {
    // Antes se usaba auth.getUser, que responde «Auth session missing» cuando la sesión ya no existe.
    getUser.mockResolvedValue({ data: { user: null }, error: { status: 400, message: "Auth session missing!" } });
    const acceso = await autenticarReal(pedido(valido()));

    expect(acceso.usuario).toEqual({ id: "usuario-1" });
    expect(perfilesEq).toHaveBeenCalledWith("id", "usuario-1");
    expect(getUser).not.toHaveBeenCalled();
  });

  it("rechaza lo que no es un token de usuario o que ya venció, sin consultar la base", async () => {
    const vencido = jwt({ sub: "usuario-1", role: "authenticated", exp: Math.floor(Date.now() / 1000) - 60 });
    const anonimo = jwt({ role: "anon" });
    for (const token of ["", "no-es-un-token", vencido, anonimo]) {
      const acceso = await autenticarReal(pedido(token));
      expect(acceso.estado).toBe(401);
    }
    expect(perfilesEq).not.toHaveBeenCalled();
  });

  it("rechaza el token que la base no acepta y al usuario desactivado", async () => {
    respuestaPerfil = { data: null, error: { code: "PGRST301", message: "JWT expired" }, status: 401 };
    expect((await autenticarReal(pedido(valido()))).estado).toBe(401);

    respuestaPerfil = { data: { id: "usuario-1", activo: false }, error: null, status: 200 };
    expect((await autenticarReal(pedido(valido()))).estado).toBe(403);
  });
});
