import React, { useState } from "react";
import {
  getSession, listarUsuarios, crearUsuario, actualizarUsuario,
  getPermisosRoles, setPermisoRol, listarContratosAsignables,
} from "../lib/store.js";
import { PERMISOS, ROLES } from "../lib/permisos.js";

// Permisos agrupados como en §5.1, respetando el orden del catálogo.
const GRUPOS = PERMISOS.reduce((acc, permiso) => {
  const ultimo = acc[acc.length - 1];
  if (ultimo && ultimo.grupo === permiso.grupo) ultimo.permisos.push(permiso);
  else acc.push({ grupo: permiso.grupo, permisos: [permiso] });
  return acc;
}, []);

// Etiqueta corta para el encabezado vertical: sin la aclaración entre paréntesis.
const etiquetaCorta = (nombre) => nombre.replace(/\s*\(.*\)\s*$/, "");

const FORM_NUEVO = { id: null, nombre: "", email: "", password: "", rol: "consulta", contratos: [] };

function Mensajes({ aviso, error }) {
  return (
    <>
      {error && <div className="alerta" role="alert">{error}</div>}
      {aviso && !error && <div className="nota-info">{aviso}</div>}
    </>
  );
}

// `onCambio` avisa a la app de que cambió algo que puede afectar al usuario actual
// (su rol, sus contratos o la matriz de permisos) para que refresque la sesión.
export default function UsuariosPermisos({ onCambio }) {
  const [usuarios, setUsuarios] = useState(() => listarUsuarios());
  const [matriz, setMatriz] = useState(() => getPermisosRoles());
  const [contratos] = useState(() => listarContratosAsignables());
  const [form, setForm] = useState(null);
  const [avisoUsuarios, setAvisoUsuarios] = useState("");
  const [errorUsuarios, setErrorUsuarios] = useState("");
  const [avisoMatriz, setAvisoMatriz] = useState("");
  const [errorMatriz, setErrorMatriz] = useState("");

  const yo = getSession();
  const soyGerente = yo?.rol === "gerente";
  const nombreRol = (clave) => ROLES.find((r) => r.clave === clave)?.nombre || clave;
  const veTodos = (rol) => rol === "gerente" || (matriz[rol] || []).includes("ver_todos");
  const codigoDe = (id) => contratos.find((c) => c.id === id)?.codigo;

  const avisarUsuarios = (texto) => { setErrorUsuarios(""); setAvisoUsuarios(texto); };
  const fallarUsuarios = (err) => { setAvisoUsuarios(""); setErrorUsuarios(err?.message || "No se pudo completar la acción."); };

  const abrirNuevo = () => {
    setForm({ ...FORM_NUEVO, contratos: [] });
    setErrorUsuarios("");
    setAvisoUsuarios("");
  };

  const abrirEdicion = (u) => {
    setForm({ id: u.id, nombre: u.nombre, email: u.email, password: "", rol: u.rol, contratos: [...u.contratos] });
    setErrorUsuarios("");
    setAvisoUsuarios("");
  };

  const cerrarForm = () => { setForm(null); setErrorUsuarios(""); };

  const alternarContrato = (id) => {
    const marcado = form.contratos.includes(id);
    setForm({ ...form, contratos: marcado ? form.contratos.filter((c) => c !== id) : [...form.contratos, id] });
  };

  const guardar = (e) => {
    e.preventDefault();
    try {
      if (form.id) {
        const cambios = { nombre: form.nombre, email: form.email, rol: form.rol, contratos: form.contratos };
        // En edición, dejar la contraseña vacía conserva la actual.
        if (form.password !== "") cambios.password = form.password;
        const guardado = actualizarUsuario(form.id, cambios);
        avisarUsuarios(`Cambios de “${guardado.nombre}” guardados.`);
      } else {
        const creado = crearUsuario(form);
        avisarUsuarios(`Usuario “${creado.nombre}” creado. Ya puede iniciar sesión con su correo y la contraseña indicada.`);
      }
      setUsuarios(listarUsuarios());
      setForm(null);
      onCambio?.();
    } catch (err) {
      fallarUsuarios(err);
    }
  };

  const alternarActivo = (u) => {
    const desactivar = u.activo;
    if (desactivar && !window.confirm(`¿Desactivar a ${u.nombre}? No podrá iniciar sesión hasta que lo actives de nuevo.`)) return;
    try {
      actualizarUsuario(u.id, { activo: !u.activo });
      setUsuarios(listarUsuarios());
      avisarUsuarios(`Usuario “${u.nombre}” ${desactivar ? "desactivado" : "activado"}.`);
      onCambio?.();
    } catch (err) {
      fallarUsuarios(err);
    }
  };

  const cambiarPermiso = (rol, permiso, activo) => {
    if (activo && permiso.peligroso && !window.confirm(`“${permiso.nombre}” permite borrar información. ¿Otorgarlo a ${nombreRol(rol)}?`)) return;
    try {
      setMatriz(setPermisoRol(rol, permiso.clave, activo));
      onCambio?.();
      setErrorMatriz("");
      setAvisoMatriz(`${nombreRol(rol)}: “${etiquetaCorta(permiso.nombre)}” ${activo ? "otorgado" : "quitado"}.`);
    } catch (err) {
      setAvisoMatriz("");
      setErrorMatriz(err?.message || "No se pudo cambiar el permiso.");
    }
  };

  const rolesDisponibles = ROLES.filter((r) => r.clave !== "gerente" || soyGerente || form?.rol === "gerente");
  const editandoPropia = Boolean(form?.id) && form.id === yo?.usuarioId;

  return (
    <>
      <div className="seccion-config">
        <h3>Usuarios y permisos</h3>
        <p>Quién entra al sistema, qué contratos ve y qué puede hacer cada rol.</p>
      </div>

      <div className="tarjeta">
        <div className="tarjeta-cab">
          <h3>Usuarios</h3>
          <div className="chips">
            <span className="badge azul">{usuarios.length} usuario(s)</span>
            <button type="button" className="btn mini primario" onClick={abrirNuevo} disabled={Boolean(form && !form.id)}>Nuevo usuario</button>
          </div>
        </div>
        <div className="cuerpo">
          <Mensajes aviso={avisoUsuarios} error={errorUsuarios} />

          {form && (
            <form className="grid-form usuario-form" onSubmit={guardar}>
              <div className="ancho-completo usuario-form-titulo">
                <strong>{form.id ? "Editar usuario" : "Nuevo usuario"}</strong>
              </div>
              <label className="campo-grupo">
                <span className="campo">Nombre *</span>
                <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required autoFocus />
              </label>
              <label className="campo-grupo">
                <span className="campo">Correo *</span>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              </label>
              <label className="campo-grupo">
                <span className="campo">{form.id ? "Contraseña demo (opcional)" : "Contraseña demo *"}</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder={form.id ? "Dejar vacía para no cambiarla" : ""}
                  required={!form.id}
                />
              </label>
              <label className="campo-grupo">
                <span className="campo">Rol</span>
                <select
                  value={form.rol}
                  onChange={(e) => setForm({ ...form, rol: e.target.value })}
                  disabled={editandoPropia}
                  title={editandoPropia ? "No puedes cambiar tu propio rol." : undefined}
                >
                  {rolesDisponibles.map((r) => <option key={r.clave} value={r.clave}>{r.nombre}</option>)}
                </select>
              </label>
              <div className="campo-grupo ancho-completo">
                <span className="campo">Contratos asignados</span>
                {veTodos(form.rol) && (
                  <div className="ref usuario-nota">Este rol ve todos los contratos: la asignación solo se usa si más adelante pierde ese permiso.</div>
                )}
                <div className="tipos-fianza">
                  {contratos.map((c) => (
                    <label className="opcion-fianza" key={c.id}>
                      <input type="checkbox" checked={form.contratos.includes(c.id)} onChange={() => alternarContrato(c.id)} />
                      <span><strong>{c.codigo}</strong><span className="ref usuario-nota"> {c.denominacion}</span></span>
                    </label>
                  ))}
                  {contratos.length === 0 && <div className="ref">Todavía no hay contratos.</div>}
                </div>
              </div>
              <div className="acciones-descarga ancho-completo">
                <button type="submit" className="btn primario">{form.id ? "Guardar cambios" : "Crear usuario"}</button>
                <button type="button" className="btn" onClick={cerrarForm}>Cancelar</button>
              </div>
            </form>
          )}

          <div className="tabla-wrap">
            <table className="tabla tabla-usuarios">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Rol</th>
                  <th>Contratos</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) => {
                  const protegido = u.rol === "gerente" && !soyGerente;
                  const propia = u.id === yo?.usuarioId;
                  const motivoProtegido = "La cuenta del gerente general no se puede modificar.";
                  return (
                    <tr key={u.id} className={u.activo ? "" : "usuario-inactivo"}>
                      <td>
                        <strong>{u.nombre}</strong>
                        {propia && <span className="badge gris usuario-yo">Tú</span>}
                        <div className="ref">{u.email}</div>
                      </td>
                      <td><span className={`badge ${u.rol === "gerente" ? "violeta" : "azul"}`}>{nombreRol(u.rol)}</span></td>
                      <td>
                        {veTodos(u.rol) ? (
                          <span className="ref">Todos</span>
                        ) : u.contratos.length === 0 ? (
                          <span className="ref">Ninguno asignado</span>
                        ) : (
                          <div className="chips">
                            {u.contratos.map((id) => <span className="badge gris" key={id}>{codigoDe(id) || id}</span>)}
                          </div>
                        )}
                      </td>
                      <td><span className={`badge ${u.activo ? "verde" : "gris"}`}>{u.activo ? "Activo" : "Inactivo"}</span></td>
                      <td>
                        <div className="chips">
                          <button
                            type="button"
                            className="btn mini"
                            onClick={() => abrirEdicion(u)}
                            disabled={protegido}
                            title={protegido ? motivoProtegido : undefined}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="btn mini"
                            onClick={() => alternarActivo(u)}
                            disabled={protegido || (propia && u.activo)}
                            title={protegido ? motivoProtegido : (propia && u.activo ? "No puedes desactivar tu propia cuenta." : undefined)}
                          >
                            {u.activo ? "Desactivar" : "Activar"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="ref">
            Solo un gerente general puede editar o asignar la cuenta de gerente, y siempre debe quedar al menos uno activo.
            Los usuarios sin “Ver todos los contratos” solo ven los contratos que tengan asignados.
          </div>
        </div>
      </div>

      <div className="tarjeta">
        <div className="tarjeta-cab">
          <h3>Permisos por rol</h3>
          <span className="badge azul">{ROLES.length} roles · {PERMISOS.length} permisos</span>
        </div>
        <div className="cuerpo">
          <Mensajes aviso={avisoMatriz} error={errorMatriz} />
          <div className="ref matriz-leyenda">
            Marca o desmarca para cambiar lo que puede hacer cada rol; los cambios se aplican de inmediato y quedan en el historial.
            Los permisos en <span className="texto-peligro">rojo</span> permiten borrar información. La fila del gerente general está bloqueada.
          </div>
          <div className="matriz-wrap">
            <table className="matriz">
              <thead>
                <tr>
                  <th className="rol-col" rowSpan={2}>Rol</th>
                  {GRUPOS.map((g) => (
                    <th className="grupo-col" key={g.grupo} colSpan={g.permisos.length}>{g.grupo}</th>
                  ))}
                </tr>
                <tr>
                  {GRUPOS.flatMap((g) =>
                    g.permisos.map((p) => (
                      <th className={`permiso-col${p.peligroso ? " peligroso" : ""}`} key={p.clave} title={p.nombre}>
                        <span>{etiquetaCorta(p.nombre)}</span>
                      </th>
                    ))
                  )}
                </tr>
              </thead>
              <tbody>
                {ROLES.map((r) => {
                  const bloqueada = r.clave === "gerente";
                  const lista = matriz[r.clave] || [];
                  return (
                    <tr key={r.clave} className={bloqueada ? "fila-bloqueada" : ""}>
                      <th className="rol-col" scope="row">
                        <strong>{r.nombre}</strong>
                        {bloqueada && <span className="badge violeta usuario-yo">Bloqueada</span>}
                        <div className="ref">{r.descripcion}</div>
                      </th>
                      {PERMISOS.map((p) => {
                        const marcado = bloqueada || lista.includes(p.clave);
                        // Quitarte a ti mismo el permiso de esta pantalla te dejaría fuera.
                        const propioUsuarios = yo?.rol === r.clave && p.clave === "usuarios";
                        const bloquear = bloqueada || propioUsuarios;
                        const motivo = bloqueada
                          ? "Los permisos del gerente general no se pueden modificar."
                          : propioUsuarios
                            ? "No puedes quitarte el permiso de gestionar usuarios."
                            : p.nombre;
                        return (
                          <td className={`celda${p.peligroso ? " peligroso" : ""}`} key={p.clave}>
                            <input
                              type="checkbox"
                              className={p.peligroso ? "peligro" : undefined}
                              checked={marcado}
                              disabled={bloquear}
                              title={motivo}
                              aria-label={`${r.nombre}: ${p.nombre}`}
                              onChange={(e) => cambiarPermiso(r.clave, p, e.target.checked)}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
