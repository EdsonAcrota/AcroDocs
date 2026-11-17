import React, { useState } from "react";
import {
  getFeriados, agregarFeriado, eliminarFeriado, hoyISO, exportarDatos, listAllTareas,
  puede, getRespaldoV6, getEmpresa, guardarEmpresa,
} from "../lib/store.js";
import { Link } from "react-router-dom";
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
  const [empresa, setEmpresa] = useState(() => getEmpresa());
  const [feriados, setFeriados] = useState(getFeriados());
  const [nueva, setNueva] = useState("");
  const [mensaje, setMensaje] = useState("");
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

  const guardarDatosEmpresa = (e) => {
    e.preventDefault();
    try {
      setEmpresa(guardarEmpresa(empresa));
      setMensaje("Datos de la empresa guardados.");
      alCambiar();
    } catch (error) {
      setMensaje(error?.message || "No se pudieron guardar los datos de la empresa.");
    }
  };

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

  return (
    <div>
      <div className="vista-encabezado">
        <div>
          <div className="eyebrow">Configuración</div>
          <h2>Configuración</h2>
          <p>Empresa, usuarios y permisos, feriados, catálogo y respaldos. Solo ves las secciones que tu rol permite.</p>
        </div>
      </div>

      {mensaje && <div className="nota-info">{mensaje}</div>}

      {verUsuarios && (
      <div className="tarjeta">
        <div className="tarjeta-cab">
          <h3>Empresa</h3>
          <span className="ref">Ejecuta directamente los contratos que no van en consorcio</span>
        </div>
        <div className="cuerpo">
          <form className="grid-form" onSubmit={guardarDatosEmpresa}>
            <label className="campo-grupo">
              <span className="campo">Razón social</span>
              <input value={empresa.razonSocial} onChange={(e) => setEmpresa({ ...empresa, razonSocial: e.target.value })} placeholder="Constructora … S.A.C." />
            </label>
            <label className="campo-grupo">
              <span className="campo">RUC</span>
              <input value={empresa.ruc} onChange={(e) => setEmpresa({ ...empresa, ruc: e.target.value })} inputMode="numeric" />
            </label>
            <div className="acciones-descarga ancho-completo">
              <button type="submit" className="btn primario">Guardar empresa</button>
            </div>
          </form>
        </div>
      </div>
      )}

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
        <div className="tarjeta-cab"><h3>Catálogo de hitos y trámites</h3></div>
        <div className="cuerpo">
          <p style={{ margin: "0 0 10px" }}>Etapas, hitos, documentos requeridos, plazos y pasos de cada trámite se editan en una pantalla propia.</p>
          <Link to="/catalogo" className="btn primario">Abrir el catálogo</Link>
        </div>
      </div>
      )}

      {verHistorial && (
      <div className="tarjeta">
        <div className="tarjeta-cab">
          <h3>Historial de cambios</h3>
          <span className="ref">Catálogo, permisos, usuarios, empresa y contratos eliminados</span>
        </div>
        <div className="cuerpo">
          <HistorialLista objeto={["catalogo", "permisos", "usuarios", "empresa", "contrato"]} vacio="Todavía no hay cambios de catálogo, permisos, usuarios ni empresa." />
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
