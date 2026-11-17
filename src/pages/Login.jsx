import React, { useState } from "react";
import { loginDemo } from "../lib/store.js";
import { ROLES } from "../lib/permisos.js";
import { USUARIOS_DEMO } from "../lib/migracion.js";
import { hasSupabase } from "../lib/supabase.js";

const nombreRol = (clave) => ROLES.find((r) => r.clave === clave)?.nombre || clave;

export default function Login({ onLogin }) {
  const [email, setEmail] = useState("gerente@acrodocs.local");
  const [password, setPassword] = useState("gerente123");
  const [error, setError] = useState("");

  const entrar = (e) => {
    e.preventDefault();
    setError("");
    const res = loginDemo(email, password);
    if (res.error) setError(res.error);
    else onLogin(res.session);
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
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </div>
        <div className="campo-grupo">
          <label className="campo">Contraseña</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>

        {error && <div className="alerta">{error}</div>}

        <button className="btn primario ancho" type="submit">Ingresar</button>

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
          <div className="login-nota">
            {hasSupabase
              ? "Supabase configurado. El demo usa la sesión local hasta conectar la base."
              : "Sin Supabase configurado: la app guarda los datos y archivos en este navegador."}
          </div>
        </div>
      </form>
    </div>
  );
}
