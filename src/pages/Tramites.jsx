import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listTramites, createTramite, resumenTramite, nombreEjecutor, puede } from "../lib/store.js";
import EjecutorForm from "../components/EjecutorForm.jsx";

const fmt = (n) => new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 0 }).format(n || 0);
const fecha = (f) => (f ? new Date(`${f}T12:00:00`).toLocaleDateString("es-PE") : "—");

const inicial = {
  codigo: "", denominacion: "", entidad: "Municipalidad Distrital de San Jerónimo",
  ejecutor: { tipo: "empresa" }, tipo_objeto: "Obra", area: "Infraestructura", monto: "",
  fecha_suscripcion: "", fecha_inicio: "", fecha_fin: "", estado: "En ejecución",
};

const esConsorcio = (t) => t.ejecutor?.tipo === "consorcio";

export default function Tramites() {
  const puedeCrear = puede("crear");
  const [tramites, setTramites] = useState(listTramites());
  const [buscar, setBuscar] = useState("");
  const [estado, setEstado] = useState("Todos");
  // "todos" | "empresa" | "consorcios" | "c:<nombre del consorcio>"
  const [ejecutorFiltro, setEjecutorFiltro] = useState("todos");
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState(inicial);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  // Nombre visible del ejecutor de cada contrato, calculado una vez por lista.
  const nombres = useMemo(() => new Map(tramites.map((t) => [t.id, nombreEjecutor(t)])), [tramites]);
  const consorcios = useMemo(
    () => [...new Set(tramites.filter(esConsorcio).map((t) => nombres.get(t.id)))].sort((a, b) => a.localeCompare(b, "es")),
    [tramites, nombres]
  );

  const coincideEjecutor = (t) => {
    if (ejecutorFiltro === "todos") return true;
    if (ejecutorFiltro === "empresa") return !esConsorcio(t);
    if (ejecutorFiltro === "consorcios") return esConsorcio(t);
    return esConsorcio(t) && `c:${nombres.get(t.id)}` === ejecutorFiltro;
  };

  const filtrados = tramites.filter((t) => {
    const integrantes = (t.ejecutor?.integrantes || []).map((i) => i.razonSocial).join(" ");
    const texto = `${t.codigo} ${t.denominacion} ${t.entidad} ${nombres.get(t.id)} ${integrantes}`.toLowerCase();
    return texto.includes(buscar.toLowerCase()) && (estado === "Todos" || t.estado === estado) && coincideEjecutor(t);
  });

  const guardar = (e) => {
    e.preventDefault();
    if (!puedeCrear) return;
    if (!form.codigo.trim() || !form.denominacion.trim()) {
      setError("El código y la denominación son obligatorios.");
      return;
    }
    const t = createTramite(form);
    setTramites(listTramites());
    setMostrarForm(false);
    setForm(inicial);
    setError("");
    navigate(`/tramite/${t.id}`);
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div>
      <div className="vista-encabezado">
        <div>
          <div className="eyebrow">Registro de expedientes</div>
          <h2>Contratos de ejecución</h2>
          <p>Cada contrato abre un expediente numerado con hitos, plazos y documentos.</p>
        </div>
        {puedeCrear && <button className="btn primario" onClick={() => setMostrarForm(true)}>+ Nuevo contrato</button>}
      </div>

      <div className="tarjeta">
        <div className="barra-filtros">
          <input placeholder="Buscar por código, denominación o ejecutor…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
          <select value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option>Todos</option>
            <option>En ejecución</option>
            <option>Suscrito</option>
            <option>Recepcionado</option>
            <option>Liquidado</option>
            <option>Paralizado</option>
          </select>
          <select value={ejecutorFiltro} onChange={(e) => setEjecutorFiltro(e.target.value)} aria-label="Filtrar por ejecutor">
            <option value="todos">Todos los ejecutores</option>
            <option value="empresa">Empresa propia</option>
            <option value="consorcios">Todos los consorcios</option>
            {consorcios.map((nombre) => <option key={nombre} value={`c:${nombre}`}>{nombre}</option>)}
          </select>
          <span className="contador">{filtrados.length} resultado(s)</span>
        </div>

        <div className="tabla-wrap">
          <table className="tabla">
            <thead>
              <tr>
                <th>Código</th><th>Denominación</th><th>Objeto</th><th>Ejecutor</th>
                <th>Expediente</th><th>Ejecución</th><th>Estado</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((t) => {
                const r = resumenTramite(t.id);
                return (
                  <tr key={t.id}>
                    <td><Link className="codigo-link" to={`/tramite/${t.id}`}>{t.codigo}</Link></td>
                    <td>
                      <div className="celda-principal">{t.denominacion}</div>
                      <div className="ref">{t.entidad} · {fmt(t.monto)}</div>
                    </td>
                    <td><span className="badge azul">{t.tipo_objeto}</span></td>
                    <td>
                      <div className="celda-principal">{nombres.get(t.id)}</div>
                      <div className="ref">{esConsorcio(t) ? `Consorcio · ${(t.ejecutor.integrantes || []).length} integrante(s)` : "Ejecución directa"}</div>
                    </td>
                    <td>
                      <div className="avance-tabla">
                        <div className="barra"><div className="barra-fill" style={{ width: `${r.pct}%` }} /></div>
                        <span>{r.completados}/{r.total} · {r.pct}%</span>
                      </div>
                      <div className="ref">{r.docsCargados} archivo(s) · {r.requisitosPendientes} pendiente(s)</div>
                    </td>
                    <td className="fechas">{fecha(t.fecha_inicio)}<br /><span className="ref">al {fecha(t.fecha_fin)}</span></td>
                    <td><span className={`badge ${t.estado === "En ejecución" ? "verde" : t.estado === "Paralizado" ? "rojo" : "gris"}`}>{t.estado}</span></td>
                    <td><Link className="btn mini" to={`/tramite/${t.id}`}>Abrir</Link></td>
                  </tr>
                );
              })}
              {filtrados.length === 0 && <tr><td colSpan="8"><div className="vacio">No se encontraron contratos.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {puedeCrear && mostrarForm && (
        <div className="modal-fondo" onClick={(e) => e.target === e.currentTarget && setMostrarForm(false)}>
          <form className="modal" onSubmit={guardar}>
            <div className="modal-cab">
              <div>
                <h3>Nuevo contrato</h3>
                <span className="ref">Al guardar se crea automáticamente el expediente completo: hitos por etapa, plazos y documentos requeridos.</span>
              </div>
              <button type="button" className="cerrar" onClick={() => setMostrarForm(false)}>×</button>
            </div>
            <div className="modal-cuerpo">
              {error && <div className="alerta">{error}</div>}
              <div className="grid-form">
                <label className="campo-grupo"><span className="campo">Código *</span><input value={form.codigo} onChange={set("codigo")} placeholder="OC-2026-003" /></label>
                <label className="campo-grupo"><span className="campo">Tipo de objeto</span>
                  <select value={form.tipo_objeto} onChange={set("tipo_objeto")}>
                    <option>Obra</option><option>Consultoría de obra</option>
                  </select>
                </label>
                <label className="campo-grupo ancho-completo"><span className="campo">Denominación *</span><input value={form.denominacion} onChange={set("denominacion")} placeholder="Mejoramiento de…" /></label>
                <label className="campo-grupo"><span className="campo">Entidad</span><input value={form.entidad} onChange={set("entidad")} /></label>
                <label className="campo-grupo"><span className="campo">Área usuaria</span><input value={form.area} onChange={set("area")} /></label>
                <label className="campo-grupo"><span className="campo">Monto (S/)</span><input type="number" min="0" value={form.monto} onChange={set("monto")} /></label>
                <label className="campo-grupo"><span className="campo">Fecha de suscripción</span><input type="date" value={form.fecha_suscripcion} onChange={set("fecha_suscripcion")} /></label>
                <label className="campo-grupo"><span className="campo">Inicio</span><input type="date" value={form.fecha_inicio} onChange={set("fecha_inicio")} /></label>
                <label className="campo-grupo"><span className="campo">Fin</span><input type="date" value={form.fecha_fin} onChange={set("fecha_fin")} /></label>
                <EjecutorForm value={form.ejecutor} onChange={(ejecutor) => setForm({ ...form, ejecutor })} />
              </div>
            </div>
            <div className="modal-pie">
              <button type="button" className="btn" onClick={() => setMostrarForm(false)}>Cancelar</button>
              <button type="submit" className="btn primario">Crear contrato y expediente</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
