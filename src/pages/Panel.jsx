import React from "react";
import { Link } from "react-router-dom";
import {
  listTramites, listItems, resumenTramite, tareasConPlazo, hoyISO, puede, nombreEjecutor,
} from "../lib/store.js";
import { diasEntre } from "../lib/fechas.js";

const fmt = (n) => new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 0 }).format(n || 0);
const fecha = (f) => (f ? new Date(`${f}T12:00:00`).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }) : "—");

export default function Panel() {
  // Las alertas de vencimiento son para los roles con `alertas`, y solo sobre los
  // contratos que el usuario ve (listTramites y tareasConPlazo ya filtran).
  const verAlertas = puede("alertas");
  const tramites = listTramites();
  const resumenes = new Map(tramites.map((t) => [t.id, resumenTramite(t.id)]));
  const pendientes = [...resumenes.values()].reduce((n, r) => n + r.pendientes, 0);
  const docsPendientes = [...resumenes.values()].reduce((n, r) => n + r.requisitosPendientes, 0);
  const eventuales = tramites.reduce(
    (n, t) => n + listItems(t.id).filter((i) => i.tipo === "eventual" && i.estado !== "Completado").length,
    0
  );

  const alertas = [];
  for (const t of verAlertas ? tareasConPlazo() : []) {
    const dias = diasEntre(hoyISO(), t.fecha_limite);
    const silencio = t.silencioPositivo && dias < 0;
    if (dias < 0) {
      alertas.push({
        tipo: "rojo",
        texto: `${silencio ? "Posible silencio positivo: " : ""}${t.tramite_codigo} · ${t.codigo} ${t.nombre}: plazo vencido hace ${Math.abs(dias)} día(s).`,
        url: `/tramite/${t.tramite_id}?tarea=${t.id}`,
      });
    } else if (dias <= 7) {
      alertas.push({
        tipo: "ambar",
        texto: `${t.tramite_codigo} · ${t.codigo} ${t.nombre}: vence ${dias === 0 ? "hoy" : `en ${dias} día(s)`}.`,
        url: `/tramite/${t.tramite_id}?tarea=${t.id}`,
      });
    }
  }

  for (const t of verAlertas ? tramites : []) {
    const dias = t.fecha_fin ? diasEntre(hoyISO(), t.fecha_fin) : null;
    if (dias !== null && dias >= 0 && dias <= 30) {
      alertas.push({
        tipo: "ambar",
        texto: `Ejecución de ${t.codigo} termina en ${dias} día(s).`,
        url: `/tramite/${t.id}`,
      });
    }
  }

  const recientes = tramites.slice(0, 5);

  return (
    <div>
      <div className="vista-encabezado">
        <div>
          <div className="eyebrow">Seguimiento documentario bajo Ley 32069</div>
          <h2>Situación de los expedientes</h2>
          <p>Contratos, hitos y plazos legales en una sola ficha.</p>
        </div>
        <Link to="/tramites" className="btn primario">Abrir contratos</Link>
      </div>

      <div className="kpis">
        <div className="kpi"><div className="kpi-ico azul" aria-hidden="true">CT</div><div><div className="valor">{tramites.length}</div><div className="rotulo">Contratos registrados</div></div></div>
        <div className="kpi"><div className="kpi-ico violeta" aria-hidden="true">HI</div><div><div className="valor">{pendientes}</div><div className="rotulo">Hitos pendientes</div></div></div>
        <div className="kpi"><div className="kpi-ico ambar" aria-hidden="true">RQ</div><div><div className="valor">{docsPendientes}</div><div className="rotulo">Requisitos sin archivo</div></div></div>
        {verAlertas && (
          <div className="kpi"><div className="kpi-ico rojo" aria-hidden="true">AL</div><div><div className="valor">{alertas.length}</div><div className="rotulo">Alertas de plazo</div></div></div>
        )}
      </div>

      <div className="grid-2">
        <div className="tarjeta">
          <div className="tarjeta-cab"><h3>Ficha de contratos</h3></div>
          <div className="cuerpo">
            {recientes.length === 0 && <div className="vacio">No hay contratos registrados.</div>}
            {recientes.map((t) => (
              <Link to={`/tramite/${t.id}`} key={t.id} className="fila-tramite">
                <div className="fila-principal">
                  <div className="codigo">{t.codigo}</div>
                  <strong>{t.denominacion}</strong>
                  <div className="ref">{t.entidad} · {nombreEjecutor(t)}</div>
                </div>
                <div className="fila-lado">
                  <span className="badge azul">{t.tipo_objeto}</span>
                  <span className="monto">{fmt(t.monto)}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {verAlertas && (
        <div className="tarjeta">
          <div className="tarjeta-cab">
            <h3>Alertas y vencimientos</h3>
            {eventuales > 0 && <span className="badge violeta">{eventuales} trámite(s) eventual(es)</span>}
          </div>
          <div className="cuerpo">
            {alertas.length === 0 && <div className="vacio">No hay plazos próximos ni vencidos.</div>}
            {alertas.slice(0, 10).map((a, i) => (
              <div key={i} className={`alerta-item ${a.tipo}`}>
                <span className="punto" />
                <div>{a.texto}</div>
                <Link className="btn mini" to={a.url}>Abrir</Link>
              </div>
            ))}
            {alertas.length > 10 && <div className="ref">Hay {alertas.length - 10} alerta(s) más en los expedientes.</div>}
          </div>
        </div>
        )}
      </div>

      <div className="tarjeta">
        <div className="tarjeta-cab"><h3>Avance de expedientes</h3></div>
        <div className="cuerpo">
          {tramites.map((t) => {
            const r = resumenes.get(t.id) || { total: 0, completados: 0, pct: 0, requisitosPendientes: 0 };
            const dias = t.fecha_fin ? diasEntre(hoyISO(), t.fecha_fin) : null;
            return (
              <div key={t.id} className="progreso-fila">
                <div className="progreso-datos">
                  <Link to={`/tramite/${t.id}`}><strong>{t.codigo}</strong></Link>
                  <span className="ref">{t.denominacion}</span>
                  {dias === null
                    ? <span className="badge gris">Sin fecha de fin</span>
                    : <span className={`badge ${dias < 0 ? "rojo" : dias <= 30 ? "ambar" : "verde"}`}>
                        {dias < 0 ? "Plazo vencido" : `Vence en ${dias} días`}
                      </span>}
                  {r.requisitosPendientes > 0 && <span className="badge ambar">{r.requisitosPendientes} docs. pendientes</span>}
                </div>
                <div className="barra"><div className="barra-fill" style={{ width: `${r.pct}%` }} /></div>
                <div className="progreso-pie"><span>{r.completados}/{r.total} hitos</span><span>{r.pct}%</span></div>
              </div>
            );
          })}
          {tramites.length === 0 && <div className="vacio">No hay contratos registrados.</div>}
        </div>
      </div>
    </div>
  );
}
