import React, { useState } from "react";
import {
  getFeriados, agregarFeriado, eliminarFeriado, hoyISO, exportarDatos, listAllTareas,
  listarCatalogoHitos, agregarCatalogoHito, actualizarCatalogoHito, eliminarCatalogoHito,
  puede, getRespaldoV6,
} from "../lib/store.js";
import { catalogoDe } from "../lib/catalogo.js";
import { descargarTexto, descargarComoZip } from "../lib/archivos.js";
import UsuariosPermisos from "../components/UsuariosPermisos.jsx";
import HistorialLista from "../components/HistorialLista.jsx";

const fecha = (f) => (f ? new Date(`${f}T12:00:00`).toLocaleDateString("es-PE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }) : "—");

export default function Configuracion({ onCambio }) {
  // Cada sección se muestra según el permiso que la gobierna (§5.1).
  const verUsuarios = puede("usuarios");
  const verFeriados = puede("feriados");
  const verCatalogo = puede("catalogo");
  const verRespaldo = puede("respaldo");
  const verHistorial = verUsuarios || verCatalogo;
  // Cada cambio de usuarios o permisos vuelve a pintar el historial y avisa a la app.
  const [, setRevision] = useState(0);
  const alCambiar = () => {
    setRevision((n) => n + 1);
    onCambio?.();
  };
  const [hayRespaldoV6] = useState(() => verRespaldo && getRespaldoV6() !== null);
  const [feriados, setFeriados] = useState(getFeriados());
  const [nueva, setNueva] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [catalogoHitos, setCatalogoHitos] = useState(listarCatalogoHitos());
  const [editandoHitoId, setEditandoHitoId] = useState(null);
  const [nuevoHito, setNuevoHito] = useState({
    nombre: "",
    tipoObjeto: "Obra",
    etapaCodigo: "1.1",
    etapaNombre: "Contrato y expediente",
    docs: "",
    cumplimiento: "",
    dias: "",
    base: "suscripcion",
    habiles: true,
    norma: "Ley 32069 y su Reglamento",
  });

  const etapasHito = catalogoDe(nuevoHito.tipoObjeto).etapas;

  if (!verUsuarios && !verFeriados && !verCatalogo && !verRespaldo) {
    return (
      <div>
        <div className="vista-encabezado">
          <div>
            <div className="eyebrow">Configuración</div>
            <h2>Configuración</h2>
          </div>
        </div>
        <div className="tarjeta"><div className="vacio">Tu rol no tiene permisos de configuración. Pídele al gerente general que los habilite si los necesitas.</div></div>
      </div>
    );
  }

  const agregar = (e) => {
    e.preventDefault();
    if (!nueva) return;
    setFeriados(agregarFeriado(nueva));
    setMensaje(`Feriado ${fecha(nueva)} agregado. Los nuevos plazos en días hábiles lo tomarán en cuenta.`);
    setNueva("");
  };

  const quitar = (f) => {
    if (!window.confirm(`¿Quitar el feriado ${fecha(f)}?`)) return;
    setFeriados(eliminarFeriado(f));
    setMensaje(`Feriado ${fecha(f)} eliminado.`);
  };

  const descargarDatos = () => {
    try {
      descargarTexto(exportarDatos(), "acrodocs_respaldo.json");
      setMensaje("Respaldo de datos descargado.");
    } catch (error) {
      setMensaje(error?.message || "No se pudo descargar el respaldo.");
    }
  };

  const descargarRespaldoV6 = () => {
    try {
      const texto = getRespaldoV6();
      if (texto === null) {
        setMensaje("No hay respaldo previo a la migración en este navegador.");
        return;
      }
      descargarTexto(texto, "acrodocs_respaldo_v6.json");
      setMensaje("Respaldo previo a la migración descargado.");
    } catch (error) {
      setMensaje(error?.message || "No se pudo descargar el respaldo previo a la migración.");
    }
  };

  const descargarArchivos = async () => {
    const documentos = listAllTareas().flatMap((i) =>
      (i.documentos || []).map((doc) => ({ ...doc, nombre: `${i.tramite_codigo}/${i.codigo}/${doc.nombre}` }))
    );
    if (!documentos.length) {
      setMensaje("Todavía no hay archivos cargados en los expedientes.");
      return;
    }
    try {
      await descargarComoZip(documentos, "acrodocs_todos_los_archivos.zip");
      setMensaje("Se descargaron todos los archivos en un ZIP.");
    } catch (error) {
      setMensaje(error?.message || "No se pudo descargar los archivos.");
    }
  };

  const guardarHitoCatalogo = (e) => {
    e.preventDefault();
    if (!nuevoHito.nombre.trim()) return;
    const docs = nuevoHito.docs.split(/\n|,/).map((d) => d.trim()).filter(Boolean);
    const datos = {
      ...nuevoHito,
      docs,
      dias: Number(nuevoHito.dias || 0),
    };
    if (editandoHitoId) {
      actualizarCatalogoHito(editandoHitoId, datos);
      setMensaje(`Hito “${datos.nombre}” actualizado en el catálogo.`);
      setEditandoHitoId(null);
    } else {
      const creado = agregarCatalogoHito(datos);
      setMensaje(`Hito “${creado.nombre}” agregado al catálogo. Aparecerá en los contratos nuevos de ${creado.tipoObjeto}.`);
    }
    setCatalogoHitos(listarCatalogoHitos());
    setNuevoHito({
      nombre: "", tipoObjeto: nuevoHito.tipoObjeto, etapaCodigo: "1.1",
      etapaNombre: "Contrato y expediente", docs: "", cumplimiento: "", dias: "",
      base: "suscripcion", habiles: true, norma: "Ley 32069 y su Reglamento",
    });
  };

  const editarHitoCatalogo = (h) => {
    setEditandoHitoId(h.id);
    setNuevoHito({
      nombre: h.nombre,
      tipoObjeto: h.tipoObjeto,
      etapaCodigo: h.etapaCodigo,
      etapaNombre: h.etapaNombre,
      docs: (h.docs || []).join("\n"),
      cumplimiento: h.cumplimiento || "",
      dias: h.dias || 0,
      base: h.base || "inicio",
      habiles: h.habiles !== false,
      norma: h.norma || "Ley 32069 y su Reglamento",
    });
  };

  const cambiarTipoHito = (tipoObjeto) => {
    const primera = catalogoDe(tipoObjeto).etapas[0];
    setNuevoHito({
      ...nuevoHito,
      tipoObjeto,
      etapaCodigo: primera.codigo,
      etapaNombre: primera.nombre,
    });
  };

  const cambiarEtapaHito = (codigo) => {
    const etapa = etapasHito.find((e) => e.codigo === codigo);
    if (etapa) setNuevoHito({ ...nuevoHito, etapaCodigo: etapa.codigo, etapaNombre: etapa.nombre });
  };

  const quitarHitoCatalogo = (hito) => {
    if (!window.confirm(`¿Quitar “${hito.nombre}” del catálogo? No se eliminará de los contratos ya creados.`)) return;
    eliminarCatalogoHito(hito.id);
    setCatalogoHitos(listarCatalogoHitos());
    setMensaje(`Hito “${hito.nombre}” quitado del catálogo.`);
  };

  return (
    <div>
      <div className="vista-encabezado">
        <div>
          <div className="eyebrow">Configuración</div>
          <h2>Configuración</h2>
          <p>Usuarios y permisos, feriados, catálogo y respaldos. Solo ves las secciones que tu rol permite.</p>
        </div>
      </div>

      {mensaje && <div className="nota-info">{mensaje}</div>}

      {verUsuarios && <UsuariosPermisos onCambio={alCambiar} />}

      {verFeriados && (
      <div className="grid-2">
        <div className="tarjeta">
          <div className="tarjeta-cab"><h3>Agregar feriado</h3></div>
          <div className="cuerpo">
            <form onSubmit={agregar} className="form-feriado">
              <label className="campo-grupo">
                <span className="campo">Fecha</span>
                <input type="date" value={nueva} onChange={(e) => setNueva(e.target.value)} min={hoyISO()} required />
              </label>
              <button type="submit" className="btn primario">Agregar feriado</button>
            </form>
            <div className="ref">Los fines de semana ya se excluyen por defecto. Los feriados se usan para calcular vencimientos en días hábiles; los plazos ya generados no se recalculan.</div>
          </div>
        </div>

        <div className="tarjeta">
          <div className="tarjeta-cab">
            <h3>Feriados configurados</h3>
            <span className="badge azul">{feriados.length}</span>
          </div>
          <div className="cuerpo">
            <div className="feriados-lista">
              {feriados.map((f) => (
                <div className="feriado-fila" key={f}>
                  <div>
                    <strong>{fecha(f)}</strong>
                    <span className="ref">{f}</span>
                  </div>
                  <button type="button" className="btn-icono peligro" title="Quitar feriado" onClick={() => quitar(f)}>×</button>
                </div>
              ))}
              {feriados.length === 0 && <div className="vacio">No hay feriados configurados.</div>}
            </div>
          </div>
        </div>
      </div>
      )}

      {verCatalogo && (
      <div className="tarjeta">
        <div className="tarjeta-cab">
          <h3>Catálogo personalizado de hitos</h3>
          <span className="badge azul">{catalogoHitos.length} hito(s)</span>
        </div>
        <div className="cuerpo">
          <form className="grid-form" onSubmit={guardarHitoCatalogo}>
            <label className="campo-grupo">
              <span className="campo">Nombre del hito *</span>
              <input value={nuevoHito.nombre} onChange={(e) => setNuevoHito({ ...nuevoHito, nombre: e.target.value })} placeholder="Ej. Permiso de ocupación de vía pública" required />
            </label>
            <label className="campo-grupo">
              <span className="campo">Tipo de contrato</span>
              <select value={nuevoHito.tipoObjeto} onChange={(e) => cambiarTipoHito(e.target.value)}>
                <option>Obra</option>
                <option>Consultoría de obra</option>
              </select>
            </label>
            <label className="campo-grupo">
              <span className="campo">Etapa</span>
              <select value={nuevoHito.etapaCodigo} onChange={(e) => cambiarEtapaHito(e.target.value)}>
                {etapasHito.map((e) => <option key={e.codigo} value={e.codigo}>{e.codigo} · {e.nombre}</option>)}
              </select>
            </label>
            <label className="campo-grupo">
              <span className="campo">Plazo (días)</span>
              <input type="number" min="0" value={nuevoHito.dias} onChange={(e) => setNuevoHito({ ...nuevoHito, dias: e.target.value })} />
            </label>
            <label className="campo-grupo">
              <span className="campo">Base del plazo</span>
              <select value={nuevoHito.base} onChange={(e) => setNuevoHito({ ...nuevoHito, base: e.target.value })}>
                <option value="suscripcion">Fecha de suscripción</option>
                <option value="inicio">Fecha de inicio</option>
              </select>
            </label>
            <label className="campo-grupo">
              <span className="campo">Tipo de plazo</span>
              <select value={nuevoHito.habiles ? "habiles" : "calendario"} onChange={(e) => setNuevoHito({ ...nuevoHito, habiles: e.target.value === "habiles" })}>
                <option value="habiles">Días hábiles</option>
                <option value="calendario">Días calendario</option>
              </select>
            </label>
            <label className="campo-grupo ancho-completo">
              <span className="campo">Documentos requeridos (uno por línea)</span>
              <textarea rows="3" value={nuevoHito.docs} onChange={(e) => setNuevoHito({ ...nuevoHito, docs: e.target.value })} placeholder={"Solicitud\nResolución aprobatoria\nComprobante de pago"} />
            </label>
            <label className="campo-grupo">
              <span className="campo">Documento que da por cumplido el hito</span>
              <input value={nuevoHito.cumplimiento} onChange={(e) => setNuevoHito({ ...nuevoHito, cumplimiento: e.target.value })} placeholder="Nombre exacto de la etiqueta" />
            </label>
            <label className="campo-grupo">
              <span className="campo">Norma de referencia</span>
              <input value={nuevoHito.norma} onChange={(e) => setNuevoHito({ ...nuevoHito, norma: e.target.value })} />
            </label>
            <div className="acciones-descarga ancho-completo">
              <button type="submit" className="btn primario">{editandoHitoId ? "Guardar cambios" : "Agregar al catálogo"}</button>
              {editandoHitoId && <button type="button" className="btn" onClick={() => { setEditandoHitoId(null); setNuevoHito({ ...nuevoHito, nombre: "", docs: "", cumplimiento: "", dias: "" }); }}>Cancelar edición</button>}
            </div>
          </form>

          <div className="catalogo-hitos-lista">
            {catalogoHitos.length === 0 && <div className="vacio">No hay hitos personalizados. Los que agregues aparecerán aquí y se generarán en los contratos nuevos.</div>}
            {catalogoHitos.map((h) => (
              <div className="catalogo-hito-fila" key={h.id}>
                <div>
                  <strong>{h.nombre}</strong>
                  <span className="ref">
                    {h.tipoObjeto} · {h.etapaCodigo} {h.etapaNombre} · {h.docs.length} documento(s) · {h.dias ? `${h.dias} días ${h.habiles ? "hábiles" : "calendario"}` : "sin plazo"}
                  </span>
                </div>
                <div className="chips">
                  <button type="button" className="btn mini" onClick={() => editarHitoCatalogo(h)}>Editar</button>
                  <button
                    type="button"
                    className="btn mini"
                    onClick={() => { actualizarCatalogoHito(h.id, { activo: h.activo === false }); setCatalogoHitos(listarCatalogoHitos()); }}
                  >
                    {h.activo === false ? "Activar" : "Desactivar"}
                  </button>
                  <button type="button" className="btn-icono peligro" title="Quitar del catálogo" onClick={() => quitarHitoCatalogo(h)}>×</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      )}

      {verHistorial && (
      <div className="tarjeta">
        <div className="tarjeta-cab">
          <h3>Historial de cambios</h3>
          <span className="ref">Catálogo, permisos y usuarios</span>
        </div>
        <div className="cuerpo">
          <HistorialLista objeto={["catalogo", "permisos", "usuarios"]} vacio="Todavía no hay cambios de catálogo, permisos ni usuarios." />
        </div>
      </div>
      )}

      {verRespaldo && (
      <div className="tarjeta">
        <div className="tarjeta-cab"><h3>Respaldo y descargas</h3></div>
        <div className="cuerpo">
          <div className="acciones-descarga">
            <button type="button" className="btn" onClick={descargarDatos}>Descargar datos (JSON)</button>
            <button type="button" className="btn" onClick={descargarArchivos}>Descargar todos los archivos (ZIP)</button>
            {hayRespaldoV6 && (
              <button type="button" className="btn" onClick={descargarRespaldoV6}>Descargar respaldo previo a la migración</button>
            )}
          </div>
          <div className="ref">El respaldo JSON contiene contratos, hitos, plantillas, feriados, usuarios (sin contraseñas), permisos, historial y configuración. Los archivos se agrupan por contrato e hito dentro del ZIP.</div>
          {hayRespaldoV6 && (
            <div className="ref">El respaldo previo a la migración es la copia exacta de los datos tal como estaban antes de pasar a la versión con usuarios y permisos.</div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
