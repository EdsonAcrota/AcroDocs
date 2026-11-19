import React, { useCallback, useEffect, useState } from "react";
import { Routes, Route, Navigate, NavLink, useLocation, useNavigate } from "react-router-dom";
import { getSession, logout, puede } from "./lib/store.js";
import { ROLES } from "./lib/permisos.js";
import { CLOUD_SYNC } from "./lib/cloud.js";
import Icono from "./components/Iconos.jsx";
import Login from "./pages/Login.jsx";
import Panel from "./pages/Panel.jsx";
import Tramites from "./pages/Tramites.jsx";
import TramiteDetalle from "./pages/TramiteDetalle.jsx";
import Configuracion from "./pages/Configuracion.jsx";
import Catalogo from "./pages/Catalogo.jsx";

export default function App() {
  const [session, setSession] = useState(getSession());
  // En celular, "Más" abre una hoja con el usuario, Configuración y Cerrar sesión.
  const [masAbierto, setMasAbierto] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // La ficha de la sesión se resuelve contra los usuarios guardados. Se vuelve a
  // leer al cambiar de ruta y cuando una pantalla avisa de un cambio que puede
  // afectar al usuario actual (su rol, sus contratos, la matriz de permisos).
  const refrescarSesion = useCallback(() => setSession(getSession()), []);

  useEffect(() => {
    refrescarSesion();
    setMasAbierto(false);
  }, [location.pathname, refrescarSesion]);

  useEffect(() => {
    if (!session) navigate("/", { replace: true });
  }, [session, navigate]);

  if (!session) return <Login onLogin={setSession} />;

  const salir = () => {
    setMasAbierto(false);
    logout();
    setSession(null);
  };

  const rolNombre = ROLES.find((r) => r.clave === session.rol)?.nombre || session.rol;
  const inicial = (session.nombre || "U").slice(0, 1).toUpperCase();
  // Configuración se muestra a quien tenga permiso sobre alguna de sus secciones.
  const verConfiguracion = ["usuarios", "feriados", "respaldo", "catalogo"].some((permiso) => puede(permiso));
  const claseNav = (extra = "") => ({ isActive }) => [isActive ? "activo" : "", extra].filter(Boolean).join(" ");

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
          <NavLink to="/panel" title="Panel" className={claseNav()}>
            <Icono nombre="panel" /> <span className="nav-texto">Panel</span>
          </NavLink>
          <NavLink to="/tramites" title="Contratos" className={claseNav()}>
            <Icono nombre="contratos" /> <span className="nav-texto">Contratos</span>
          </NavLink>
          <NavLink to="/catalogo" title="Catálogo" className={claseNav()}>
            <Icono nombre="catalogo" /> <span className="nav-texto">Catálogo</span>
          </NavLink>
          {verConfiguracion && (
            <NavLink to="/configuracion" title="Configuración" className={claseNav("nav-config")}>
              <Icono nombre="configuracion" /> <span className="nav-texto">Configuración</span>
            </NavLink>
          )}
          <button
            type="button"
            className={`nav-mas${masAbierto ? " activo" : ""}`}
            aria-expanded={masAbierto}
            onClick={() => setMasAbierto((abierto) => !abierto)}
          >
            <Icono nombre="mas" /> <span className="nav-texto">Más</span>
          </button>
        </nav>
        {masAbierto && <div className="fondo-mas" onClick={() => setMasAbierto(false)} aria-hidden="true" />}
        <div className={`sidebar-pie${masAbierto ? " abierto" : ""}`}>
          <div className="usuario">
            <div className="avatar">{inicial}</div>
            <div className="usuario-datos">
              <strong>{session.nombre}</strong>
              <span>{rolNombre}</span>
            </div>
          </div>
          {verConfiguracion && (
            <NavLink to="/configuracion" className="btn mas-config">
              <Icono nombre="configuracion" /> Configuración
            </NavLink>
          )}
          <button className="btn salir" onClick={salir} title="Cerrar sesión">
            <Icono nombre="salir" /> <span className="nav-texto">Cerrar sesión</span>
          </button>
          <div className="modo-demo" title="Configura Supabase y VITE_CLOUD_SYNC para sincronizar">
            {CLOUD_SYNC ? "Nube · Supabase" : "Modo demo · datos locales"}
          </div>
        </div>
      </aside>
      <main className="contenido">
        <Routes>
          <Route path="/" element={<Navigate to="/panel" replace />} />
          <Route path="/panel" element={<Panel />} />
          <Route path="/tramites" element={<Tramites />} />
          <Route path="/tramite/:id" element={<TramiteDetalle />} />
          <Route path="/catalogo" element={<Catalogo />} />
          <Route path="/configuracion" element={<Configuracion onCambio={refrescarSesion} />} />
          <Route path="*" element={<Navigate to="/panel" replace />} />
        </Routes>
      </main>
    </div>
  );
}
