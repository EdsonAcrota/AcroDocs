// Alta de usuarios y restablecimiento de contraseña. Es la única pieza que usa la clave de
// servicio de Supabase (SUPABASE_SERVICE_ROLE_KEY), que vive solo en las variables del servidor.
// Quien llama debe traer su sesión (Authorization: Bearer <jwt>) y tener el permiso `usuarios`.
import { randomInt } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { ROLES } from "../src/lib/permisos.js";

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const llaveServicio = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = url && llaveServicio
  ? createClient(url, llaveServicio, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CLAVE_MINIMA = 8;
// Sin caracteres que se confunden al dictarlos (0/O, 1/l/I).
const ALFABETO = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const generarClave = () => Array.from({ length: 12 }, () => ALFABETO[randomInt(ALFABETO.length)]).join("");

// Devuelve { perfil } si quien llama puede administrar usuarios, o { estado, error }.
const autorizar = async (req) => {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return { estado: 401, error: "Falta iniciar sesión." };
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return { estado: 401, error: "La sesión no es válida. Vuelve a ingresar." };
  const { data: perfil } = await admin.from("perfiles").select("id, rol, activo").eq("id", data.user.id).maybeSingle();
  if (!perfil?.activo) return { estado: 403, error: "Tu usuario está desactivado." };
  if (perfil.rol !== "gerente") {
    const { data: fila } = await admin.from("permisos_roles").select("permisos").eq("rol", perfil.rol).maybeSingle();
    if (!fila?.permisos?.includes("usuarios")) return { estado: 403, error: "No tienes permiso para gestionar usuarios." };
  }
  return { perfil };
};

const crear = async (cuerpo, quien) => {
  const nombre = String(cuerpo.nombre ?? "").trim();
  const email = String(cuerpo.email ?? "").trim().toLowerCase();
  if (!nombre) return { estado: 400, error: "El nombre es obligatorio." };
  if (!CORREO_VALIDO.test(email)) return { estado: 400, error: "Escribe un correo válido." };
  if (!ROLES.some((r) => r.clave === cuerpo.rol)) return { estado: 400, error: "Elige un rol válido." };
  if (cuerpo.rol === "gerente" && quien.rol !== "gerente") {
    return { estado: 403, error: "Solo el gerente general puede crear a otro gerente." };
  }
  const propia = String(cuerpo.password ?? "");
  if (propia && propia.length < CLAVE_MINIMA) return { estado: 400, error: `La contraseña debe tener al menos ${CLAVE_MINIMA} caracteres.` };
  const password = propia || generarClave();

  // Solo se asignan contratos que existen.
  const pedidos = Array.isArray(cuerpo.contratos) ? [...new Set(cuerpo.contratos.map(String))] : [];
  let contratos = [];
  if (pedidos.length) {
    const { data } = await admin.from("tramites").select("id").in("id", pedidos);
    contratos = (data || []).map((t) => t.id);
  }

  const { data: creado, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !creado?.user) {
    const repetido = /already|registered|exists/i.test(error?.message || "");
    return { estado: repetido ? 409 : 400, error: repetido ? "Ya existe un usuario con ese correo." : (error?.message || "No se pudo crear el usuario.") };
  }
  const id = creado.user.id;
  const { error: errorPerfil } = await admin.from("perfiles").insert({
    id, nombre, email, rol: cuerpo.rol, activo: true, solo_asignados: Boolean(cuerpo.soloAsignados), cambiar_clave: true,
  });
  if (errorPerfil) {
    await admin.auth.admin.deleteUser(id);
    return { estado: 500, error: "No se pudo guardar el perfil del usuario." };
  }
  if (contratos.length) {
    const { error: errorContratos } = await admin.from("usuario_contratos").insert(contratos.map((tramite_id) => ({ usuario_id: id, tramite_id })));
    if (errorContratos) return { estado: 500, error: "El usuario se creó, pero no se pudieron asignar sus contratos. Asígnalos desde Usuarios." };
  }
  return { estado: 200, cuerpo: { id, ...(propia ? {} : { password }) } };
};

const restablecer = async (cuerpo, quien) => {
  const id = String(cuerpo.id ?? "");
  const { data: objetivo } = await admin.from("perfiles").select("id, rol").eq("id", id).maybeSingle();
  if (!objetivo) return { estado: 404, error: "El usuario no existe." };
  if (objetivo.rol === "gerente" && quien.rol !== "gerente") {
    return { estado: 403, error: "Solo el gerente general puede cambiar la contraseña de otro gerente." };
  }
  const propia = String(cuerpo.password ?? "");
  if (propia && propia.length < CLAVE_MINIMA) return { estado: 400, error: `La contraseña debe tener al menos ${CLAVE_MINIMA} caracteres.` };
  const password = propia || generarClave();
  const { error } = await admin.auth.admin.updateUserById(id, { password });
  if (error) return { estado: 400, error: error.message || "No se pudo cambiar la contraseña." };
  await admin.from("perfiles").update({ cambiar_clave: true }).eq("id", id);
  return { estado: 200, cuerpo: propia ? { ok: true } : { ok: true, password } };
};

export default async function handler(req, res) {
  if (!admin) return res.status(503).json({ error: "Supabase no está configurado en el servidor." });
  if (req.method !== "POST" && req.method !== "PATCH") {
    res.setHeader("Allow", "POST, PATCH");
    return res.status(405).json({ error: "Método no permitido" });
  }
  const acceso = await autorizar(req);
  if (acceso.error) return res.status(acceso.estado).json({ error: acceso.error });

  const cuerpo = req.body && typeof req.body === "object" ? req.body : {};
  const resultado = req.method === "POST" ? await crear(cuerpo, acceso.perfil) : await restablecer(cuerpo, acceso.perfil);
  if (resultado.error) return res.status(resultado.estado).json({ error: resultado.error });
  return res.status(resultado.estado).json(resultado.cuerpo);
}
