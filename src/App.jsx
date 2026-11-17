import React, { useCallback, useEffect, useState } from "react";
import { Routes, Route, Navigate, NavLink, useLocation, useNavigate } from "react-router-dom";
import { getSession, logout, puede } from "./lib/store.js";
import { ROLES } from "./lib/permisos.js";
import { hasSupabase } from "./lib/supabase.js";
import Login from "./pages/Login.jsx";
import Panel from "./pages/Panel.jsx";
import Tramites from "./pages/Tramites.jsx";
import TramiteDetalle from "./pages/TramiteDetalle.jsx";
import Configuracion from "./pages/Configuracion.jsx";
import Catalogo from "./pages/Catalogo.jsx";
import MesaPartes from "./pages/MesaPartes.jsx";

export default function App() {
  const [session, setSession] = useState(getSession());
  const navigate = useNavigate();
  const location = useLocation();

  // La ficha de la sesión se resuelve contra los usuarios guardados. Se vuelve a
  // leer al cambiar de ruta y cuando una pantalla avisa de un cambio que puede
  // afectar al usuario actual (su rol, sus contratos, la matriz de permisos).
  const refrescarSesion = useCallback(() => setSession(getSession()), []);

  useEffect(() => {
    refrescarSesion();
  }, [location.pathname, refrescarSesion]);

  useEffect(() => {
    if (!session) navigate("/", { replace: true });
  }, [session, navigate]);

  if (!session) return <Login onLogin={setSession} />;

  const salir = () => {
    logout();
    setSession(null);
  };

  const rolNombre = ROLES.find((r) => r.clave === session.rol)?.nombre || session.rol;
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
          <NavLink to="/mesa-partes" className={({ isActive }) => (isActive ? "activo" : "")}>
            <span className="nav-ico" aria-hidden="true" /> Mesa de partes
          </NavLink>
          <NavLink to="/catalogo" className={({ isActive }) => (isActive ? "activo" : "")}>
            <span className="nav-ico" aria-hidden="true" /> Catálogo
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
              <span>{rolNombre}</span>
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
          <Route path="/panel" element={<Panel />} />
          <Route path="/tramites" element={<Tramites />} />
          <Route path="/tramite/:id" element={<TramiteDetalle />} />
          <Route path="/mesa-partes" element={<MesaPartes />} />
          <Route path="/catalogo" element={<Catalogo />} />
          <Route path="/configuracion" element={<Configuracion onCambio={refrescarSesion} />} />
          <Route path="*" element={<Navigate to="/panel" replace />} />
        </Routes>
      </main>
    </div>
  );
}
