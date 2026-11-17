import React, { useMemo, useState } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import {
  getTramite, updateTramite, listItems, updateItem, addItem, removeItem,
  addTareaEventual, listarEventuales, listarHitosOpcionales, addHitoOpcional,
  agregarMesSCTR, getConfigFianzas, guardarConfigFianzas, guardarPlantilla,
  actualizarCatalogoPorClave, agregarCatalogoHito, moverItem, hoyISO, diasEntre,
} from "../lib/store.js";
import { TIPOS_FIANZA, catalogoDe } from "../lib/catalogo.js";
import {
  guardarArchivo, descargarArchivo, descargarComoZip, eliminarArchivo, formatearTamano, iconoArchivo,
} from "../lib/archivos.js";

const fmt = (n) => new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 0 }).format(n || 0);
const fecha = (f) => (f ? new Date(`${f}T12:00:00`).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const ESTADOS = ["Pendiente", "En revisión", "Completado", "Observado", "No aplica"];

const nombrePorEtiqueta = (etiqueta, nombreOriginal = "") => {
  const extension = nombreOriginal.includes(".") ? `.${nombreOriginal.split(".").pop()}` : "";
  const limpio = String(etiqueta || "Documento")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return `${limpio}${extension}`;
};

const claseEstado = (estado) =>
  estado === "Completado" ? "verde" : estado === "Observado" ? "rojo" : estado === "En revisión" ? "ambar" : "gris";

const estadoVencimiento = (tarea) => {
  if (!tarea?.fecha_limite) return "sin-plazo";
  if (tarea.estado === "Completado" || tarea.estado === "No aplica") return "sin-plazo";
  const dias = diasEntre(hoyISO(), tarea.fecha_limite);
  if (dias < 0) return "vencido";
  if (dias <= 7) return "por-vencer";
  return "vigente";
};

const textoVencimiento = (tarea) => {
  if (!tarea?.fecha_limite) return "Sin plazo";
  if (tarea.estado === "Completado") return "Cumplido";
  if (tarea.estado === "No aplica") return "No aplica";
  const dias = diasEntre(hoyISO(), tarea.fecha_limite);
  if (dias < 0) return `Vencido hace ${Math.abs(dias)} día(s)`;
  if (dias === 0) return "Vence hoy";
  return `Vence en ${dias} día(s)`;
};

const faltantes = (tarea) =>
  (tarea.docsRequeridos || []).filter(
    (req) => !(tarea.documentos || []).some((doc) => doc.tipoDoc === req)
  );

const silencioProducido = (tarea) =>
  Boolean(tarea.silencioPositivo) &&
  tarea.estado !== "Completado" &&
  tarea.estado !== "No aplica" &&
  Boolean(tarea.fecha_limite) &&
  diasEntre(hoyISO(), tarea.fecha_limite) < 0;

export default function TramiteDetalle({ session }) {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const soloLectura = session?.rol === "lectura";
  const [tramite, setTramite] = useState(getTramite(id));
  const [items, setItems] = useState(listItems(id));
  const [tab, setTab] = useState("expediente");
  const [buscar, setBuscar] = useState("");
  const [filtroEtapa, setFiltroEtapa] = useState("Todas");
  const [filtroEstado, setFiltroEstado] = useState("Todos");
  const [filtroDocs, setFiltroDocs] = useState("Todos");
  const [colapsadas, setColapsadas] = useState([]);
  const [tareaId, setTareaId] = useState(searchParams.get("tarea") || null);
  const [subiendo, setSubiendo] = useState("");
  const [errorArchivo, setErrorArchivo] = useState("");
  const [modalEventual, setModalEventual] = useState(false);
  const [eventualSel, setEventualSel] = useState("");
  const [modalHito, setModalHito] = useState(false);
  const [nuevoHito, setNuevoHito] = useState({ nombre: "", etapa: "Hitos propios" });
  const [guardarHitoEnCatalogo, setGuardarHitoEnCatalogo] = useState(false);
  const [notaCatalogo, setNotaCatalogo] = useState("");
  const [modalOpcional, setModalOpcional] = useState(false);
  const [opcionalSel, setOpcionalSel] = useState("");
  const [modalFianzas, setModalFianzas] = useState(false);
  const [configFianzas, setConfigFianzas] = useState(getConfigFianzas(id));
  const [nuevoDoc, setNuevoDoc] = useState("");
  const [guardarEnPlantilla, setGuardarEnPlantilla] = useState(true);
  const [editandoCatalogo, setEditandoCatalogo] = useState(false);
  const [catalogoModo, setCatalogoModo] = useState("editar");
  const [catalogoForm, setCatalogoForm] = useState({});
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState(tramite || {});

  const tarea = useMemo(
    () => items.find((i) => i.id === tareaId) || null,
    [items, tareaId]
  );

  const resumen = useMemo(() => {
    const aplicables = items.filter((i) => i.estado !== "No aplica");
    const total = aplicables.length;
    const completados = aplicables.filter((i) => i.estado === "Completado").length;
    const observados = aplicables.filter((i) => i.estado === "Observado").length;
    let docsRequeridos = 0;
    let docsCargados = 0;
    let requisitosPendientes = 0;
    for (const t of aplicables) {
      const reqs = t.docsRequeridos || [];
      const docs = t.documentos || [];
      docsRequeridos += reqs.length;
      docsCargados += docs.length;
      requisitosPendientes += faltantes(t).length;
    }
    return {
      total,
      completados,
      observados,
      pendientes: total - completados,
      pct: total ? Math.round((completados / total) * 100) : 0,
      docsRequeridos,
      docsCargados,
      requisitosPendientes,
    };
  }, [items]);

  const etapas = useMemo(() => {
    const mapa = new Map();
    for (const t of items) {
      if (!mapa.has(t.etapaCodigo)) {
        mapa.set(t.etapaCodigo, { codigo: t.etapaCodigo, nombre: t.etapaNombre });
      }
    }
    return [...mapa.values()].sort((a, b) =>
      String(a.codigo).localeCompare(String(b.codigo), "es", { numeric: true })
    );
  }, [items]);

  const stats = useMemo(() => {
    const mapa = new Map();
    for (const t of items) {
      if (t.estado === "No aplica") continue;
      if (!mapa.has(t.etapaCodigo)) {
        mapa.set(t.etapaCodigo, { total: 0, hechos: 0, docsPend: 0 });
      }
      const s = mapa.get(t.etapaCodigo);
      s.total += 1;
      if (t.estado === "Completado") s.hechos += 1;
      s.docsPend += faltantes(t).length;
    }
    return mapa;
  }, [items]);

  const itemsFiltrados = useMemo(() => {
    const texto = buscar.trim().toLowerCase();
    return items.filter((i) => {
      const coincideTexto = !texto || [
        i.codigo,
        i.nombre,
        i.responsable,
        i.etapaNombre,
        i.seccionNombre,
        ...(i.docsRequeridos || []),
        ...(i.documentos || []).map((d) => d.nombre),
      ].join(" ").toLowerCase().includes(texto);
      const coincideEtapa = filtroEtapa === "Todas" || i.etapaCodigo === filtroEtapa;
      const coincideEstado = filtroEstado === "Todos" || i.estado === filtroEstado;
      const pendientes = i.estado === "No aplica" ? 0 : faltantes(i).length;
      const coincideDocs =
        filtroDocs === "Todos" ||
        (filtroDocs === "Pendientes" && pendientes > 0) ||
        (filtroDocs === "Completos" && pendientes === 0);
      return coincideTexto && coincideEtapa && coincideEstado && coincideDocs;
    });
  }, [items, buscar, filtroEtapa, filtroEstado, filtroDocs]);

  const grupos = useMemo(() => {
    const mapa = new Map();
    for (const t of itemsFiltrados) {
      if (!mapa.has(t.etapaCodigo)) {
        mapa.set(t.etapaCodigo, {
          codigo: t.etapaCodigo,
          nombre: t.etapaNombre,
          secciones: new Map(),
        });
      }
      const etapa = mapa.get(t.etapaCodigo);
      if (!etapa.secciones.has(t.seccionCodigo)) {
        etapa.secciones.set(t.seccionCodigo, {
          codigo: t.seccionCodigo,
          nombre: t.seccionNombre,
          tareas: [],
        });
      }
      etapa.secciones.get(t.seccionCodigo).tareas.push(t);
    }
    return [...mapa.values()]
      .sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), "es", { numeric: true }))
      .map((e) => ({
        ...e,
        secciones: [...e.secciones.values()]
          .sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), "es", { numeric: true }))
          .map((s) => ({
            ...s,
            tareas: [...s.tareas].sort((a, b) =>
              String(a.codigo).localeCompare(String(b.codigo), "es", { numeric: true })
            ),
          })),
      }));
  }, [itemsFiltrados]);

  const proximos = useMemo(
    () => items
      .filter((i) => i.fecha_limite && i.estado !== "Completado" && i.estado !== "No aplica")
      .sort((a, b) => a.fecha_limite.localeCompare(b.fecha_limite))
      .slice(0, 6),
    [items]
  );

  const conDocsPendientes = useMemo(
    () => items
      .filter((i) => faltantes(i).length > 0 && i.estado !== "No aplica")
      .sort((a, b) => faltantes(b).length - faltantes(a).length)
      .slice(0, 6),
    [items]
  );

  const eventuales = useMemo(
    () => items.filter((i) => i.tipo === "eventual" || i.tipo === "propio"),
    [items]
  );

  const opcionesEventuales = useMemo(
    () => (tramite ? listarEventuales(tramite.tipo_objeto) : []),
    [tramite]
  );

  if (!tramite) {
    return <div className="vacio">Trámite no encontrado. <Link to="/tramites">Volver</Link></div>;
  }

  const diasRestantes = tramite.fecha_fin
    ? diasEntre(hoyISO(), tramite.fecha_fin)
    : null;

  const recargar = () => setItems(listItems(id));

  const cambiarItem = (cambios) => {
    if (!tarea) return;
    updateItem(tarea.id, cambios);
    recargar();
  };

  const alternarEtapa = (codigo) => {
    setColapsadas((prev) => prev.includes(codigo) ? prev.filter((c) => c !== codigo) : [...prev, codigo]);
  };

  const abrirTarea = (t) => {
    setErrorArchivo("");
    setTareaId(t.id);
  };

  const guardarTramite = (e) => {
    e.preventDefault();
    const t = updateTramite(id, form);
    setTramite(t);
    setEditando(false);
  };

  const crearEventual = (e) => {
    e.preventDefault();
    if (!eventualSel) return;
    const nueva = addTareaEventual(id, eventualSel);
    recargar();
    setModalEventual(false);
    setEventualSel("");
    if (nueva) abrirTarea(nueva);
  };

  const agregarHito = (e) => {
    e.preventDefault();
    if (!nuevoHito.nombre.trim()) return;
    const creado = addItem(id, nuevoHito.nombre.trim(), nuevoHito.etapa);
    let mensaje = "";
    if (guardarHitoEnCatalogo && creado) {
      agregarCatalogoHito({
        nombre: creado.nombre,
        tipoObjeto: tramite.tipo_objeto,
        etapaCodigo: creado.etapaCodigo || "P",
        etapaNombre: creado.etapaNombre || "Hitos propios",
        docs: creado.docsRequeridos || [],
        cumplimiento: "",
        dias: 0,
        base: "inicio",
        habiles: true,
        norma: "Ley 32069 y su Reglamento",
      });
      mensaje = `“${creado.nombre}” se guardó también en el catálogo. Aparecerá en los contratos nuevos de ${tramite.tipo_objeto}.`;
    }
    recargar();
    setModalHito(false);
    setNuevoHito({ nombre: "", etapa: "Hitos propios" });
    setGuardarHitoEnCatalogo(false);
    setNotaCatalogo(mensaje);
    if (creado) abrirTarea(creado);
  };

  const crearOpcional = (e) => {
    e.preventDefault();
    if (!opcionalSel) return;
    const creado = addHitoOpcional(id, opcionalSel);
    recargar();
    setModalOpcional(false);
    setOpcionalSel("");
    if (creado) abrirTarea(creado);
  };

  const agregarMes = (seccionCodigo) => {
    if (soloLectura || !seccionCodigo) return;
    const creado = agregarMesSCTR(id);
    recargar();
    if (creado) abrirTarea(creado);
  };

  const abrirFianzas = () => {
    setConfigFianzas(getConfigFianzas(id));
    setModalFianzas(true);
  };

  const guardarFianzas = (e) => {
    e.preventDefault();
    if (!configFianzas.tipos?.length) return;
    guardarConfigFianzas(id, configFianzas);
    recargar();
    setModalFianzas(false);
  };

  const actualizarDocumentos = (docs, cumplimiento) => {
    if (!tarea) return;
    const cambios = { docsRequeridos: docs };
    if (cumplimiento !== undefined) cambios.docCumplimiento = cumplimiento;
    updateItem(tarea.id, cambios);
    if (tarea.clavePlantilla) {
      guardarPlantilla(tarea.clavePlantilla, {
        docs,
        cumplimiento: cumplimiento !== undefined ? cumplimiento : (tarea.docCumplimiento || ""),
      });
    }
    recargar();
  };

  const moverDocumento = (index, direccion) => {
    if (!tarea || soloLectura) return;
    const docs = [...(tarea.docsRequeridos || [])];
    const otro = docs[index + direccion];
    if (!otro) return;
    [docs[index], docs[index + direccion]] = [docs[index + direccion], docs[index]];
    actualizarDocumentos(docs);
  };

  const quitarDocumento = (nombre) => {
    if (!tarea || soloLectura) return;
    if (!window.confirm(`¿Quitar el documento "${nombre}" de este hito?`)) return;
    actualizarDocumentos((tarea.docsRequeridos || []).filter((d) => d !== nombre));
  };

  const agregarDocumento = (e) => {
    e.preventDefault();
    if (!tarea || !nuevoDoc.trim()) return;
    const nombre = nuevoDoc.trim();
    if ((tarea.docsRequeridos || []).includes(nombre)) {
      setNuevoDoc("");
      return;
    }
    const docs = [...(tarea.docsRequeridos || []), nombre];
    if (guardarEnPlantilla && tarea.clavePlantilla) {
      guardarPlantilla(tarea.clavePlantilla, { docs, cumplimiento: tarea.docCumplimiento || "" });
    }
    updateItem(tarea.id, { docsRequeridos: docs });
    setNuevoDoc("");
    recargar();
  };

  const cambiarCumplimiento = (e) => {
    if (!tarea) return;
    const cumplimiento = e.target.value;
    updateItem(tarea.id, { docCumplimiento: cumplimiento });
    if (tarea.clavePlantilla) {
      guardarPlantilla(tarea.clavePlantilla, {
        docs: tarea.docsRequeridos || [],
        cumplimiento,
      });
    }
    recargar();
  };

  const abrirEditarCatalogo = () => {
    if (!tarea) return;
    const esDelCatalogo = String(tarea.clavePlantilla || "").startsWith("cat_");
    const etapas = catalogoDe(tramite.tipo_objeto).etapas;
    const etapaActual = etapas.find((e) => e.codigo === tarea.etapaCodigo);
    const etapa = esDelCatalogo || etapaActual
      ? { codigo: tarea.etapaCodigo, nombre: tarea.etapaNombre }
      : etapas[0];
    setCatalogoModo(esDelCatalogo ? "editar" : "crear");
    setCatalogoForm({
      clave: tarea.clavePlantilla || "",
      nombre: tarea.nombre || "",
      etapaCodigo: etapa.codigo,
      etapaNombre: etapa.nombre,
      docs: (tarea.docsRequeridos || []).join("\n"),
      cumplimiento: tarea.docCumplimiento || "",
      dias: tarea.plazoDias || 0,
      base: tarea.plazoBase || "inicio",
      habiles: tarea.plazoHabiles !== false,
      norma: tarea.norma || "Ley 32069 y su Reglamento",
      origen: tarea.origen || "",
    });
    setEditandoCatalogo(true);
  };

  const guardarEdicionCatalogo = (e) => {
    e.preventDefault();
    if (!tarea) return;
    const docs = catalogoForm.docs.split(/\n|,/).map((d) => d.trim()).filter(Boolean);
    const cumplimiento = catalogoForm.cumplimiento.trim();
    const nombre = catalogoForm.nombre.trim() || tarea.nombre;
    const cambios = {
      docsRequeridos: docs,
      docCumplimiento: cumplimiento,
      plazoDias: Number(catalogoForm.dias) || 0,
      plazoBase: catalogoForm.base,
      plazoHabiles: Boolean(catalogoForm.habiles),
      norma: catalogoForm.norma,
      nombre,
    };

    if (catalogoModo === "crear") {
      const etapaCodigo = catalogoForm.etapaCodigo || "P";
      const etapaNombre = catalogoForm.etapaNombre || "Hitos propios";
      const creado = agregarCatalogoHito({
        nombre,
        tipoObjeto: tramite.tipo_objeto,
        etapaCodigo,
        etapaNombre,
        docs,
        cumplimiento,
        dias: cambios.plazoDias,
        base: cambios.plazoBase,
        habiles: cambios.plazoHabiles,
        norma: cambios.norma,
      });
      let codigo = tarea.codigo;
      let seccionCodigo = tarea.seccionCodigo;
      let seccionNombre = tarea.seccionNombre;
      if (etapaCodigo !== "P") {
        const numeros = items
          .filter((i) => i.tramite_id === id && i.seccionCodigo === etapaCodigo)
          .map((i) => Number(String(i.codigo || "").split(".").pop()))
          .filter((n) => Number.isFinite(n));
        codigo = `${etapaCodigo}.${(numeros.length ? Math.max(...numeros) : 0) + 1}`;
        seccionCodigo = etapaCodigo;
        seccionNombre = etapaNombre;
      }
      updateItem(tarea.id, {
        ...cambios,
        codigo,
        etapaCodigo,
        etapaNombre,
        seccionCodigo,
        seccionNombre,
        plantilla: creado.clave,
        clavePlantilla: creado.clave,
        origen: "catalogo",
      });
      setNotaCatalogo(`“${nombre}” se convirtió en hito de catálogo en ${etapaCodigo} ${etapaNombre} y se generará en los contratos nuevos de ${tramite.tipo_objeto}.`);
    } else {
      updateItem(tarea.id, cambios);
      if (tarea.clavePlantilla) {
        guardarPlantilla(tarea.clavePlantilla, {
          docs,
          cumplimiento,
          nombre,
          plazoDias: cambios.plazoDias,
          plazoBase: cambios.plazoBase,
          plazoHabiles: cambios.plazoHabiles,
          norma: cambios.norma,
        });
        if (String(tarea.clavePlantilla).startsWith("cat_")) {
          actualizarCatalogoPorClave(tarea.clavePlantilla, {
            nombre,
            docs,
            cumplimiento,
            dias: cambios.plazoDias,
            base: cambios.plazoBase,
            habiles: cambios.plazoHabiles,
            norma: cambios.norma,
          });
        }
      }
      setNotaCatalogo(`Catálogo de “${nombre}” actualizado. Los cambios se aplicarán a contratos nuevos.`);
    }
    recargar();
    setEditandoCatalogo(false);
  };

  const moverHito = (item, direccion) => {
    if (soloLectura) return;
    moverItem(id, item.id, direccion);
    recargar();
  };

  const subirArchivo = async (event, tipoDoc) => {
    if (soloLectura) return;
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !tarea) return;
    if (file.size > 30 * 1024 * 1024) {
      setErrorArchivo("El archivo supera el límite de 30 MB para el demo.");
      return;
    }
    setErrorArchivo("");
    setSubiendo(tipoDoc || "Otros");
    try {
      const meta = await guardarArchivo(file, {
        tramiteId: id,
        tareaId: tarea.id,
        tipoDoc: tipoDoc || "Otros",
        nombre: nombrePorEtiqueta(tipoDoc || "Documento", file.name),
      });
      const actual = listItems(id).find((i) => i.id === tarea.id);
      const documentos = [...(actual?.documentos || []), meta];
      const cumple = Boolean(tipoDoc && tarea.docCumplimiento && tipoDoc === tarea.docCumplimiento);
      updateItem(tarea.id, {
        documentos,
        ...(cumple ? { estado: "Completado", fecha: tarea.fecha || hoyISO() } : {}),
      });
      recargar();
    } catch (error) {
      setErrorArchivo(error?.message || "No se pudo guardar el archivo.");
    } finally {
      setSubiendo("");
    }
  };

  const borrarArchivo = async (doc) => {
    if (soloLectura) return;
    if (!tarea) return;
    if (!window.confirm(`¿Eliminar el archivo "${doc.nombre}"?`)) return;
    try {
      if (doc.archivoId) await eliminarArchivo(doc.archivoId);
    } catch { /* el archivo ya no existe */ }
    const documentos = (tarea.documentos || []).filter((d) => d.id !== doc.id);
    updateItem(tarea.id, { documentos });
    recargar();
  };

  const descargar = async (doc) => {
    try {
      await descargarArchivo(doc.archivoId, doc.nombre);
    } catch (error) {
      setErrorArchivo(error?.message || "No se pudo descargar el archivo.");
    }
  };

  const descargarTodos = async () => {
    if (!tarea) return;
    try {
      await descargarComoZip(
        tarea.documentos || [],
        `Documentos ${tarea.codigo}.zip`,
        `${tarea.codigo}/`
      );
    } catch (error) {
      setErrorArchivo(error?.message || "No se pudo descargar el archivo.");
    }
  };

  const descargarExpediente = async () => {
    const documentos = items.flatMap((i) =>
      (i.documentos || []).map((doc) => ({ ...doc, nombre: `${i.codigo}/${doc.nombre}` }))
    );
    if (!documentos.length) {
      setErrorArchivo("Este expediente todavía no tiene archivos cargados.");
      return;
    }
    try {
      await descargarComoZip(documentos, `Expediente ${tramite.codigo}.zip`);
    } catch (error) {
      setErrorArchivo(error?.message || "No se pudo descargar el expediente.");
    }
  };

  const eliminarTareaActual = () => {
    if (soloLectura) return;
    if (!tarea) return;
    if (!window.confirm(`¿Eliminar el trámite "${tarea.nombre}" del expediente?`)) return;
    removeItem(tarea.id);
    setTareaId(null);
    recargar();
  };

  return (
    <div>
      <div className="migas"><Link to="/tramites">Contratos</Link> / {tramite.codigo}</div>

      <div className="encabezado-tramite">
        <div className="encabezado-info">
          <div className="codigo">{tramite.codigo}</div>
          <h2>{tramite.denominacion}</h2>
          <div className="chips">
            <span className="badge azul">{tramite.tipo_objeto}</span>
            <span className={`badge ${tramite.estado === "En ejecución" ? "verde" : "gris"}`}>{tramite.estado}</span>
            {diasRestantes !== null && (
              <span className={`badge ${diasRestantes < 0 ? "rojo" : diasRestantes <= 30 ? "ambar" : "gris"}`}>
                {diasRestantes < 0 ? "Plazo contractual vencido" : `${diasRestantes} días de ejecución`}
              </span>
            )}
          </div>
        </div>
        <div className="encabezado-acciones">
          {!soloLectura && (
            <button className="btn" onClick={() => { setForm(tramite); setEditando(true); }}>Editar datos</button>
          )}
          <button className="btn" onClick={descargarExpediente}>Descargar expediente</button>
          <button className="btn" onClick={() => window.print()}>Imprimir</button>
          {!soloLectura && (
            <button className="btn primario" onClick={() => { setEventualSel(""); setModalEventual(true); }}>+ Nuevo trámite</button>
          )}
        </div>
      </div>

      <div className="ficha">
        <div><b>Entidad</b><span>{tramite.entidad || "—"}</span></div>
        <div><b>Contratista</b><span>{tramite.contratista || "—"}</span></div>
        <div><b>Área usuaria</b><span>{tramite.area || "—"}</span></div>
        <div><b>Monto contractual</b><span>{fmt(tramite.monto)}</span></div>
        <div><b>Inicio</b><span>{fecha(tramite.fecha_inicio)}</span></div>
        <div><b>Fin contractual</b><span>{fecha(tramite.fecha_fin)}</span></div>
      </div>

      <div className="avance-caja">
        <div className="avance-texto">
          <strong>Avance del expediente</strong>
          <span>{resumen.completados} de {resumen.total} hitos completados · {resumen.docsCargados} documento(s) cargado(s)</span>
        </div>
        <div className="barra grande"><div className="barra-fill" style={{ width: `${resumen.pct}%` }} /></div>
        <div className="avance-pct">{resumen.pct}%</div>
      </div>

      <div className="tabs">
        <button className={tab === "expediente" ? "activo" : ""} onClick={() => setTab("expediente")}>
          Expediente <span className="tab-num">{items.length}</span>
        </button>
        <button className={tab === "resumen" ? "activo" : ""} onClick={() => setTab("resumen")}>Resumen</button>
      </div>

      {tab === "resumen" && (
        <div className="grid-2">
          <div className="tarjeta">
            <div className="tarjeta-cab"><h3>Próximos vencimientos</h3><span className="badge ambar">{resumen.requisitosPendientes} requisito(s) sin archivo</span></div>
            <div className="cuerpo">
              {proximos.length === 0 && <div className="vacio">No hay plazos pendientes registrados.</div>}
              {proximos.map((t) => (
                <button key={t.id} className="fila-tarea-boton" onClick={() => abrirTarea(t)}>
                  <div>
                    <div className="codigo">{t.codigo} · {t.etapaNombre}</div>
                    <strong>{t.nombre}</strong>
                    <div className="ref">{textoVencimiento(t)} · {fecha(t.fecha_limite)}</div>
                  </div>
                  <span className={`badge ${estadoVencimiento(t) === "vencido" ? "rojo" : estadoVencimiento(t) === "por-vencer" ? "ambar" : "gris"}`}>
                    {silencioProducido(t) ? "Silencio positivo" : t.estado}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="tarjeta">
            <div className="tarjeta-cab"><h3>Trámites eventuales</h3>{!soloLectura && <button className="btn mini" onClick={() => setModalEventual(true)}>+ Nuevo</button>}</div>
            <div className="cuerpo">
              {eventuales.length === 0 && <div className="vacio">Sin trámites eventuales. Se crean solo cuando ocurre el hecho (cambio de personal, ampliación, adicional, etc.).</div>}
              {eventuales.map((t) => (
                <button key={t.id} className="fila-tarea-boton" onClick={() => abrirTarea(t)}>
                  <div>
                    <div className="codigo">{t.codigo} · {t.tipo === "eventual" ? "Trámite eventual" : "Hito propio"}</div>
                    <strong>{t.nombre}</strong>
                    <div className="ref">{(t.documentos || []).length}/{t.docsRequeridos?.length || 0} documentos · {t.estado}</div>
                  </div>
                  <span className={`badge ${claseEstado(t.estado)}`}>{t.estado}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="tarjeta">
            <div className="tarjeta-cab"><h3>Documentos pendientes</h3><span className="badge gris">{resumen.requisitosPendientes}</span></div>
            <div className="cuerpo">
              {conDocsPendientes.length === 0 && <div className="vacio">Todos los requisitos tienen al menos un archivo.</div>}
              {conDocsPendientes.map((t) => (
                <button key={t.id} className="fila-tarea-boton" onClick={() => abrirTarea(t)}>
                  <div>
                    <div className="codigo">{t.codigo}</div>
                    <strong>{t.nombre}</strong>
                    <div className="ref">Falta: {faltantes(t).slice(0, 3).join(" · ")}{faltantes(t).length > 3 ? "…" : ""}</div>
                  </div>
                  <span className="badge ambar">{faltantes(t).length}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="tarjeta">
            <div className="tarjeta-cab"><h3>Avance por etapa</h3></div>
            <div className="cuerpo">
              {etapas.map((e) => {
                const s = stats.get(e.codigo) || { total: 0, hechos: 0 };
                const pct = s.total ? Math.round((s.hechos / s.total) * 100) : 0;
                return (
                  <div key={e.codigo} className="progreso-fila">
                    <div className="progreso-datos">
                      <span className="codigo">{e.codigo}</span>
                      <strong>{e.nombre}</strong>
                      <span className="ref">{s.hechos}/{s.total}</span>
                    </div>
                    <div className="barra"><div className="barra-fill" style={{ width: `${pct}%` }} /></div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {tab === "expediente" && (
        <div>
          <div className="tarjeta">
            <div className="tarjeta-cab">
              <div>
                <h3>Expediente documentario</h3>
                <span className="ref">
                  {items.length} hitos · {resumen.docsCargados} archivos cargados · {resumen.requisitosPendientes} requisitos pendientes
                </span>
              </div>
              <div className="chips">
                <span className="badge azul">{tramite.tipo_objeto}</span>
                <span className="badge gris">{resumen.pendientes} hitos abiertos</span>
              </div>
            </div>
            <div className="checklist-toolbar">
              <input placeholder="Buscar por código, hito, documento o responsable…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
              <select value={filtroEtapa} onChange={(e) => setFiltroEtapa(e.target.value)}>
                <option value="Todas">Todas las etapas</option>
                {etapas.map((e) => <option key={e.codigo} value={e.codigo}>{e.codigo} · {e.nombre}</option>)}
              </select>
              <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
                <option value="Todos">Todos los estados</option>
                {ESTADOS.map((e) => <option key={e}>{e}</option>)}
              </select>
              <select value={filtroDocs} onChange={(e) => setFiltroDocs(e.target.value)}>
                <option value="Todos">Todos los documentos</option>
                <option value="Pendientes">Con requisitos pendientes</option>
                <option value="Completos">Requisitos completos</option>
              </select>
              <span className="contador">{itemsFiltrados.length} de {items.length}</span>
              {!soloLectura && <button className="btn mini" onClick={() => setModalOpcional(true)}>+ Hito opcional</button>}
              {!soloLectura && <button className="btn mini" onClick={() => setModalHito(true)}>+ Hito propio</button>}
            </div>
          </div>

          {notaCatalogo && <div className="nota-info">{notaCatalogo}</div>}

          {grupos.map((grupo) => {
            const s = stats.get(grupo.codigo) || { total: 0, hechos: 0, docsPend: 0 };
            const pct = s.total ? Math.round((s.hechos / s.total) * 100) : 0;
            const colapsada = colapsadas.includes(grupo.codigo);
            return (
              <section className="tarjeta etapa-expediente" key={grupo.codigo}>
                <div className="etapa-cab">
                  <button className="etapa-toggle" onClick={() => alternarEtapa(grupo.codigo)}>
                    <span className="etapa-codigo">{grupo.codigo}</span>
                    <span>{grupo.nombre}</span>
                    <span className="etapa-flecha">{colapsada ? "▸" : "▾"}</span>
                  </button>
                  <div className="etapa-resumen">
                    <span className="ref">{s.hechos}/{s.total} completados</span>
                    {s.docsPend > 0 && <span className="badge ambar">{s.docsPend} docs. pendientes</span>}
                    <div className="barra etapa-barra"><div className="barra-fill" style={{ width: `${pct}%` }} /></div>
                    <strong>{pct}%</strong>
                  </div>
                </div>

                {!colapsada && grupo.secciones.map((seccion) => (
                  <div className="seccion-expediente" key={`${grupo.codigo}-${seccion.codigo}`}>
                    <div className="seccion-cab">
                      <span className="seccion-codigo">{seccion.codigo}</span>
                      <strong>{seccion.nombre}</strong>
                      <span className="ref">{seccion.tareas.length} hito(s)</span>
                      <span className="pie-espacio" />
                      {!soloLectura && seccion.codigo === "1.2.10" && (
                        <button className="btn mini" onClick={abrirFianzas}>Configurar fianzas</button>
                      )}
                      {!soloLectura && seccion.codigo === "2.2.7" && (
                        <button className="btn mini" onClick={abrirFianzas}>Configurar fianzas</button>
                      )}
                      {!soloLectura && (seccion.codigo === "1.2.11" || seccion.codigo === "2.2.8") && (
                        <button className="btn mini" onClick={() => agregarMes(seccion.codigo)}>+ Agregar mes</button>
                      )}
                    </div>
                    <div className="tareas-lista">
                      {seccion.tareas.map((t) => {
                        const faltan = faltantes(t);
                        const venc = estadoVencimiento(t);
                        return (
                          <div
                            key={t.id}
                            className={`tarea-fila ${t.estado === "Completado" ? "completada" : ""}`}
                            onClick={() => abrirTarea(t)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => { if (e.key === "Enter") abrirTarea(t); }}
                          >
                            <div className="tarea-codigo">{t.codigo}</div>
                            <div className="tarea-cuerpo">
                              <div className="tarea-titulo">
                                <strong>{t.nombre}</strong>
                                {t.tipo === "eventual" && <span className="badge violeta">Eventual</span>}
                                {t.tipo === "recurrente" && <span className="badge azul">{t.periodo || "Recurrente"}</span>}
                                {t.tipo === "propio" && <span className="badge gris">Propio</span>}
                                {silencioProducido(t) && <span className="badge rojo">Silencio positivo</span>}
                                {t.plazoDias > 0 && <span className="badge gris">{t.plazoDias} días {t.plazoHabiles ? "hábiles" : "calendario"}</span>}
                              </div>
                              <div className="tarea-meta">
                                {t.estado === "No aplica" ? (
                                  <span>No aplica: no requiere documentos</span>
                                ) : (
                                  <>
                                    <span>{t.documentos?.length || 0}/{t.docsRequeridos?.length || 0} documentos</span>
                                    {faltan.length > 0 && <span className="texto-ambar">{faltan.length} requisito(s) sin archivo</span>}
                                  </>
                                )}
                                {t.responsable && <span>Responsable: {t.responsable}</span>}
                                {t.fecha_limite && t.estado !== "No aplica" && (
                                  <span className={venc === "vencido" ? "texto-rojo" : venc === "por-vencer" ? "texto-ambar" : ""}>
                                    {textoVencimiento(t)} · {fecha(t.fecha_limite)}
                                  </span>
                                )}
                                {t.norma && <span>{t.norma}</span>}
                              </div>
                            </div>
                            <div className="tarea-lado">
                              {!soloLectura && (
                                <span className="orden-hito" onClick={(e) => { e.stopPropagation(); moverHito(t, -1); }} title="Subir posición">↑</span>
                              )}
                              {!soloLectura && (
                                <span className="orden-hito" onClick={(e) => { e.stopPropagation(); moverHito(t, 1); }} title="Bajar posición">↓</span>
                              )}
                              <span className={`badge ${claseEstado(t.estado)}`}>{t.estado}</span>
                              <div className="mini-archivos">
                                {(t.documentos || []).slice(0, 3).map((d) => (
                                  <span key={d.id} className="mini-archivo" title={d.nombre}>{iconoArchivo(d.mime, d.nombre)}</span>
                                ))}
                                {(t.documentos || []).length > 3 && <span className="mini-archivo">+{(t.documentos || []).length - 3}</span>}
                              </div>
                              <span className="btn mini">Abrir</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </section>
            );
          })}

          {grupos.length === 0 && (
            <div className="tarjeta"><div className="vacio">No hay hitos que coincidan con los filtros.</div></div>
          )}
        </div>
      )}

      {tarea && (
        <div className="modal-fondo" onClick={(e) => e.target === e.currentTarget && setTareaId(null)}>
          <div className="modal modal-tarea">
            <div className="modal-cab modal-tarea-cab">
              <div>
                <div className="codigo">{tarea.codigo} · {tarea.etapaNombre} / {tarea.seccionNombre}</div>
                <h3>{tarea.nombre}</h3>
                <div className="chips">
                  <span className={`badge ${claseEstado(tarea.estado)}`}>{tarea.estado}</span>
                  {tarea.tipo === "eventual" && <span className="badge violeta">Trámite eventual</span>}
                  {tarea.tipo === "recurrente" && <span className="badge azul">{tarea.periodo || "Recurrente"}</span>}
                  {tarea.tipo === "propio" && <span className="badge gris">Hito propio</span>}
                  {silencioProducido(tarea) && <span className="badge rojo">Silencio positivo</span>}
                  {tarea.fecha_limite && (
                    <span className={`badge ${estadoVencimiento(tarea) === "vencido" ? "rojo" : estadoVencimiento(tarea) === "por-vencer" ? "ambar" : "gris"}`}>
                      {textoVencimiento(tarea)}
                    </span>
                  )}
                </div>
              </div>
              <button type="button" className="cerrar" onClick={() => setTareaId(null)}>×</button>
            </div>

            <div className="modal-cuerpo modal-tarea-cuerpo">
              {tarea.nota && <div className="nota-info">{tarea.nota}</div>}
              {soloLectura && (
                <div className="nota-info">Modo solo lectura: puedes consultar los hitos y descargar archivos, pero no modificar el expediente.</div>
              )}
              {errorArchivo && <div className="alerta">{errorArchivo}</div>}

              <div className={`plazo-caja ${estadoVencimiento(tarea)}`}>
                <div>
                  <b>Fecha límite</b>
                  <strong>{fecha(tarea.fecha_limite)}</strong>
                  <span>{textoVencimiento(tarea)}</span>
                </div>
                <div>
                  <b>Plazo legal</b>
                  <strong>
                    {tarea.plazoDias
                      ? `${tarea.plazoDias} días ${tarea.plazoHabiles ? "hábiles" : "calendario"}`
                      : tarea.recurrente
                        ? tarea.frecuencia === "anual"
                          ? `${tarea.diaLimite} días antes del vencimiento`
                          : `Día ${tarea.diaLimite} de cada mes`
                        : "Sin plazo automático"}
                  </strong>
                  <span>{tarea.norma || "Configurable"}</span>
                </div>
                <div>
                  <b>Documentos</b>
                  <strong>{(tarea.documentos || []).length} cargados</strong>
                  <span>{faltantes(tarea).length} requisito(s) pendiente(s)</span>
                </div>
              </div>

              <div className="catalogo-hito">
                <div className="catalogo-hito-cab">
                  <div>
                    <h4>Catálogo de este hito</h4>
                    <span className="ref">
                      Clave: {tarea.clavePlantilla || "—"} · {String(tarea.clavePlantilla || "").startsWith("cat_")
                        ? "Hito de tu catálogo"
                        : tarea.tipo === "propio" || tarea.tipo === "eventual" || String(tarea.clavePlantilla || "").startsWith("opcional:")
                          ? "Aún no está en el catálogo"
                          : "Catálogo base"}
                    </span>
                  </div>
                  {!soloLectura && (
                    <button type="button" className="btn mini" onClick={abrirEditarCatalogo}>
                      {String(tarea.clavePlantilla || "").startsWith("cat_") ? "Editar catálogo" : "Convertir en catálogo"}
                    </button>
                  )}
                </div>
                <div className="catalogo-hito-datos">
                  <span>{tarea.docsRequeridos?.length || 0} documento(s) en la plantilla</span>
                  <span>Cumplimiento: {tarea.docCumplimiento || "Manual"}</span>
                  <span>{tarea.plazoDias ? `${tarea.plazoDias} días ${tarea.plazoHabiles ? "hábiles" : "calendario"}` : "Sin plazo automático"}</span>
                  <span>Los cambios aquí afectan a contratos nuevos.</span>
                </div>
              </div>

              <div className="grid-form">
                <label className="campo-grupo">
                  <span className="campo">Estado del hito</span>
                  <select disabled={soloLectura} value={tarea.estado || "Pendiente"} onChange={(e) => cambiarItem({ estado: e.target.value })}>
                    {ESTADOS.map((e) => <option key={e}>{e}</option>)}
                  </select>
                </label>
                <label className="campo-grupo">
                  <span className="campo">Responsable</span>
                  <input disabled={soloLectura} value={tarea.responsable || ""} onChange={(e) => cambiarItem({ responsable: e.target.value })} placeholder="Área o persona responsable" />
                </label>
                <label className="campo-grupo">
                  <span className="campo">Fecha de presentación</span>
                  <input disabled={soloLectura} type="date" value={tarea.fecha || ""} onChange={(e) => cambiarItem({ fecha: e.target.value })} />
                </label>
                <label className="campo-grupo">
                  <span className="campo">Fecha límite</span>
                  <input disabled={soloLectura} type="date" value={tarea.fecha_limite || ""} onChange={(e) => cambiarItem({ fecha_limite: e.target.value })} />
                </label>
                <label className="campo-grupo ancho-completo">
                  <span className="campo">Observación / sustento</span>
                  <textarea disabled={soloLectura} rows="2" value={tarea.observacion || ""} onChange={(e) => cambiarItem({ observacion: e.target.value })} placeholder="Anotaciones, número de expediente, cargo de recepción…" />
                </label>
              </div>

              <div className="docs-bloque">
                <div className="docs-cab">
                  <div>
                    <h4>Documentos requeridos</h4>
                    <span className="ref">Los cambios se guardan también en la plantilla para futuros contratos.</span>
                  </div>
                  <span className="badge azul">{(tarea.docsRequeridos || []).length - faltantes(tarea).length}/{(tarea.docsRequeridos || []).length} completos</span>
                </div>

                {!soloLectura && (
                  <label className="campo-grupo cumplimiento-campo">
                    <span className="campo">Documento que da por cumplido el hito</span>
                    <select value={tarea.docCumplimiento || ""} onChange={cambiarCumplimiento}>
                      <option value="">Ninguno (completado manual)</option>
                      {(tarea.docsRequeridos || []).map((req) => <option key={req} value={req}>{req}</option>)}
                    </select>
                  </label>
                )}

                {(tarea.docsRequeridos || []).length === 0 && (
                  <div className="vacio">Este hito no tiene requisitos predefinidos. Puedes adjuntar documentos en “Otros documentos”.</div>
                )}

                {(tarea.docsRequeridos || []).map((req, idx) => {
                  const docs = (tarea.documentos || []).filter((d) => d.tipoDoc === req);
                  return (
                    <div className="requisito" key={req}>
                      <div className="requisito-cab">
                        <div>
                          <strong>{req}</strong>
                          <span className="ref">{docs.length ? `${docs.length} archivo(s)` : "Pendiente de carga"}</span>
                        </div>
                        <div className="requisito-acciones">
                          <span className={`badge ${docs.length ? "verde" : "ambar"}`}>{docs.length ? "Cargado" : "Pendiente"}</span>
                          {!soloLectura && (
                            <>
                              <button type="button" className="btn-icono" title="Subir documento en la lista" onClick={() => moverDocumento(idx, -1)}>↑</button>
                              <button type="button" className="btn-icono" title="Bajar documento en la lista" onClick={() => moverDocumento(idx, 1)}>↓</button>
                              <button type="button" className="btn-icono peligro" title="Quitar documento" onClick={() => quitarDocumento(req)}>×</button>
                            </>
                          )}
                        </div>
                      </div>
                      {docs.map((doc) => (
                        <div className="archivo-fila" key={doc.id}>
                          <div className="doc-ico">{iconoArchivo(doc.mime, doc.nombre)}</div>
                          <div className="archivo-datos">
                            <strong>{doc.nombre}</strong>
                            <span>{formatearTamano(doc.tamano)} · {fecha(doc.fecha)}</span>
                          </div>
                          <button type="button" className="btn mini" onClick={() => descargar(doc)}>Descargar</button>
                          {!soloLectura && (
                            <button type="button" className="btn-icono peligro" title="Eliminar archivo" onClick={() => borrarArchivo(doc)}>×</button>
                          )}
                        </div>
                      ))}
                      {!soloLectura && (
                        <label className={`btn mini subir-archivo ${subiendo ? "deshabilitado" : ""}`}>
                          {subiendo === req ? "Subiendo…" : docs.length ? "+ Agregar otro archivo" : "Subir archivo"}
                          <input
                            type="file"
                            hidden
                            disabled={Boolean(subiendo)}
                            onChange={(e) => subirArchivo(e, req)}
                          />
                        </label>
                      )}
                    </div>
                  );
                })}

                {!soloLectura && (
                  <form className="agregar-documento" onSubmit={agregarDocumento}>
                    <input
                      value={nuevoDoc}
                      onChange={(e) => setNuevoDoc(e.target.value)}
                      placeholder="Nombre del documento, ej. Vigencia de poder"
                    />
                    <label className="opcion-plantilla">
                      <input
                        type="checkbox"
                        checked={guardarEnPlantilla}
                        onChange={(e) => setGuardarEnPlantilla(e.target.checked)}
                      />
                      Guardar para futuras obras
                    </label>
                    <button type="submit" className="btn mini">Agregar documento</button>
                  </form>
                )}
              </div>

              <div className="docs-bloque">
                <div className="docs-cab">
                  <div>
                    <h4>Otros documentos</h4>
                    <span className="ref">Documentos adicionales que no están en la lista de requisitos.</span>
                  </div>
                </div>
                {(tarea.documentos || []).filter((d) => !(tarea.docsRequeridos || []).includes(d.tipoDoc)).map((doc) => (
                  <div className="archivo-fila" key={doc.id}>
                    <div className="doc-ico">{iconoArchivo(doc.mime, doc.nombre)}</div>
                    <div className="archivo-datos">
                      <strong>{doc.nombre}</strong>
                      <span>{doc.tipoDoc} · {formatearTamano(doc.tamano)} · {fecha(doc.fecha)}</span>
                    </div>
                    <button type="button" className="btn mini" onClick={() => descargar(doc)}>Descargar</button>
                    <button type="button" className="btn-icono peligro" title="Eliminar archivo" onClick={() => borrarArchivo(doc)}>×</button>
                  </div>
                ))}
                {!soloLectura && (
                  <label className={`btn mini subir-archivo ${subiendo ? "deshabilitado" : ""}`}>
                    {subiendo === "Otros" ? "Subiendo…" : "+ Subir otro documento"}
                    <input
                      type="file"
                      hidden
                      disabled={Boolean(subiendo)}
                      onChange={(e) => subirArchivo(e, "Otros")}
                    />
                  </label>
                )}
              </div>
            </div>

            <div className="modal-pie">
              {!soloLectura && (
                <button type="button" className="btn peligro" onClick={eliminarTareaActual}>Quitar hito del expediente</button>
              )}
              <span className="pie-espacio" />
              <button
                type="button"
                className="btn"
                onClick={descargarTodos}
                disabled={!(tarea.documentos || []).length}
              >
                Descargar todos
              </button>
              <button type="button" className="btn" onClick={() => setTareaId(null)}>Cerrar</button>
              {!soloLectura && tarea.estado === "Completado" ? (
                <button
                  type="button"
                  className="btn"
                  onClick={() => cambiarItem({ estado: "Pendiente" })}
                >
                  Desmarcar hito
                </button>
              ) : !soloLectura ? (
                <button
                  type="button"
                  className="btn primario"
                  onClick={() => { cambiarItem({ estado: "Completado" }); setTareaId(null); }}
                >
                  Marcar completado
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {modalEventual && (
        <div className="modal-fondo" onClick={(e) => e.target === e.currentTarget && setModalEventual(false)}>
          <form className="modal" onSubmit={crearEventual}>
            <div className="modal-cab">
              <div>
                <h3>Nuevo trámite eventual</h3>
                <span className="ref">Solo se crea cuando ocurre el hecho generador. Cada instancia conserva sus propios documentos y plazos.</span>
              </div>
              <button type="button" className="cerrar" onClick={() => setModalEventual(false)}>×</button>
            </div>
            <div className="modal-cuerpo">
              <div className="eventuales-grid">
                {opcionesEventuales.map((op) => (
                  <button
                    type="button"
                    key={op.clave}
                    className={`eventual-opcion ${eventualSel === op.clave ? "seleccionada" : ""}`}
                    onClick={() => setEventualSel(op.clave)}
                  >
                    <strong>{op.nombre}</strong>
                    <span>{op.docs.length} documentos requeridos</span>
                    <span>{op.dias ? `${op.dias} días ${op.habiles !== false ? "hábiles" : "calendario"}` : "Plazo según sustento"}</span>
                    <span className="ref">{op.norma}</span>
                  </button>
                ))}
              </div>
              {eventualSel && (
                <div className="nota-info">
                  Se creará el trámite con su código correlativo dentro de “Modificaciones y ampliaciones”. Luego podrás subir cada documento y ajustar su fecha límite.
                </div>
              )}
            </div>
            <div className="modal-pie">
              <button type="button" className="btn" onClick={() => setModalEventual(false)}>Cancelar</button>
              <button type="submit" className="btn primario" disabled={!eventualSel}>Crear trámite</button>
            </div>
          </form>
        </div>
      )}

      {modalHito && (
        <div className="modal-fondo" onClick={(e) => e.target === e.currentTarget && setModalHito(false)}>
          <form className="modal" onSubmit={agregarHito}>
            <div className="modal-cab"><h3>Agregar hito propio</h3><button type="button" className="cerrar" onClick={() => setModalHito(false)}>×</button></div>
            <div className="modal-cuerpo">
              <label className="campo-grupo">
                <span className="campo">Nombre del hito *</span>
                <input value={nuevoHito.nombre} onChange={(e) => setNuevoHito({ ...nuevoHito, nombre: e.target.value })} placeholder="Ej. Comunicación adicional al supervisor" required />
              </label>
              <label className="campo-grupo">
                <span className="campo">Etapa</span>
                <select value={nuevoHito.etapa} onChange={(e) => setNuevoHito({ ...nuevoHito, etapa: e.target.value })}>
                  {etapas.map((e) => <option key={e.codigo} value={e.nombre}>{e.codigo} · {e.nombre}</option>)}
                  <option value="Hitos propios">Hitos propios</option>
                </select>
              </label>
              <label className="opcion-plantilla">
                <input
                  type="checkbox"
                  checked={guardarHitoEnCatalogo}
                  onChange={(e) => setGuardarHitoEnCatalogo(e.target.checked)}
                />
                Guardar también en el catálogo para futuras obras
              </label>
              <div className="nota-info">
                Sin la casilla marcada, el hito queda solo en este contrato. Con la casilla marcada, se agrega al catálogo y se generará automáticamente en los contratos nuevos de {tramite.tipo_objeto}.
              </div>
            </div>
            <div className="modal-pie">
              <button type="button" className="btn" onClick={() => setModalHito(false)}>Cancelar</button>
              <button type="submit" className="btn primario">Agregar hito</button>
            </div>
          </form>
        </div>
      )}

      {editandoCatalogo && (
        <div className="modal-fondo" onClick={(e) => e.target === e.currentTarget && setEditandoCatalogo(false)}>
          <form className="modal" onSubmit={guardarEdicionCatalogo}>
            <div className="modal-cab">
              <div>
                <h3>{catalogoModo === "crear" ? "Convertir en hito de catálogo" : "Editar catálogo del hito"}</h3>
                <span className="ref">
                  {catalogoModo === "crear"
                    ? "Elige una etapa real para ordenarlo junto a los hitos del catálogo. “Hitos propios” lo mantiene aparte."
                    : "Los cambios se guardan en la plantilla y aparecerán en los contratos nuevos."}
                </span>
              </div>
              <button type="button" className="cerrar" onClick={() => setEditandoCatalogo(false)}>×</button>
            </div>
            <div className="modal-cuerpo">
              {catalogoModo === "crear" && (
                <label className="campo-grupo">
                  <span className="campo">Etapa del catálogo</span>
                  <select
                    value={catalogoForm.etapaCodigo || "1.1"}
                    onChange={(e) => {
                      const etapa = catalogoDe(tramite.tipo_objeto).etapas.find((x) => x.codigo === e.target.value);
                      setCatalogoForm({
                        ...catalogoForm,
                        etapaCodigo: e.target.value,
                        etapaNombre: etapa ? etapa.nombre : "Hitos propios",
                      });
                    }}
                  >
                    {catalogoDe(tramite.tipo_objeto).etapas.map((e) => (
                      <option key={e.codigo} value={e.codigo}>{e.codigo} · {e.nombre}</option>
                    ))}
                    <option value="P">Hitos propios</option>
                  </select>
                </label>
              )}
              <div className="grid-form">
                <label className="campo-grupo ancho-completo">
                  <span className="campo">Nombre del hito</span>
                  <input value={catalogoForm.nombre || ""} onChange={(e) => setCatalogoForm({ ...catalogoForm, nombre: e.target.value })} />
                </label>
                <label className="campo-grupo">
                  <span className="campo">Plazo (días)</span>
                  <input type="number" min="0" value={catalogoForm.dias || 0} onChange={(e) => setCatalogoForm({ ...catalogoForm, dias: e.target.value })} />
                </label>
                <label className="campo-grupo">
                  <span className="campo">Base del plazo</span>
                  <select value={catalogoForm.base || "inicio"} onChange={(e) => setCatalogoForm({ ...catalogoForm, base: e.target.value })}>
                    <option value="suscripcion">Fecha de suscripción</option>
                    <option value="inicio">Fecha de inicio</option>
                  </select>
                </label>
                <label className="campo-grupo">
                  <span className="campo">Tipo de plazo</span>
                  <select value={catalogoForm.habiles ? "habiles" : "calendario"} onChange={(e) => setCatalogoForm({ ...catalogoForm, habiles: e.target.value === "habiles" })}>
                    <option value="habiles">Días hábiles</option>
                    <option value="calendario">Días calendario</option>
                  </select>
                </label>
                <label className="campo-grupo ancho-completo">
                  <span className="campo">Documentos requeridos (uno por línea)</span>
                  <textarea rows="4" value={catalogoForm.docs || ""} onChange={(e) => setCatalogoForm({ ...catalogoForm, docs: e.target.value })} />
                </label>
                <label className="campo-grupo">
                  <span className="campo">Documento que da por cumplido el hito</span>
                  <input value={catalogoForm.cumplimiento || ""} onChange={(e) => setCatalogoForm({ ...catalogoForm, cumplimiento: e.target.value })} />
                </label>
                <label className="campo-grupo">
                  <span className="campo">Norma de referencia</span>
                  <input value={catalogoForm.norma || ""} onChange={(e) => setCatalogoForm({ ...catalogoForm, norma: e.target.value })} />
                </label>
              </div>
            </div>
            <div className="modal-pie">
              <button type="button" className="btn" onClick={() => setEditandoCatalogo(false)}>Cancelar</button>
              <button type="submit" className="btn primario">{catalogoModo === "crear" ? "Convertir y guardar" : "Guardar en catálogo"}</button>
            </div>
          </form>
        </div>
      )}

      {modalOpcional && (
        <div className="modal-fondo" onClick={(e) => e.target === e.currentTarget && setModalOpcional(false)}>
          <form className="modal" onSubmit={crearOpcional}>
            <div className="modal-cab">
              <div>
                <h3>Agregar hito opcional</h3>
                <span className="ref">Hitos que no se generan por defecto. Se numeran dentro de su etapa.</span>
              </div>
              <button type="button" className="cerrar" onClick={() => setModalOpcional(false)}>×</button>
            </div>
            <div className="modal-cuerpo">
              <div className="eventuales-grid">
                {listarHitosOpcionales(tramite.tipo_objeto).map((op) => (
                  <button
                    type="button"
                    key={op.clave}
                    className={`eventual-opcion ${opcionalSel === op.clave ? "seleccionada" : ""}`}
                    onClick={() => setOpcionalSel(op.clave)}
                  >
                    <strong>{op.nombre}</strong>
                    <span>{op.docs.length} documentos requeridos</span>
                    <span className="ref">{op.nota}</span>
                  </button>
                ))}
              </div>
              {listarHitosOpcionales(tramite.tipo_objeto).length === 0 && (
                <div className="vacio">No hay hitos opcionales para este tipo de contrato.</div>
              )}
              <div className="nota-info">Estos hitos se agregan solo a este contrato. Para que aparezcan en obras nuevas, regístralos en Configuración → Catálogo personalizado de hitos.</div>
            </div>
            <div className="modal-pie">
              <button type="button" className="btn" onClick={() => setModalOpcional(false)}>Cancelar</button>
              <button type="submit" className="btn primario" disabled={!opcionalSel}>Agregar hito</button>
            </div>
          </form>
        </div>
      )}

      {modalFianzas && (
        <div className="modal-fondo" onClick={(e) => e.target === e.currentTarget && setModalFianzas(false)}>
          <form className="modal" onSubmit={guardarFianzas}>
            <div className="modal-cab">
              <div>
                <h3>Configurar cartas fianza</h3>
                <span className="ref">Define el periodo de renovación y los tipos de garantía del expediente.</span>
              </div>
              <button type="button" className="cerrar" onClick={() => setModalFianzas(false)}>×</button>
            </div>
            <div className="modal-cuerpo">
              <label className="campo-grupo">
                <span className="campo">Periodo de renovación</span>
                <select
                  value={configFianzas.periodo || "anual"}
                  onChange={(e) => setConfigFianzas({ ...configFianzas, periodo: e.target.value })}
                >
                  <option value="mensual">Mensual</option>
                  <option value="trimestral">Trimestral</option>
                  <option value="semestral">Semestral</option>
                  <option value="anual">Anual</option>
                </select>
              </label>
              <div className="campo-grupo">
                <span className="campo">Tipos de carta fianza</span>
                <div className="tipos-fianza">
                  {TIPOS_FIANZA.map((tipo) => (
                    <label key={tipo.clave} className="opcion-fianza">
                      <input
                        type="checkbox"
                        checked={(configFianzas.tipos || []).includes(tipo.clave)}
                        onChange={() => setConfigFianzas((prev) => ({
                          ...prev,
                          tipos: (prev.tipos || []).includes(tipo.clave)
                            ? (prev.tipos || []).filter((x) => x !== tipo.clave)
                            : [...(prev.tipos || []), tipo.clave],
                        }))}
                      />
                      {tipo.etiqueta}
                    </label>
                  ))}
                </div>
              </div>
              <div className="nota-info">Se regenerarán los hitos de renovación. Los documentos ya cargados se conservan en el mismo orden.</div>
            </div>
            <div className="modal-pie">
              <button type="button" className="btn" onClick={() => setModalFianzas(false)}>Cancelar</button>
              <button type="submit" className="btn primario" disabled={!configFianzas.tipos?.length}>Guardar configuración</button>
            </div>
          </form>
        </div>
      )}

      {editando && (
        <div className="modal-fondo" onClick={(e) => e.target === e.currentTarget && setEditando(false)}>
          <form className="modal" onSubmit={guardarTramite}>
            <div className="modal-cab"><h3>Editar contrato</h3><button type="button" className="cerrar" onClick={() => setEditando(false)}>×</button></div>
            <div className="modal-cuerpo">
              <div className="grid-form">
                <label className="campo-grupo"><span className="campo">Código</span><input value={form.codigo || ""} onChange={(e) => setForm({ ...form, codigo: e.target.value })} /></label>
                <label className="campo-grupo">
                  <span className="campo">Estado</span>
                  <select value={form.estado || ""} onChange={(e) => setForm({ ...form, estado: e.target.value })}>
                    <option>En ejecución</option><option>Suscrito</option><option>Paralizado</option><option>Recepcionado</option><option>Liquidado</option>
                  </select>
                </label>
                <label className="campo-grupo ancho-completo"><span className="campo">Denominación</span><input value={form.denominacion || ""} onChange={(e) => setForm({ ...form, denominacion: e.target.value })} /></label>
                <label className="campo-grupo"><span className="campo">Entidad</span><input value={form.entidad || ""} onChange={(e) => setForm({ ...form, entidad: e.target.value })} /></label>
                <label className="campo-grupo"><span className="campo">Contratista</span><input value={form.contratista || ""} onChange={(e) => setForm({ ...form, contratista: e.target.value })} /></label>
                <label className="campo-grupo"><span className="campo">Monto</span><input type="number" value={form.monto || 0} onChange={(e) => setForm({ ...form, monto: e.target.value })} /></label>
                <label className="campo-grupo"><span className="campo">Fecha de suscripción</span><input type="date" value={form.fecha_suscripcion || ""} onChange={(e) => setForm({ ...form, fecha_suscripcion: e.target.value })} /></label>
                <label className="campo-grupo"><span className="campo">Inicio</span><input type="date" value={form.fecha_inicio || ""} onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })} /></label>
                <label className="campo-grupo"><span className="campo">Fin contractual</span><input type="date" value={form.fecha_fin || ""} onChange={(e) => setForm({ ...form, fecha_fin: e.target.value })} /></label>
              </div>
            </div>
            <div className="modal-pie">
              <button type="button" className="btn" onClick={() => setEditando(false)}>Cancelar</button>
              <button className="btn primario" type="submit">Guardar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
