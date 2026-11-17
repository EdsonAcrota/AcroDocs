import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate, NavLink, useNavigate } from "react-router-dom";
import { getSession, logout, puede } from "./lib/store.js";
import { hasSupabase } from "./lib/supabase.js";
import Login from "./pages/Login.jsx";
import Panel from "./pages/Panel.jsx";
import Tramites from "./pages/Tramites.jsx";
import TramiteDetalle from "./pages/TramiteDetalle.jsx";
import Configuracion from "./pages/Configuracion.jsx";

export default function App() {
  const [session, setSession] = useState(getSession());
  const navigate = useNavigate();

  useEffect(() => {
    if (!session) navigate("/", { replace: true });
  }, [session, navigate]);

  if (!session) return <Login onLogin={setSession} />;

  const salir = () => {
    logout();
    setSession(null);
  };

  const rolTxt = { admin: "Administrador", logistica: "Logística", area_usuaria: "Área usuaria", legal: "Asesoría Legal", lectura: "Solo lectura" };
  const inicial = (session.nombre || "U").slice(0, 1).toUpperCase();
  // Configuración se muestra a quien tenga permiso sobre alguna de sus secciones.
  const verConfiguracion = ["usuarios", "feriados", "respaldo", "catalogo"].some((permiso) => puede(permiso));

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="marca">
          <div className="marca-icono">A</div>
          <div>
            <div className="logo">AcroDocs</div>
            <div className="marca-sub">Expediente documentario</div>
          </div>
        </div>
        <nav>
          <NavLink to="/panel" className={({ isActive }) => (isActive ? "activo" : "")}>
            <span className="nav-ico" aria-hidden="true" /> Panel
          </NavLink>
          <NavLink to="/tramites" className={({ isActive }) => (isActive ? "activo" : "")}>
            <span className="nav-ico" aria-hidden="true" /> Contratos
          </NavLink>
          {verConfiguracion && (
            <NavLink to="/configuracion" className={({ isActive }) => (isActive ? "activo" : "")}>
              <span className="nav-ico" aria-hidden="true" /> Configuración
            </NavLink>
          )}
        </nav>
        <div className="sidebar-pie">
          <div className="usuario">
            <div className="avatar">{inicial}</div>
            <div className="usuario-datos">
              <strong>{session.nombre}</strong>
              <span>{rolTxt[session.rol] || session.rol}</span>
            </div>
          </div>
          <button className="btn salir" onClick={salir}>Cerrar sesión</button>
          <div className="modo-demo" title="Configura Supabase para usar PostgreSQL">
            {hasSupabase ? "PostgreSQL · Supabase" : "Modo demo · datos locales"}
          </div>
        </div>
      </aside>
      <main className="contenido">
        <Routes>
          <Route path="/" element={<Navigate to="/panel" replace />} />
          <Route path="/panel" element={<Panel session={session} />} />
          <Route path="/tramites" element={<Tramites session={session} />} />
          <Route path="/tramite/:id" element={<TramiteDetalle session={session} />} />
          <Route path="/configuracion" element={<Configuracion session={session} />} />
          <Route path="*" element={<Navigate to="/panel" replace />} />
        </Routes>
      </main>
    </div>
  );
}
