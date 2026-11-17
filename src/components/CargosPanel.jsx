import React, { useState } from "react";
import {
  listarCargos, registrarCargo, anularCargo, eliminarCargo, listTramites, listItems, puede, hoyISO, getSession, nombreEjecutor,
} from "../lib/store.js";
import { TIPOS_DOCUMENTO, cargosACsv } from "../lib/cargos.js";
import { guardarArchivo, descargarArchivo, descargarTexto, eliminarArchivo } from "../lib/archivos.js";

const fecha = (f) => (f ? new Date(`${f}T12:00:00`).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const ROTULO_TIPO = { carta: "Carta", oficio: "Oficio", solicitud: "Solicitud", informe: "Informe", otro: "Otro" };

const formularioVacio = (tramiteId, tramite) => ({
  fecha: hoyISO(),
  hora: new Date().toTimeString().slice(0, 5),
  entidad: tramite?.entidad || "",
  oficina: "",
  numeroRegistro: "",
  tipoDocumento: "carta",
  numeroDocumento: "",
  asunto: "",
  emisor: "empresa",
  presentadoPor: getSession()?.nombre || "",
  tramiteId: tramiteId || "",
  itemId: "",
  pasoClave: "",
});

// Registro de cargos de mesa de partes. Sin `tramiteId` es la pantalla general
// (por defecto, los de hoy); con `tramiteId` es la pestaña de un contrato.
export default function CargosPanel({ tramiteId }) {
  const enContrato = Boolean(tramiteId);
  const [filtros, setFiltros] = useState(() => (enContrato
    ? { desde: "", hasta: "", entidad: "", emisor: "", texto: "", tramiteId: "" }
    : { desde: hoyISO(), hasta: hoyISO(), entidad: "", emisor: "", texto: "", tramiteId: "" }));
  const [, setRevision] = useState(0);
  const [formulario, setFormulario] = useState(null);
  const [archivo, setArchivo] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const registrar = puede("registrar");
  const corregir = puede("corregir");
  const eliminar = puede("borrar_doc");
  const descargar = puede("descargar");

  const tramites = listTramites();
  const tramitesPorId = Object.fromEntries(tramites.map((t) => [t.id, t]));
  const consorcios = tramites.filter((t) => t.ejecutor?.tipo === "consorcio");
  const cargos = listarCargos({ ...filtros, tramiteId: tramiteId || filtros.tramiteId });
  const refrescar = () => setRevision((n) => n + 1);

  const poner = (campo, valor) => setFiltros((f) => ({ ...f, [campo]: valor }));
  const ponerForm = (campo, valor) => setFormulario((f) => ({ ...f, [campo]: valor }));

  const hitos = formulario?.tramiteId ? listItems(formulario.tramiteId).filter((i) => i.estado !== "No aplica") : [];
  const hitoElegido = hitos.find((i) => i.id === formulario?.itemId);
  const pasosDelHito = (hitoElegido?.pasos || []).filter((p) => p.responsable === "contratista");

  const cambiarContrato = (id) => setFormulario((f) => ({
    ...f, tramiteId: id, itemId: "", pasoClave: "", entidad: f.entidad || tramitesPorId[id]?.entidad || "",
  }));

  const guardar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    let subido = null;
    try {
      if (archivo) {
        subido = await guardarArchivo(archivo, { tramiteId: formulario.tramiteId, tareaId: formulario.itemId, tipoDoc: "Cargo", nombre: archivo.name });
      }
      try {
        registrarCargo({
          ...formulario,
          tramiteId: formulario.tramiteId || null,
          itemId: formulario.itemId || null,
          pasoClave: formulario.itemId ? formulario.pasoClave || null : null,
          archivoCargoId: subido?.archivoId,
          archivoCargoNombre: subido?.nombre,
        });
      } catch (err) {
        if (subido) await eliminarArchivo(subido.archivoId).catch(() => {});
        throw err;
      }
      setFormulario(null);
      setArchivo(null);
      setError("");
      refrescar();
    } catch (err) {
      setError(err?.message || "No se pudo registrar el cargo.");
    } finally {
      setGuardando(false);
    }
  };

  const intentar = (accion) => {
    try {
      accion();
      setError("");
      refrescar();
    } catch (err) {
      setError(err?.message || "No se pudo completar la acción.");
    }
  };

  const anular = (c) => {
    const motivo = window.prompt(`Motivo para anular el cargo ${c.numeroRegistro}:`);
    if (motivo === null) return;
    intentar(() => anularCargo(c.id, motivo));
  };

  const quitar = (c) => {
    if (!window.confirm(`¿Eliminar definitivamente el cargo ${c.numeroRegistro}? Se borra también el sello escaneado y queda anotado en el historial.`)) return;
    intentar(() => eliminarCargo(c.id));
  };

  const exportar = () => {
    const rango = filtros.desde || filtros.hasta ? `${filtros.desde || "inicio"}_${filtros.hasta || "hoy"}` : "todos";
    descargarTexto(cargosACsv(cargos, tramitesPorId), `acrodocs_cargos_${rango}.csv`, "text/csv;charset=utf-8");
  };

  return (
    <div>
      {error && <div className="alerta">{error}</div>}

      <div className="tarjeta">
        <div className="tarjeta-cab">
          <h3>{enContrato ? "Cargos de este contrato" : "Cargos de mesa de partes"}</h3>
          <div className="chips">
            <span className="badge azul">{cargos.length} cargo(s)</span>
            {descargar && <button type="button" className="btn mini" disabled={cargos.length === 0} onClick={exportar}>Exportar CSV</button>}
            {registrar && (
              <button type="button" className="btn mini primario" onClick={() => { setError(""); setArchivo(null); setFormulario(formularioVacio(tramiteId, tramitesPorId[tramiteId])); }}>
                Registrar cargo
              </button>
            )}
          </div>
        </div>
        <div className="cuerpo">
          <div className="grid-form">
            <label className="campo-grupo"><span className="campo">Desde</span><input type="date" value={filtros.desde} onChange={(e) => poner("desde", e.target.value)} /></label>
            <label className="campo-grupo"><span className="campo">Hasta</span><input type="date" value={filtros.hasta} onChange={(e) => poner("hasta", e.target.value)} /></label>
            {!enContrato && (
              <label className="campo-grupo">
                <span className="campo">Contrato</span>
                <select value={filtros.tramiteId} onChange={(e) => poner("tramiteId", e.target.value)}>
                  <option value="">Todos</option>
                  {tramites.map((t) => <option key={t.id} value={t.id}>{t.codigo}</option>)}
                </select>
              </label>
            )}
            <label className="campo-grupo"><span className="campo">Entidad</span><input value={filtros.entidad} onChange={(e) => poner("entidad", e.target.value)} /></label>
            <label className="campo-grupo">
              <span className="campo">Emisor</span>
              <select value={filtros.emisor} onChange={(e) => poner("emisor", e.target.value)}>
                <option value="">Todos</option>
                <option value="empresa">Empresa</option>
                {consorcios.map((t) => <option key={t.id} value={t.id}>{nombreEjecutor(t)}</option>)}
              </select>
            </label>
            <label className="campo-grupo"><span className="campo">Buscar</span><input value={filtros.texto} onChange={(e) => poner("texto", e.target.value)} placeholder="N.º, asunto, oficina…" /></label>
          </div>

          {cargos.length === 0 && <div className="vacio">{enContrato ? "Este contrato todavía no tiene cargos." : "No hay cargos con estos filtros."}</div>}
          {cargos.map((c) => (
            <div className="catalogo-hito-fila" key={c.id} style={c.anulado ? { opacity: 0.6 } : undefined}>
              <div>
                <strong style={c.anulado ? { textDecoration: "line-through" } : undefined}>
                  {c.numeroRegistro} · {c.asunto}
                </strong>
                <span className="ref">
                  {fecha(c.fecha)}{c.hora ? ` ${c.hora}` : ""} · {c.entidad}{c.oficina ? ` · ${c.oficina}` : ""} · {ROTULO_TIPO[c.tipoDocumento]}{c.numeroDocumento ? ` ${c.numeroDocumento}` : ""}
                </span>
                <span className="ref">
                  Emisor: {c.emisorNombre}{c.tramiteId ? ` · ${tramitesPorId[c.tramiteId]?.codigo || "Contrato"}` : " · sin contrato"}
                  {c.hitoCodigo ? ` · Hito ${c.hitoCodigo}` : ""}{c.presentadoPor ? ` · Presentó ${c.presentadoPor}` : ""}
                </span>
                {c.anulado && <span className="ref">Anulado: {c.motivoAnulacion}</span>}
              </div>
              <div className="chips">
                {c.anulado && <span className="badge gris">Anulado</span>}
                {c.movimientoId && !c.anulado && <span className="badge verde">Cumple un paso</span>}
                {c.archivoCargoId && descargar && (
                  <button type="button" className="btn mini" onClick={() => descargarArchivo(c.archivoCargoId, c.archivoCargoNombre).catch((e) => setError(e.message))}>Ver cargo</button>
                )}
                {corregir && !c.anulado && <button type="button" className="btn mini" onClick={() => anular(c)}>Anular</button>}
                {eliminar && <button type="button" className="btn-icono peligro" title="Eliminar definitivamente" onClick={() => quitar(c)}>×</button>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {formulario && (
        <div className="modal-fondo" onClick={(e) => e.target === e.currentTarget && setFormulario(null)}>
          <form className="modal" onSubmit={guardar}>
            <div className="modal-cab">
              <h3>Registrar cargo</h3>
              <button type="button" className="cerrar" onClick={() => setFormulario(null)} aria-label="Cerrar">×</button>
            </div>
            <div className="modal-cuerpo">
              {error && <div className="alerta">{error}</div>}
              <div className="grid-form">
                <label className="campo-grupo"><span className="campo">Fecha de recepción</span><input type="date" required value={formulario.fecha} onChange={(e) => ponerForm("fecha", e.target.value)} /></label>
                <label className="campo-grupo"><span className="campo">Hora</span><input type="time" value={formulario.hora} onChange={(e) => ponerForm("hora", e.target.value)} /></label>
                <label className="campo-grupo ancho-completo"><span className="campo">Entidad</span><input required value={formulario.entidad} onChange={(e) => ponerForm("entidad", e.target.value)} /></label>
                <label className="campo-grupo"><span className="campo">Oficina</span><input value={formulario.oficina} onChange={(e) => ponerForm("oficina", e.target.value)} placeholder="Mesa de partes, Logística…" /></label>
                <label className="campo-grupo"><span className="campo">N.º de registro del cargo</span><input required value={formulario.numeroRegistro} onChange={(e) => ponerForm("numeroRegistro", e.target.value)} /></label>
                <label className="campo-grupo">
                  <span className="campo">Tipo de documento</span>
                  <select value={formulario.tipoDocumento} onChange={(e) => ponerForm("tipoDocumento", e.target.value)}>
                    {TIPOS_DOCUMENTO.map((t) => <option key={t} value={t}>{ROTULO_TIPO[t]}</option>)}
                  </select>
                </label>
                <label className="campo-grupo"><span className="campo">N.º del documento</span><input value={formulario.numeroDocumento} onChange={(e) => ponerForm("numeroDocumento", e.target.value)} placeholder="Carta N.º 015-2026" /></label>
                <label className="campo-grupo ancho-completo"><span className="campo">Asunto</span><input required value={formulario.asunto} onChange={(e) => ponerForm("asunto", e.target.value)} /></label>
                <label className="campo-grupo">
                  <span className="campo">Emisor</span>
                  <select value={formulario.emisor} onChange={(e) => ponerForm("emisor", e.target.value)}>
                    <option value="empresa">Empresa</option>
                    {consorcios.map((t) => <option key={t.id} value={t.id}>{nombreEjecutor(t)}</option>)}
                  </select>
                </label>
                <label className="campo-grupo"><span className="campo">Lo presentó</span><input value={formulario.presentadoPor} onChange={(e) => ponerForm("presentadoPor", e.target.value)} /></label>
                <label className="campo-grupo">
                  <span className="campo">Contrato (opcional)</span>
                  <select disabled={enContrato} value={formulario.tramiteId} onChange={(e) => cambiarContrato(e.target.value)}>
                    <option value="">Sin contrato</option>
                    {tramites.map((t) => <option key={t.id} value={t.id}>{t.codigo}</option>)}
                  </select>
                </label>
                <label className="campo-grupo">
                  <span className="campo">Hito (opcional)</span>
                  <select disabled={!formulario.tramiteId} value={formulario.itemId} onChange={(e) => setFormulario((f) => ({ ...f, itemId: e.target.value, pasoClave: "" }))}>
                    <option value="">Ninguno</option>
                    {hitos.map((i) => <option key={i.id} value={i.id}>{i.codigo} {i.nombre}</option>)}
                  </select>
                </label>
                {pasosDelHito.length > 0 && (
                  <label className="campo-grupo ancho-completo">
                    <span className="campo">Paso que cumple este cargo (opcional)</span>
                    <select value={formulario.pasoClave} onChange={(e) => ponerForm("pasoClave", e.target.value)}>
                      <option value="">Solo guardar el cargo</option>
                      {pasosDelHito.map((p) => <option key={p.clave} value={p.clave}>{p.nombre}</option>)}
                    </select>
                    <span className="ref">Al elegir un paso, la fecha de recepción cuenta como la presentación y arranca el plazo de la otra parte.</span>
                  </label>
                )}
                <label className="campo-grupo ancho-completo">
                  <span className="campo">Cargo sellado escaneado (opcional)</span>
                  <input type="file" onChange={(e) => setArchivo(e.target.files?.[0] || null)} />
                </label>
              </div>
            </div>
            <div className="modal-pie">
              <button type="button" className="btn" onClick={() => setFormulario(null)}>Cancelar</button>
              <button type="submit" className="btn primario" disabled={guardando}>{guardando ? "Guardando…" : "Guardar cargo"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
