import React, { useState } from "react";
import {
  normalizarPasos, alertasDesdeTexto, claveUnica, pasoNuevo, ALERTAS_POR_DEFECTO,
  RESPONSABLES_PASO, TIPOS_REGISTRO_PASO,
} from "../lib/catalogo.js";

const ROTULO_RESPONSABLE = { contratista: "Contratista", supervision: "Supervisión", entidad: "Entidad" };
const ROTULO_REGISTRO = { asiento: "Asiento de cuaderno", presentacion: "Presentación", respuesta: "Respuesta", otro: "Otro" };

// Ventana para editar una plantilla del catálogo: un hito, una sección
// recurrente, un trámite eventual o un hito opcional. Trabaja sobre una copia y
// solo entrega el resultado al pulsar "Aplicar".
export default function EditorPlantilla({ plantilla, tipo, soloLectura, onAplicar, onCerrar }) {
  const [f, setF] = useState(() => ({
    ...JSON.parse(JSON.stringify(plantilla)),
    docsTxt: (plantilla.docs || []).join("\n"),
    levantaOn: Boolean(plantilla.plazoLevantamiento),
    levantaDias: plantilla.plazoLevantamiento?.dias ?? 5,
    levantaHabiles: plantilla.plazoLevantamiento?.habiles !== false,
    pasos: (plantilla.pasos || []).map((p) => ({ ...p, alertasTxt: (p.alertas || ALERTAS_POR_DEFECTO).join(", ") })),
  }));
  const [error, setError] = useState("");

  const poner = (campo, valor) => setF((a) => ({ ...a, [campo]: valor }));
  const docs = f.docsTxt.split("\n").map((d) => d.trim()).filter(Boolean);

  const ponerPaso = (i, campo, valor) =>
    setF((a) => ({ ...a, pasos: a.pasos.map((p, k) => (k === i ? { ...p, [campo]: valor } : p)) }));
  const agregarPaso = () =>
    setF((a) => {
      const clave = claveUnica("paso", a.pasos.map((p) => p.clave));
      return { ...a, pasos: [...a.pasos, { ...pasoNuevo(), clave, nombre: "Nuevo paso", alertasTxt: ALERTAS_POR_DEFECTO.join(", ") }] };
    });
  const quitarPaso = (i) => setF((a) => ({ ...a, pasos: a.pasos.filter((_, k) => k !== i) }));
  const moverPaso = (i, dir) =>
    setF((a) => {
      const pasos = [...a.pasos];
      const j = i + dir;
      if (j < 0 || j >= pasos.length) return a;
      [pasos[i], pasos[j]] = [pasos[j], pasos[i]];
      return { ...a, pasos };
    });

  const aplicar = (e) => {
    e.preventDefault();
    if (!f.nombre.trim()) {
      setError("Escribe el nombre.");
      return;
    }
    const { docsTxt, levantaOn, levantaDias, levantaHabiles, ...resto } = f;
    const pasos = normalizarPasos(f.pasos.map(({ alertasTxt, ...p }) => ({ ...p, alertas: alertasDesdeTexto(alertasTxt) })));
    onAplicar({
      ...resto,
      nombre: f.nombre.trim(),
      docs,
      cumplimiento: docs.includes(f.cumplimiento) ? f.cumplimiento : "",
      plazoDias: Math.max(0, Number(f.plazoDias) || 0),
      pasos,
      plazoLevantamiento: levantaOn ? { dias: Math.max(0, Number(levantaDias) || 0), habiles: levantaHabiles } : null,
    });
  };

  const dis = Boolean(soloLectura);
  const sinPasosPorTipo = tipo === "recurrente" ? "Los pasos de una sección recurrente se copian a cada periodo." : "";

  return (
    <div className="modal-fondo" onClick={(e) => e.target === e.currentTarget && onCerrar()}>
      <form className="modal modal-tarea" onSubmit={aplicar}>
        <div className="modal-cab">
          <h3>{dis ? "Ver" : "Editar"} {tipo === "eventual" ? "trámite eventual" : tipo === "opcional" ? "hito opcional" : "hito"}</h3>
          <button type="button" className="cerrar" onClick={onCerrar} aria-label="Cerrar">×</button>
        </div>
        <div className="modal-cuerpo modal-tarea-cuerpo">
          {error && <div className="alerta">{error}</div>}
          <div className="grid-form">
            <label className="campo-grupo ancho-completo">
              <span className="campo">Nombre</span>
              <input value={f.nombre} disabled={dis} onChange={(e) => poner("nombre", e.target.value)} />
            </label>
            <label className="campo-grupo ancho-completo">
              <span className="campo">Documentos requeridos (uno por línea)</span>
              <textarea rows={4} value={f.docsTxt} disabled={dis} onChange={(e) => poner("docsTxt", e.target.value)} />
            </label>
            <label className="campo-grupo">
              <span className="campo">Documento que da por cumplido el hito</span>
              <select value={f.cumplimiento || ""} disabled={dis} onChange={(e) => poner("cumplimiento", e.target.value)}>
                <option value="">Manual</option>
                {docs.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            <label className="campo-grupo">
              <span className="campo">Plazo (días)</span>
              <input type="number" min="0" value={f.plazoDias} disabled={dis} onChange={(e) => poner("plazoDias", e.target.value)} />
            </label>
            <label className="campo-grupo">
              <span className="campo">El plazo cuenta desde</span>
              <select value={f.plazoBase} disabled={dis} onChange={(e) => poner("plazoBase", e.target.value)}>
                <option value="inicio">Inicio de ejecución</option>
                <option value="suscripcion">Suscripción del contrato</option>
                <option value="manual">Manual</option>
              </select>
            </label>
            <label className="campo-grupo">
              <span className="campo">Tipo de días</span>
              <select value={f.plazoHabiles ? "habiles" : "calendario"} disabled={dis} onChange={(e) => poner("plazoHabiles", e.target.value === "habiles")}>
                <option value="habiles">Hábiles</option>
                <option value="calendario">Calendario</option>
              </select>
            </label>
            <label className="campo-grupo ancho-completo">
              <span className="campo">Norma</span>
              <input value={f.norma} disabled={dis} onChange={(e) => poner("norma", e.target.value)} />
            </label>
            <label className="campo-grupo ancho-completo">
              <span className="campo">Nota</span>
              <textarea rows={2} value={f.nota} disabled={dis} onChange={(e) => poner("nota", e.target.value)} />
            </label>
            {tipo === "opcional" && (
              <>
                <label className="campo-grupo">
                  <span className="campo">Código de la etapa</span>
                  <input value={f.etapaCodigo || ""} disabled={dis} onChange={(e) => poner("etapaCodigo", e.target.value)} />
                </label>
                <label className="campo-grupo">
                  <span className="campo">Nombre de la etapa</span>
                  <input value={f.etapaNombre || ""} disabled={dis} onChange={(e) => poner("etapaNombre", e.target.value)} />
                </label>
              </>
            )}
            {tipo === "eventual" && (
              <label className="campo-grupo">
                <span className="campo">Silencio positivo</span>
                <select value={f.silencioPositivo ? "si" : "no"} disabled={dis} onChange={(e) => poner("silencioPositivo", e.target.value === "si")}>
                  <option value="no">No aplica</option>
                  <option value="si">Aplica si la entidad no se pronuncia</option>
                </select>
              </label>
            )}
          </div>

          <div className="chips" style={{ margin: "4px 0 12px" }}>
            <label><input type="checkbox" checked={f.activo !== false} disabled={dis} onChange={(e) => poner("activo", e.target.checked)} /> Activo (se genera en los contratos nuevos)</label>
            <label><input type="checkbox" checked={f.verificado === true} disabled={dis} onChange={(e) => poner("verificado", e.target.checked)} /> Plazo verificado contra la norma</label>
          </div>

          <div className="tarjeta-cab" style={{ padding: "8px 0" }}>
            <h3>Pasos del trámite</h3>
            {!dis && <button type="button" className="btn mini" onClick={agregarPaso}>+ Agregar paso</button>}
          </div>
          {sinPasosPorTipo && <div className="nota-info">{sinPasosPorTipo}</div>}
          {f.pasos.length === 0 && <div className="vacio">Sin pasos: el hito usa una sola fecha límite y el estado manual.</div>}
          {f.pasos.map((p, i) => (
            <div className="catalogo-hito" key={p.clave || i}>
              <div className="catalogo-hito-cab">
                <h4>Paso {i + 1} · <span className="ref">{p.clave}</span></h4>
                {!dis && (
                  <div className="chips">
                    <button type="button" className="btn-icono" title="Subir" disabled={i === 0} onClick={() => moverPaso(i, -1)}>↑</button>
                    <button type="button" className="btn-icono" title="Bajar" disabled={i === f.pasos.length - 1} onClick={() => moverPaso(i, 1)}>↓</button>
                    <button type="button" className="btn-icono peligro" title="Quitar paso" onClick={() => quitarPaso(i)}>×</button>
                  </div>
                )}
              </div>
              <div className="grid-form" style={{ marginTop: 8 }}>
                <label className="campo-grupo ancho-completo">
                  <span className="campo">Nombre</span>
                  <input value={p.nombre} disabled={dis} onChange={(e) => ponerPaso(i, "nombre", e.target.value)} />
                </label>
                <label className="campo-grupo">
                  <span className="campo">A cargo de</span>
                  <select value={p.responsable} disabled={dis} onChange={(e) => ponerPaso(i, "responsable", e.target.value)}>
                    {RESPONSABLES_PASO.map((r) => <option key={r} value={r}>{ROTULO_RESPONSABLE[r]}</option>)}
                  </select>
                </label>
                <label className="campo-grupo">
                  <span className="campo">Se registra como</span>
                  <select value={p.tipoRegistro} disabled={dis} onChange={(e) => ponerPaso(i, "tipoRegistro", e.target.value)}>
                    {TIPOS_REGISTRO_PASO.map((r) => <option key={r} value={r}>{ROTULO_REGISTRO[r]}</option>)}
                  </select>
                </label>
                <label className="campo-grupo">
                  <span className="campo">Plazo (días)</span>
                  <input type="number" min="0" value={p.plazoDias} disabled={dis} onChange={(e) => ponerPaso(i, "plazoDias", e.target.value)} />
                </label>
                <label className="campo-grupo">
                  <span className="campo">Tipo de días</span>
                  <select value={p.habiles === false ? "calendario" : "habiles"} disabled={dis} onChange={(e) => ponerPaso(i, "habiles", e.target.value === "habiles")}>
                    <option value="habiles">Hábiles</option>
                    <option value="calendario">Calendario</option>
                  </select>
                </label>
                <label className="campo-grupo">
                  <span className="campo">El plazo cuenta desde</span>
                  <select value={p.desde || ""} disabled={dis || i === 0} onChange={(e) => ponerPaso(i, "desde", e.target.value)}>
                    <option value="">{i === 0 ? "Plazo propio del hito" : "El paso anterior"}</option>
                    {f.pasos.slice(0, i).map((q) => <option key={q.clave} value={q.clave}>{q.nombre || q.clave}</option>)}
                  </select>
                </label>
                <label className="campo-grupo">
                  <span className="campo">Avisar (días antes)</span>
                  <input value={p.alertasTxt} disabled={dis} onChange={(e) => ponerPaso(i, "alertasTxt", e.target.value)} placeholder="5, 3, 1" />
                </label>
                <label className="campo-grupo">
                  <span className="campo">Si vence sin respuesta</span>
                  <select value={p.alVencer} disabled={dis} onChange={(e) => ponerPaso(i, "alVencer", e.target.value)}>
                    <option value="aviso">Solo avisar</option>
                    <option value="silencio_positivo">Posible silencio positivo</option>
                  </select>
                </label>
                <label className="campo-grupo">
                  <span className="campo">Plazo verificado</span>
                  <select value={p.verificado ? "si" : "no"} disabled={dis} onChange={(e) => ponerPaso(i, "verificado", e.target.value === "si")}>
                    <option value="no">Por verificar</option>
                    <option value="si">Verificado</option>
                  </select>
                </label>
              </div>
            </div>
          ))}

          {f.pasos.length > 0 && (
            <div className="chips" style={{ margin: "8px 0 12px" }}>
              <label><input type="checkbox" checked={f.levantaOn} disabled={dis} onChange={(e) => poner("levantaOn", e.target.checked)} /> Plazo para levantar observaciones</label>
              {f.levantaOn && (
                <>
                  <input type="number" min="0" style={{ width: 80 }} value={f.levantaDias} disabled={dis} onChange={(e) => poner("levantaDias", e.target.value)} />
                  <select value={f.levantaHabiles ? "habiles" : "calendario"} disabled={dis} onChange={(e) => poner("levantaHabiles", e.target.value === "habiles")}>
                    <option value="habiles">días hábiles</option>
                    <option value="calendario">días calendario</option>
                  </select>
                </>
              )}
            </div>
          )}
        </div>
        <div className="modal-pie">
          <button type="button" className="btn" onClick={onCerrar}>{dis ? "Cerrar" : "Cancelar"}</button>
          {!dis && <button type="submit" className="btn primario">Aplicar</button>}
        </div>
      </form>
    </div>
  );
}
