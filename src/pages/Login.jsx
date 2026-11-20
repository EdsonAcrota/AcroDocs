import React, { useState } from "react";
import { loginDemo, entrarNube, abandonarNube, getSession } from "../lib/store.js";
import { ROLES } from "../lib/permisos.js";
import { USUARIOS_DEMO } from "../lib/migracion.js";
import { MODO_NUBE } from "../lib/supabase.js";
import { ingresar } from "../lib/nube.js";

const nombreRol = (clave) => ROLES.find((r) => r.clave === clave)?.nombre || clave;

export default function Login({ onLogin, aviso = "" }) {
  // En modo nube se entra con un usuario real: sin datos ni lista de demostración.
  const [email, setEmail] = useState(MODO_NUBE ? "" : "gerente@acrodocs.local");
  const [password, setPassword] = useState(MODO_NUBE ? "" : "gerente123");
  const [error, setError] = useState(aviso);
  const [cargando, setCargando] = useState(false);

  const entrar = async (e) => {
    e.preventDefault();
    setError("");
    if (!MODO_NUBE) {
      const res = loginDemo(email, password);
      if (res.error) setError(res.error);
      else onLogin(res.session);
      return;
    }
    setCargando(true);
    try {
      const res = await ingresar(email, password);
      if (res.error) {
        setError(res.error);
        return;
      }
      await entrarNube();
      onLogin(getSession());
    } catch (err) {
      // Entró a Supabase pero no puede usar la app (sin perfil, desactivado, sin conexión).
      await abandonarNube();
      setError(err.message || "No se pudieron cargar los datos.");
    } finally {
      setCargando(false);
    }
  };

  const usar = (usuario) => {
    setEmail(usuario.email);
    setPassword(usuario.password);
    setError("");
  };

  return (
    <div className="login">
      <form onSubmit={entrar} className="login-caja">
        <div className="login-logo">A</div>
        <h1>AcroDocs</h1>
        <p className="login-sub">Expedientes de obra y consultoría bajo Ley 32069</p>

        <div className="campo-grupo">
          <label className="campo">Correo</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required autoFocus />
        </div>
        <div className="campo-grupo">
          <label className="campo">Contraseña</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </div>

        {error && <div className="alerta" role="alert">{error}</div>}

        <button className="btn primario ancho" type="submit" disabled={cargando}>{cargando ? "Ingresando…" : "Ingresar"}</button>

        {MODO_NUBE ? (
          <div className="login-demo">
            <div className="login-nota">
              Los datos se guardan en la nube y se ven igual en cualquier dispositivo. Los archivos adjuntos todavía se
              guardan en el navegador donde se subieron. Si olvidaste tu contraseña, pide al gerente general que la restablezca.
            </div>
          </div>
        ) : (
          <div className="login-demo">
            <strong>Usuarios de demostración</strong>
            <div className="login-ayuda">Toca un usuario para completar el formulario.</div>
            <div className="login-lista">
              {USUARIOS_DEMO.map((u) => (
                <button
                  type="button"
                  key={u.id}
                  className={`login-usuario${email === u.email ? " activo" : ""}`}
                  onClick={() => usar(u)}
                >
                  <span className="login-usuario-rol">{nombreRol(u.rol)}</span>
                  <span><code>{u.email}</code> / <code>{u.password}</code></span>
                </button>
              ))}
            </div>
            <div className="login-nota">Modo local: la app guarda los datos y archivos en este navegador.</div>
          </div>
        )}
      </form>
    </div>
  );
}
