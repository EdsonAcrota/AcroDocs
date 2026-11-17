import React, { useState } from "react";
import { loginDemo } from "../lib/store.js";
import { hasSupabase } from "../lib/supabase.js";

export default function Login({ onLogin }) {
  const [email, setEmail] = useState("admin@acrodocs.local");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");

  const entrar = (e) => {
    e.preventDefault();
    setError("");
    const res = loginDemo(email, password);
    if (res.error) setError(res.error);
    else onLogin(res.session);
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
          <div><code>admin@acrodocs.local</code> / <code>admin123</code></div>
          <details className="login-usuarios">
            <summary>Ver todos los usuarios y roles</summary>
            <div><code>logistica@acrodocs.local</code> / <code>logistica123</code> · Logística</div>
            <div><code>area@acrodocs.local</code> / <code>area123</code> · Área usuaria</div>
            <div><code>legal@acrodocs.local</code> / <code>legal123</code> · Asesoría legal</div>
            <div><code>lectura@acrodocs.local</code> / <code>lectura123</code> · Solo lectura</div>
          </details>
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
