import React, { useCallback, useEffect, useState } from "react";
import { Routes, Route, Navigate, NavLink, useLocation, useNavigate } from "react-router-dom";
import { getSession, logout, puede, entrarNube, abandonarNube, recargarNube, hayNube } from "./lib/store.js";
import { ROLES } from "./lib/permisos.js";
import { MODO_NUBE } from "./lib/supabase.js";
import { haySesion, hayPendientes, estadoGuardado, suscribirEstado, reintentarGuardado, alTerminarSesion } from "./lib/nube.js";
import Icono from "./components/Iconos.jsx";
import VisorArchivo from "./components/VisorArchivo.jsx";
import { cerrarVisor } from "./lib/visor.js";
import Login from "./pages/Login.jsx";
import CambiarClave from "./pages/CambiarClave.jsx";
import Panel from "./pages/Panel.jsx";
import Tramites from "./pages/Tramites.jsx";
import TramiteDetalle from "./pages/TramiteDetalle.jsx";
import Configuracion from "./pages/Configuracion.jsx";
import Catalogo from "./pages/Catalogo.jsx";

export default function App() {
  const [session, setSession] = useState(getSession());
  // Modo nube: al abrir, se restaura la sesión guardada y se cargan los datos antes de mostrar nada.
  const [arrancando, setArrancando] = useState(MODO_NUBE);
  const [errorArranque, setErrorArranque] = useState("");
  const [guardado, setGuardado] = useState(estadoGuardado());
  // Cambia cuando llegan datos nuevos del servidor, para volver a dibujar las pantallas.
  const [version, setVersion] = useState(0);
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
    if (!session) {
      cerrarVisor(); // un archivo abierto no debe reaparecer al volver a entrar
      navigate("/", { replace: true });
    }
  }, [session, navigate]);

  useEffect(() => {
    if (!MODO_NUBE) return undefined;
    let vivo = true;
    (async () => {
      try {
        if (await haySesion()) {
          await entrarNube();
          if (vivo) setSession(getSession());
        }
      } catch (error) {
        await abandonarNube();
        if (vivo) setErrorArranque(error.message || "No se pudieron cargar los datos.");
      }
      if (vivo) setArrancando(false);
    })();
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    if (!MODO_NUBE) return undefined;
    const quitarEstado = suscribirEstado(setGuardado);
    // Si Supabase da la sesión por terminada (token que no se pudo renovar), se vuelve al ingreso.
    const quitarSesion = alTerminarSesion(() => {
      if (!hayNube()) return;
      logout();
      setSession(null);
    });
    return () => { quitarEstado(); quitarSesion(); };
  }, []);

  // Al volver a la pestaña se traen los cambios de otros usuarios, salvo que haya algo sin
  // guardar o se esté escribiendo en un campo.
  useEffect(() => {
    if (!MODO_NUBE || !session) return undefined;
    const alVolver = async () => {
      if (document.visibilityState !== "visible" || hayPendientes()) return;
      const activo = document.activeElement;
      if (activo && ["INPUT", "TEXTAREA", "SELECT"].includes(activo.tagName)) return;
      try {
        if (await recargarNube()) {
          refrescarSesion();
          setVersion((v) => v + 1);
        }
      } catch { /* sin conexión: se conserva lo que hay en pantalla */ }
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, [session, refrescarSesion]);

  if (arrancando) return <div className="login"><div className="login-caja"><p className="login-sub">Cargando…</p></div></div>;
  if (!session) return <Login onLogin={setSession} aviso={errorArranque} />;

  const salir = () => {
    if (MODO_NUBE && hayPendientes() && !window.confirm("Hay cambios que todavía no se guardaron. ¿Cerrar sesión de todos modos?")) return;
    setMasAbierto(false);
    logout();
    setSession(null);
  };

  if (session.cambiarClave) {
    return <CambiarClave nombre={session.nombre} onListo={refrescarSesion} onSalir={salir} />;
  }

  const recargarTodo = async () => {
    try {
      if (await recargarNube()) setVersion((v) => v + 1);
      refrescarSesion();
    } catch { /* el aviso de error sigue visible */ }
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
          <div className="modo-demo">
            {MODO_NUBE
              ? `Nube${guardado.fase === "guardando" ? " · guardando…" : guardado.fase === "error" ? " · sin guardar" : " · guardado"}`
              : "Modo demo · datos locales"}
          </div>
        </div>
      </aside>
      <main className="contenido" key={version}>
        {MODO_NUBE && guardado.fase === "error" && (
          <div className="alerta barra-guardado" role="alert">
            <span><strong>No se pudo guardar.</strong> {guardado.mensaje}</span>
            <span className="barra-guardado-acciones">
              <button type="button" className="btn" onClick={reintentarGuardado}>Reintentar</button>
              <button type="button" className="btn" onClick={recargarTodo} title="Descarta lo que no se guardó y trae los datos del servidor">Recargar datos</button>
            </span>
          </div>
        )}
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
      <VisorArchivo />
    </div>
  );
}
