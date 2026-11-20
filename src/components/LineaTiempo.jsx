import React, { useState } from "react";
import {
  flujoDeItem, listarMovimientos, registrarMovimiento, anularMovimiento, activarPasos,
  registrarSilencio, pasosDisponibles, hoyISO,
} from "../lib/store.js";
import { diasEntre } from "../lib/fechas.js";
import { guardarArchivo, descargarArchivo, eliminarArchivo } from "../lib/archivos.js";
import { TomarFoto } from "./SubirArchivo.jsx";

const fecha = (f) => (f ? new Date(`${f}T12:00:00`).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }) : "—");

const RESPONSABLE = { contratista: "Contratista", supervision: "Supervisión", entidad: "Entidad" };
const MARCA = { cumplido: "✔", actual: "●", pendiente: "○", sin_respuesta: "⊘" };
const TIPO_MOV = {
  asiento: "Asiento de cuaderno", presentado: "Presentado", observado: "Observado", levantado: "Observaciones levantadas",
  conformidad: "Conformidad", pronunciamiento: "Pronunciamiento", otro: "Otro",
};

// Tipos de movimiento que se ofrecen en un paso según quién lo tiene a cargo.
const tiposDelPaso = (paso) => {
  if (paso.responsable === "contratista") return paso.tipoRegistro === "asiento" ? ["asiento", "otro"] : ["presentado", "asiento", "otro"];
  return ["conformidad", "pronunciamiento", "observado", "otro"];
};

const textoPlazo = (paso, hoy) => {
  if (paso.estado === "sin_respuesta") return "Sin respuesta";
  if (!paso.fechaLimite) return Number(paso.plazoDias) > 0 ? "Plazo corre desde un paso pendiente" : "Plazo sin definir";
  if (paso.estado === "cumplido") return `Vencía ${fecha(paso.fechaLimite)}`;
  const dias = diasEntre(hoy, paso.fechaLimite);
  if (dias < 0) return `Venció el ${fecha(paso.fechaLimite)} (hace ${Math.abs(dias)} día(s))`;
  return `Vence el ${fecha(paso.fechaLimite)}${dias === 0 ? " (hoy)" : ` (en ${dias} día(s))`}`;
};

// Seguimiento por pasos de un hito: línea de tiempo, registro de movimientos,
// observaciones y silencio positivo (§5.5 y §5.9). Cada botón sigue su permiso.
export default function LineaTiempo({ item, permiso, onCambio }) {
  const [error, setError] = useState("");
  const [formulario, setFormulario] = useState(null);
  const [archivo, setArchivo] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const hoy = hoyISO();

  const intentar = (accion) => {
    try {
      accion();
      setError("");
      onCambio?.();
    } catch (e) {
      setError(e?.message || "No se pudo completar la acción.");
    }
  };

  const flujo = flujoDeItem(item.id);

  if (!flujo) {
    if (!permiso.estado || !pasosDisponibles(item.id)) return null;
    return (
      <div className="catalogo-hito">
        <div className="catalogo-hito-cab">
          <div>
            <h4>Seguimiento por pasos</h4>
            <span className="ref">Este trámite se puede seguir paso a paso: contratista, supervisión y entidad, cada uno con su plazo.</span>
          </div>
          <button type="button" className="btn mini" onClick={() => intentar(() => activarPasos(item.id))}>Activar seguimiento por pasos</button>
        </div>
        {error && <div className="alerta" style={{ marginTop: 8 }}>{error}</div>}
      </div>
    );
  }

  const movimientos = listarMovimientos(item.id);
  const pasoActual = flujo.actual >= 0 ? flujo.pasos[flujo.actual] : null;
  const puedeRegistrar = permiso.registrar && pasoActual && !flujo.observado;

  const abrirFormulario = (tipo, paso) => {
    setArchivo(null);
    setFormulario({
      pasoClave: paso.clave,
      tipo,
      fecha: hoy,
      numeroDocumento: "",
      asientoCO: "",
      nota: "",
    });
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (!formulario) return;
    setGuardando(true);
    let subido = null;
    try {
      if (archivo) {
        subido = await guardarArchivo(archivo, { tramiteId: item.tramite_id, tareaId: item.id, tipoDoc: "Movimiento", nombre: archivo.name, permiso: "registrar" });
      }
      try {
        registrarMovimiento(item.id, { ...formulario, archivoId: subido?.archivoId, archivoNombre: subido?.nombre });
      } catch (err) {
        if (subido) await eliminarArchivo(subido.archivoId).catch(() => {});
        throw err;
      }
      setFormulario(null);
      setArchivo(null);
      setError("");
      onCambio?.();
    } catch (err) {
      setError(err?.message || "No se pudo registrar el movimiento.");
    } finally {
      setGuardando(false);
    }
  };

  const anular = (m) => {
    const motivo = window.prompt(`Motivo para anular «${TIPO_MOV[m.tipo] || m.tipo}» del ${fecha(m.fecha)}:`);
    if (motivo === null) return;
    intentar(() => anularMovimiento(m.id, motivo));
  };

  const confirmarSilencio = () => {
    if (!window.confirm("¿Registrar que la entidad aprobó por silencio positivo? Quedará anotado en el trámite con la fecha del día siguiente al vencimiento.")) return;
    intentar(() => registrarSilencio(item.id));
  };

  const porPaso = (clave) => movimientos.filter((m) => m.pasoClave === clave);

  return (
    <div className="catalogo-hito">
      <div className="catalogo-hito-cab">
        <div>
          <h4>Seguimiento por pasos</h4>
          <span className="ref">
            {flujo.estado === "Completado" ? "Todos los pasos cumplidos" : `A cargo de: ${RESPONSABLE[flujo.aCargo] || "—"}`}
            {flujo.ciclo > 0 ? ` · Observación ${flujo.ciclo}` : ""}
          </span>
        </div>
        <div className="chips">
          {puedeRegistrar && <button type="button" className="btn mini primario" onClick={() => abrirFormulario(tiposDelPaso(pasoActual)[0], pasoActual)}>Registrar</button>}
          {permiso.registrar && flujo.observado && pasoActual && (
            <button type="button" className="btn mini primario" onClick={() => abrirFormulario("levantado", pasoActual)}>Levantar observaciones</button>
          )}
        </div>
      </div>

      {error && <div className="alerta" style={{ marginTop: 8 }}>{error}</div>}

      {flujo.silencioVencido && (
        <div className="alerta" style={{ marginTop: 8 }}>
          Posible aprobación por silencio: la entidad no se pronunció; el plazo venció el {fecha(pasoActual.fechaLimite)}.
          {permiso.registrar && <> <button type="button" className="btn mini" onClick={confirmarSilencio}>Registrar aprobación por silencio</button></>}
        </div>
      )}
      {flujo.observado && (
        <div className="nota-info" style={{ marginTop: 8 }}>
          Observado por {RESPONSABLE[pasoActual?.responsable] || "la otra parte"}.
          {flujo.levantamientoLimite ? ` Plazo para levantar: ${fecha(flujo.levantamientoLimite)}.` : ""}
        </div>
      )}

      <ol style={{ listStyle: "none", padding: 0, margin: "10px 0 0" }}>
        {flujo.pasos.map((paso) => {
          const hechos = porPaso(paso.clave);
          return (
            <li key={paso.clave} style={{ padding: "8px 0", borderTop: "1px solid var(--line-soft)", opacity: paso.estado === "pendiente" ? 0.75 : 1 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                <span aria-hidden="true" style={{ width: 18 }}>{MARCA[paso.estado]}</span>
                <strong>{paso.nombre}</strong>
                <span className="badge gris">{RESPONSABLE[paso.responsable]}</span>
                {!paso.verificado && Number(paso.plazoDias) > 0 && <span className="badge ambar">Plazo por verificar</span>}
              </div>
              <div className="ref" style={{ marginLeft: 28 }}>{textoPlazo(paso, hoy)}</div>
              {hechos.map((m) => (
                <div key={m.id} style={{ marginLeft: 28, fontSize: 12, textDecoration: m.anulado ? "line-through" : "none", color: m.anulado ? "var(--muted)" : "inherit" }}>
                  {TIPO_MOV[m.tipo] || m.tipo} · {fecha(m.fecha)}{m.hora ? ` ${m.hora}` : ""}
                  {m.numeroDocumento ? ` · Doc. ${m.numeroDocumento}` : ""}
                  {m.asientoCO ? ` · Asiento ${m.asientoCO}` : ""}
                  {m.nota ? ` · ${m.nota}` : ""}
                  {m.archivoId && (
                    <> · <button type="button" className="btn mini" onClick={() => descargarArchivo(m.archivoId, m.archivoNombre).catch((e) => setError(e.message))}>{m.archivoNombre || "Archivo"}</button></>
                  )}
                  {m.cargoId && <> · cargo registrado</>}
                  {m.anulado && <span style={{ textDecoration: "none", display: "inline-block", marginLeft: 6 }}>(anulado: {m.motivoAnulacion})</span>}
                  {!m.anulado && permiso.corregir && (
                    <button type="button" className="btn-icono peligro" title="Anular movimiento" onClick={() => anular(m)}>×</button>
                  )}
                </div>
              ))}
            </li>
          );
        })}
      </ol>

      {formulario && (
        <form onSubmit={guardar} style={{ borderTop: "1px solid var(--line)", marginTop: 10, paddingTop: 10 }}>
          <div className="grid-form">
            <label className="campo-grupo">
              <span className="campo">Qué se registra</span>
              <select
                value={formulario.tipo}
                disabled={formulario.tipo === "levantado"}
                onChange={(e) => setFormulario({ ...formulario, tipo: e.target.value })}
              >
                {(formulario.tipo === "levantado" ? ["levantado"] : tiposDelPaso(flujo.pasos.find((p) => p.clave === formulario.pasoClave))).map((t) => (
                  <option key={t} value={t}>{TIPO_MOV[t]}</option>
                ))}
              </select>
            </label>
            <label className="campo-grupo">
              <span className="campo">Fecha</span>
              <input type="date" required value={formulario.fecha} onChange={(e) => setFormulario({ ...formulario, fecha: e.target.value })} />
            </label>
            <label className="campo-grupo">
              <span className="campo">N.º de documento (carta, oficio)</span>
              <input value={formulario.numeroDocumento} onChange={(e) => setFormulario({ ...formulario, numeroDocumento: e.target.value })} />
            </label>
            <label className="campo-grupo">
              <span className="campo">Asiento del cuaderno de obra</span>
              <input value={formulario.asientoCO} onChange={(e) => setFormulario({ ...formulario, asientoCO: e.target.value })} />
            </label>
            <label className="campo-grupo ancho-completo">
              <span className="campo">Nota</span>
              <input value={formulario.nota} onChange={(e) => setFormulario({ ...formulario, nota: e.target.value })} />
            </label>
            <label className="campo-grupo ancho-completo">
              <span className="campo">Archivo (cargo, carta o informe; opcional)</span>
              <input type="file" onChange={(e) => setArchivo(e.target.files?.[0] || null)} />
            </label>
            <div className="ancho-completo">
              <TomarFoto onChange={(e) => setArchivo(e.target.files?.[0] || null)} />
              {archivo && <span className="ref"> Archivo elegido: {archivo.name}</span>}
            </div>
          </div>
          <div className="chips">
            <button type="submit" className="btn primario" disabled={guardando}>{guardando ? "Guardando…" : "Guardar movimiento"}</button>
            <button type="button" className="btn" onClick={() => setFormulario(null)}>Cancelar</button>
          </div>
        </form>
      )}
    </div>
  );
}
