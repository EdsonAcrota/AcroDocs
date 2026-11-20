import React, { useState } from "react";
import { cambiarMiClave } from "../lib/nube.js";
import { recargarNube } from "../lib/store.js";

const MINIMO = 8;

// Pantalla obligatoria: quien entra con la contraseña temporal que le dio el gerente
// debe elegir la suya antes de ver los datos.
export default function CambiarClave({ nombre, onListo, onSalir }) {
  const [clave, setClave] = useState("");
  const [repetida, setRepetida] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const guardar = async (e) => {
    e.preventDefault();
    setError("");
    if (clave.length < MINIMO) return setError(`La contraseña debe tener al menos ${MINIMO} caracteres.`);
    if (clave !== repetida) return setError("Las dos contraseñas no coinciden.");
    setGuardando(true);
    try {
      await cambiarMiClave(clave);
      await recargarNube();
      onListo();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="login">
      <form onSubmit={guardar} className="login-caja">
        <div className="login-logo">A</div>
        <h1>Elige tu contraseña</h1>
        <p className="login-sub">{nombre ? `${nombre}, ` : ""}entraste con una contraseña temporal. Crea una propia para continuar.</p>
        <div className="campo-grupo">
          <label className="campo">Nueva contraseña</label>
          <input type="password" value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="new-password" required autoFocus />
        </div>
        <div className="campo-grupo">
          <label className="campo">Repite la contraseña</label>
          <input type="password" value={repetida} onChange={(e) => setRepetida(e.target.value)} autoComplete="new-password" required />
        </div>
        {error && <div className="alerta" role="alert">{error}</div>}
        <button className="btn primario ancho" type="submit" disabled={guardando}>{guardando ? "Guardando…" : "Guardar y entrar"}</button>
        <button className="btn ancho" type="button" onClick={onSalir} style={{ marginTop: 8 }}>Cerrar sesión</button>
      </form>
    </div>
  );
}
