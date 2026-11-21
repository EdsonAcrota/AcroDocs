import React, { useMemo, useState } from "react";
import { useParams, Link, useSearchParams, useNavigate } from "react-router-dom";
import {
  getTramite, updateTramite, deleteTramite, listItems, updateItem, addItem, removeItem, marcarRequisitoNoCorresponde,
  agregarDocumento, agregarVersionDocumento, siguienteVersion, eliminarDocumento, puede,
  addTareaEventual, listarEventuales, listarHitosOpcionales, addHitoOpcional,
  agregarPeriodo, getConfigFianzas, guardarConfigFianzas, guardarPlantilla,
  actualizarCatalogoPorClave, agregarCatalogoHito, moverItem, hoyISO,
  estadoCatalogoDeHito, actualizarCatalogoDesdeHito, convertirEnCatalogoLista, describirCamposCatalogo,
  listProcedimientos, getProcedimiento, crearProcedimiento, actualizarProcedimiento,
  eliminarProcedimiento, agregarMovimientoProcedimiento,
  ESTADOS_TRAMITE, PRIORIDADES_TRAMITE,
  nombreEjecutor, validarEjecutor,
} from "../lib/store.js";
import { diasEntre } from "../lib/fechas.js";
import { avanceRequisitos, estadoRequisito, faltantes } from "../lib/requisitos.js";
import { TIPOS_FIANZA, PERIODOS_A_MANO, CLASES_HITO, catalogoDe, ordenarGrupos, claseDeHito } from "../lib/catalogo.js";
import {
  guardarArchivo, descargarArchivo, descargarComoZip, eliminarArchivo, formatearTamano, iconoArchivo,
} from "../lib/archivos.js";
import HistorialLista from "../components/HistorialLista.jsx";
import EjecutorForm from "../components/EjecutorForm.jsx";
import LineaTiempo from "../components/LineaTiempo.jsx";
import { BotonVer } from "../components/VisorArchivo.jsx";
import Plegable from "../components/Plegable.jsx";
import SubirArchivo, { TomarFoto } from "../components/SubirArchivo.jsx";

const ROTULO_TIPO_CATALOGO = { hito: "hito de catálogo", recurrente: "hito recurrente", eventual: "hito eventual", opcional: "hito opcional" };

const fmt = (n) => new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 0 }).format(n || 0);
const fecha = (f) => (f ? new Date(`${f}T12:00:00`).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const ESTADOS = ["Pendiente", "En revisión", "Completado", "Observado", "No aplica"];

// "Hito de catálogo", "Hito recurrente", "Hito eventual", "Hito opcional" o "Hito propio".
const etiquetaClase = (item) => (item.tipo === "tramite" ? "Trámite" : CLASES_HITO[claseDeHito(item)].etiqueta);

// Insignia de la clase del hito; en un recurrente incluye su periodo ("Hito recurrente · marzo 2026").
const InsigniaClase = ({ item }) => {
  const clase = claseDeHito(item);
  const { etiqueta, color } = CLASES_HITO[clase];
  return <span className={`badge ${color}`}>{etiqueta}{clase === "recurrente" && item.periodo ? ` · ${item.periodo}` : ""}</span>;
};

const nombrePorEtiqueta = (etiqueta, nombreOriginal = "") => {
  const extension = nombreOriginal.includes(".") ? `.${nombreOriginal.split(".").pop()}` : "";
  const limpio = String(etiqueta || "Documento")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return `${limpio}${extension}`;
};

const fechaHora = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
};

// "Carta.pdf" -> "Carta (v2).pdf": cada versión nueva es un archivo aparte y su nombre las distingue.
const nombreConVersion = (nombre, numero) => {
  const punto = nombre.lastIndexOf(".");
  const base = punto > 0 ? nombre.slice(0, punto) : nombre;
  const extension = punto > 0 ? nombre.slice(punto) : "";
  return `${base} (v${numero})${extension}`;
};

// Nombre con el que se descarga una versión anterior: el del documento más
// "(versión N)", para que no choque con el archivo vigente en la carpeta de descargas.
const nombreDeVersion = (doc, version, numero) => {
  const nombre = version.nombre || doc.nombre || "documento";
  const punto = nombre.lastIndexOf(".");
  const base = punto > 0 ? nombre.slice(0, punto) : nombre;
  const extension = punto > 0 ? nombre.slice(punto) : "";
  return `${base} (versión ${numero})${extension}`;
};

const MENSAJE_SIN_PERMISO = "No tienes permiso para esta acción.";

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

const silencioProducido = (tarea) =>
  Boolean(tarea.silencioPositivo) &&
  tarea.estado !== "Completado" &&
  tarea.estado !== "No aplica" &&
  Boolean(tarea.fecha_limite) &&
  diasEntre(hoyISO(), tarea.fecha_limite) < 0;

export default function TramiteDetalle() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  // Cada botón se muestra según su permiso sobre ESTE contrato (un residente solo
  // actúa en los suyos). Se calcula una vez por contrato: leer el almacén es caro.
  const permiso = useMemo(
    () => Object.fromEntries(
      ["editar", "eliminar", "agregar", "estado", "plazos", "borrar_hito", "subir", "reemplazar", "borrar_doc", "descargar", "catalogo", "registrar", "corregir"]
        .map((clave) => [clave, puede(clave, id)])
    ),
    [id]
  );
  const [tramite, setTramite] = useState(getTramite(id));
  const [errorTramite, setErrorTramite] = useState("");
  const [items, setItems] = useState(listItems(id));
  const [procedimientos, setProcedimientos] = useState(listProcedimientos(id));
  const [procedimientoId, setProcedimientoId] = useState(null);
  const [modalProcedimiento, setModalProcedimiento] = useState(false);
  const [procForm, setProcForm] = useState({});
  const [movForm, setMovForm] = useState({});
  const [procArchivo, setProcArchivo] = useState(null);
  const [errorProc, setErrorProc] = useState("");
  const [tab, setTab] = useState("expediente");
  const [buscar, setBuscar] = useState("");
  const [filtroEtapa, setFiltroEtapa] = useState("Todas");
  const [filtroEstado, setFiltroEstado] = useState("Todos");
  const [filtroDocs, setFiltroDocs] = useState("Todos");
  const [filtroTipo, setFiltroTipo] = useState("Todos");
  const [colapsadas, setColapsadas] = useState([]);
  const [tareaId, setTareaId] = useState(searchParams.get("tarea") || null);
  const [subiendo, setSubiendo] = useState("");
  const [errorArchivo, setErrorArchivo] = useState("");
  const [modalEventual, setModalEventual] = useState(false);
  const [eventualSel, setEventualSel] = useState("");
  const [eventualHitoId, setEventualHitoId] = useState("");
  const [modalHito, setModalHito] = useState(false);
  const [nuevoHito, setNuevoHito] = useState({ nombre: "", etapa: "Hitos propios" });
  const [guardarHitoEnCatalogo, setGuardarHitoEnCatalogo] = useState(false);
  const [notaCatalogo, setNotaCatalogo] = useState("");
  const [modalOpcional, setModalOpcional] = useState(false);
  const [opcionalSel, setOpcionalSel] = useState("");
  const [modalFianzas, setModalFianzas] = useState(false);
  const [configFianzas, setConfigFianzas] = useState(getConfigFianzas(id));
  const [errorFianzas, setErrorFianzas] = useState("");
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

  // Dónde está este hito en el catálogo y en qué difiere hoy (se recalcula al recargar).
  const estadoCatalogo = useMemo(
    () => (tarea ? estadoCatalogoDeHito(tarea.id) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tarea]
  );

  const tramitesVinculados = useMemo(
    () => (tarea ? items.filter((i) => i.hito_id === tarea.id) : []),
    [items, tarea]
  );

  const hitoPadre = useMemo(
    () => (tarea?.hito_id ? items.find((i) => i.id === tarea.hito_id) || null : null),
    [items, tarea]
  );

  const proc = useMemo(
    () => procedimientos.find((p) => p.id === procedimientoId) || null,
    [procedimientos, procedimientoId]
  );

  const procedimientosDelHito = useMemo(
    () => (tarea ? procedimientos.filter((p) => p.hitoId === tarea.id) : []),
    [procedimientos, tarea]
  );

  // Archivos que no corresponden a ningún requisito de la lista.
  const otrosDocumentos = useMemo(
    () => (tarea ? (tarea.documentos || []).filter((d) => !(tarea.docsRequeridos || []).includes(d.tipoDoc)) : []),
    [tarea]
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
      const e = mapa.get(t.etapaCodigo);
      if (!Number.isFinite(e.orden) && Number.isFinite(t.etapaOrden)) e.orden = t.etapaOrden;
    }
    return ordenarGrupos([...mapa.values()]);
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
      const coincideTipo = filtroTipo === "Todos" || claseDeHito(i) === filtroTipo;
      const pendientes = i.estado === "No aplica" ? 0 : faltantes(i).length;
      const coincideDocs =
        filtroDocs === "Todos" ||
        (filtroDocs === "Pendientes" && pendientes > 0) ||
        (filtroDocs === "Completos" && pendientes === 0);
      return coincideTexto && coincideEtapa && coincideEstado && coincideTipo && coincideDocs;
    });
  }, [items, buscar, filtroEtapa, filtroEstado, filtroDocs, filtroTipo]);

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
      if (!Number.isFinite(etapa.orden) && Number.isFinite(t.etapaOrden)) etapa.orden = t.etapaOrden;
      if (!etapa.secciones.has(t.seccionCodigo)) {
        etapa.secciones.set(t.seccionCodigo, {
          codigo: t.seccionCodigo,
          nombre: t.seccionNombre,
          tareas: [],
        });
      }
      const seccion = etapa.secciones.get(t.seccionCodigo);
      if (!Number.isFinite(seccion.orden) && Number.isFinite(t.seccionOrden)) seccion.orden = t.seccionOrden;
      seccion.tareas.push(t);
    }
    return ordenarGrupos([...mapa.values()])
      .map((e) => ({
        ...e,
        secciones: ordenarGrupos([...e.secciones.values()])
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
    () => items.filter((i) => claseDeHito(i) === "eventual"),
    [items]
  );

  const propios = useMemo(
    () => items.filter((i) => claseDeHito(i) === "propio"),
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

  const ejecutorConsorcio = tramite.ejecutor?.tipo === "consorcio";
  const integrantesEjecutor = ejecutorConsorcio ? tramite.ejecutor.integrantes || [] : [];
  const avisosEjecutor = validarEjecutor(tramite.ejecutor);

  const recargar = () => {
    setItems(listItems(id));
    setProcedimientos(listProcedimientos(id));
  };

  const cambiarItem = (cambios) => {
    if (!tarea) return;
    try {
      updateItem(tarea.id, cambios);
      setErrorArchivo("");
    } catch (error) {
      setErrorArchivo(error?.message || "No se pudo guardar el cambio.");
    }
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
    if (!permiso.editar) return;
    const t = updateTramite(id, form);
    setTramite(t);
    setEditando(false);
  };

  const abrirNuevoProcedimiento = (hitoId = "") => {
    setErrorProc("");
    setProcForm({ nombre: "", hitoId, destino: "entidad", descripcion: "" });
    setModalProcedimiento(true);
  };

  const guardarProcedimiento = (e) => {
    e.preventDefault();
    if (!permiso.agregar) return;
    try {
      const creado = crearProcedimiento({ ...procForm, tramiteId: id });
      recargar();
      setModalProcedimiento(false);
      setProcedimientoId(creado.id);
    } catch (err) {
      setErrorProc(err?.message || "No se pudo crear el trámite.");
    }
  };

  const abrirProcedimiento = (proc) => {
    setErrorProc("");
    setProcedimientoId(proc.id);
  };

  const borrarProcedimiento = () => {
    if (!proc || !permiso.borrar_hito) return;
    if (!window.confirm(`¿Eliminar el trámite “${proc.nombre}”? Sus cargos quedan en mesa de partes pero se desvinculan.`)) return;
    try {
      eliminarProcedimiento(proc.id);
      setProcedimientoId(null);
      recargar();
    } catch (err) {
      setErrorProc(err?.message || "No se pudo eliminar el trámite.");
    }
  };

  const guardarMovimientoProc = async (e) => {
    e.preventDefault();
    if (!proc) return;
    try {
      let subido = null;
      if (procArchivo) {
        subido = await guardarArchivo(procArchivo, {
          tramiteId: id, tareaId: proc.hitoId, tipoDoc: "Movimiento de trámite", nombre: procArchivo.name, permiso: "registrar",
        });
      }
      agregarMovimientoProcedimiento(proc.id, {
        ...movForm,
        archivoId: subido?.archivoId || null,
        archivoNombre: subido?.nombre || "",
      });
      setMovForm({});
      setProcArchivo(null);
      recargar();
    } catch (err) {
      setErrorProc(err?.message || "No se pudo registrar el movimiento.");
    }
  };

  const crearEventual = (e) => {
    e.preventDefault();
    if (!permiso.agregar || !eventualSel) return;
    const nueva = addTareaEventual(id, eventualSel, eventualHitoId || null);
    recargar();
    setModalEventual(false);
    setEventualSel("");
    setEventualHitoId("");
    if (nueva) abrirTarea(nueva);
  };

  const agregarHito = (e) => {
    e.preventDefault();
    if (!permiso.agregar || !nuevoHito.nombre.trim()) return;
    const creado = addItem(id, nuevoHito.nombre.trim(), nuevoHito.etapa);
    let mensaje = "";
    if (guardarHitoEnCatalogo && permiso.catalogo && creado) {
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
    if (!permiso.agregar || !opcionalSel) return;
    const creado = addHitoOpcional(id, opcionalSel);
    recargar();
    setModalOpcional(false);
    setOpcionalSel("");
    if (creado) abrirTarea(creado);
  };

  const agregarMes = (seccionCodigo) => {
    if (!permiso.agregar || !seccionCodigo) return;
    const creado = agregarPeriodo(id, seccionCodigo);
    recargar();
    if (creado) abrirTarea(creado);
  };

  const abrirFianzas = () => {
    setConfigFianzas(getConfigFianzas(id));
    setErrorFianzas("");
    setModalFianzas(true);
  };

  const guardarFianzas = (e) => {
    e.preventDefault();
    if (!permiso.agregar || !configFianzas.tipos?.length) return;
    try {
      guardarConfigFianzas(id, configFianzas);
    } catch (error) {
      // El store exige eliminar hitos si la nueva configuración deja sin sitio a hitos con documentos.
      setErrorFianzas(
        error?.message === MENSAJE_SIN_PERMISO
          ? "Esta configuración quitaría hitos que ya tienen documentos. Solo quien puede eliminar hitos puede hacerlo."
          : error?.message || "No se pudo guardar la configuración."
      );
      return;
    }
    recargar();
    setModalFianzas(false);
  };

  const actualizarDocumentos = (docs, cumplimiento) => {
    if (!tarea) return;
    const cambios = { docsRequeridos: docs };
    if ((tarea.docsNoCorresponde || []).length) cambios.docsNoCorresponde = tarea.docsNoCorresponde.filter((r) => docs.includes(r));
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

  const alternarNoCorresponde = (requisito, noCorresponde) => {
    if (!tarea || !permiso.estado) return;
    try {
      marcarRequisitoNoCorresponde(tarea.id, requisito, noCorresponde);
      setErrorArchivo("");
    } catch (error) {
      setErrorArchivo(error?.message || "No se pudo guardar el cambio.");
    }
    recargar();
  };

  const botonNoCorresponde = (requisito) => (
    <button type="button" className="btn mini btn-no-corresponde" title="Este documento no corresponde a este contrato; se da por cumplido" onClick={() => alternarNoCorresponde(requisito, true)}>No corresponde</button>
  );

  const moverDocumento = (index, direccion) => {
    if (!tarea || !permiso.catalogo) return;
    const docs = [...(tarea.docsRequeridos || [])];
    const otro = docs[index + direccion];
    if (!otro) return;
    [docs[index], docs[index + direccion]] = [docs[index + direccion], docs[index]];
    actualizarDocumentos(docs);
  };

  const quitarDocumento = (nombre) => {
    if (!tarea || !permiso.catalogo) return;
    if (!window.confirm(`¿Quitar el documento "${nombre}" de este hito?`)) return;
    actualizarDocumentos((tarea.docsRequeridos || []).filter((d) => d !== nombre));
  };

  const agregarRequisito = (e) => {
    e.preventDefault();
    if (!tarea || !permiso.catalogo || !nuevoDoc.trim()) return;
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
    if (!tarea || !permiso.catalogo) return;
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

  // Copia al catálogo lo que este hito tiene hoy; los contratos nuevos lo usarán.
  const actualizarCatalogoConEsteHito = () => {
    if (!tarea || !permiso.catalogo || !estadoCatalogo || estadoCatalogo.campos.length === 0) return;
    const que = describirCamposCatalogo(estadoCatalogo.campos);
    if (!window.confirm(`Se actualizará el catálogo con lo que tiene este hito: ${que}.\n\nLos contratos nuevos usarán ese detalle; los que ya existen no cambian. ¿Continuar?`)) return;
    try {
      actualizarCatalogoDesdeHito(tarea.id);
      setNotaCatalogo(`Catálogo actualizado con “${tarea.nombre}”: ${que}. Los cambios se aplicarán a contratos nuevos.`);
    } catch (error) {
      setErrorTramite(error?.message || "No se pudo actualizar el catálogo.");
      return;
    }
    recargar();
  };

  const abrirEditarCatalogo = () => {
    if (!tarea || !permiso.catalogo) return;
    // Un hito con plantilla de hito en el catálogo (base o propio) se edita; el que aún
    // no está en el catálogo se convierte.
    const esDelCatalogo = estadoCatalogo?.tipo === "hito";
    const etapas = catalogoDe(tramite.tipo_objeto).etapas;
    const etapaActual = etapas.find((e) => e.codigo === tarea.etapaCodigo);
    const etapa = esDelCatalogo || etapaActual
      ? { codigo: tarea.etapaCodigo, nombre: tarea.etapaNombre }
      : etapas[0];
    setCatalogoModo(esDelCatalogo ? "editar" : "crear");
    setCatalogoForm({
      tipoCat: "hito",
      silencioPositivo: false,
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
    if (!tarea || !permiso.catalogo) return;
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

    if (catalogoModo === "crear" && catalogoForm.tipoCat !== "hito") {
      const esEventual = catalogoForm.tipoCat === "eventual";
      try {
        convertirEnCatalogoLista(tarea.id, catalogoForm.tipoCat, {
          nombre,
          docs,
          cumplimiento,
          dias: cambios.plazoDias,
          habiles: cambios.plazoHabiles,
          base: cambios.plazoBase,
          norma: cambios.norma,
          silencioPositivo: catalogoForm.silencioPositivo,
          // "Hitos propios" solo vale para un hito del catálogo; uno opcional necesita una etapa real.
          etapaCodigo: catalogoForm.etapaCodigo !== "P" ? catalogoForm.etapaCodigo : undefined,
          etapaNombre: catalogoForm.etapaCodigo !== "P" ? catalogoForm.etapaNombre : undefined,
        });
      } catch (error) {
        setErrorTramite(error?.message || "No se pudo agregar al catálogo.");
        return;
      }
      setNotaCatalogo(`“${nombre}” se agregó al catálogo como ${esEventual ? "hito eventual" : "hito opcional"} de ${tramite.tipo_objeto}. Los contratos nuevos lo podrán agregar desde ${esEventual ? "“+ Hito eventual”" : "“+ Hito opcional”"}.`);
    } else if (catalogoModo === "crear") {
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
      // Ambas funciones escriben en el catálogo almacenado; un hito propio
      // (`cat_…`) se edita por su clave, el resto por la plantilla de su código.
      if (String(tarea.clavePlantilla || "").startsWith("cat_")) {
        actualizarCatalogoPorClave(tarea.clavePlantilla, {
          nombre,
          docs,
          cumplimiento,
          dias: cambios.plazoDias,
          base: cambios.plazoBase,
          habiles: cambios.plazoHabiles,
          norma: cambios.norma,
        });
      } else if (tarea.clavePlantilla) {
        guardarPlantilla(tarea.clavePlantilla, {
          docs,
          cumplimiento,
          nombre,
          plazoDias: cambios.plazoDias,
          plazoBase: cambios.plazoBase,
          plazoHabiles: cambios.plazoHabiles,
          norma: cambios.norma,
        });
      }
      setNotaCatalogo(`Catálogo de “${nombre}” actualizado. Los cambios se aplicarán a contratos nuevos.`);
    }
    recargar();
    setEditandoCatalogo(false);
  };

  const moverHito = (item, direccion) => {
    if (!permiso.agregar) return;
    moverItem(id, item.id, direccion);
    recargar();
  };

  const subirArchivo = async (event, tipoDoc) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!permiso.subir || !file || !tarea) return;
    if (file.size > 30 * 1024 * 1024) {
      setErrorArchivo("El archivo supera el límite de 30 MB.");
      return;
    }
    setErrorArchivo("");
    setSubiendo(tipoDoc || "Otros");
    try {
      const meta = await guardarArchivo(file, {
        tramiteId: id,
        tareaId: tarea.id,
        permiso: "subir",
        tipoDoc: tipoDoc || "Otros",
        nombre: nombrePorEtiqueta(tipoDoc || "Documento", file.name),
      });
      try {
        agregarDocumento(tarea.id, meta);
      } catch (error) {
        await eliminarArchivo(meta.archivoId).catch(() => {}); // no dejar el archivo huérfano
        throw error;
      }
      // Dar el hito por cumplido es cambiar su estado: solo con el permiso `estado`.
      const cumple = Boolean(tipoDoc && tarea.docCumplimiento && tipoDoc === tarea.docCumplimiento);
      // En un hito con pasos el estado lo marcan los pasos, no un archivo.
      if (cumple && permiso.estado && !tarea.pasos?.length) {
        updateItem(tarea.id, { estado: "Completado", fecha: tarea.fecha || hoyISO() });
      }
      recargar();
    } catch (error) {
      setErrorArchivo(error?.message || "No se pudo guardar el archivo.");
    } finally {
      setSubiendo("");
    }
  };

  // Sube el archivo nuevo y lo agrega como un archivo adicional del mismo documento ("versión N"):
  // el anterior no se reemplaza ni se oculta, sigue en la lista.
  const subirNuevaVersion = async (event, doc) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!permiso.reemplazar || !file || !tarea) return;
    if (file.size > 30 * 1024 * 1024) {
      setErrorArchivo("El archivo supera el límite de 30 MB.");
      return;
    }
    setErrorArchivo("");
    setSubiendo(`v:${doc.id}`);
    try {
      const meta = await guardarArchivo(file, {
        tramiteId: id,
        tareaId: tarea.id,
        permiso: "reemplazar",
        tipoDoc: doc.tipoDoc || "Otros",
        nombre: nombreConVersion(nombrePorEtiqueta(doc.tipoDoc || "Documento", file.name), siguienteVersion(tarea.documentos, doc)),
      });
      try {
        agregarVersionDocumento(tarea.id, doc.id, meta);
      } catch (error) {
        await eliminarArchivo(meta.archivoId).catch(() => {});
        throw error;
      }
      recargar();
    } catch (error) {
      setErrorArchivo(error?.message || "No se pudo guardar la nueva versión.");
    } finally {
      setSubiendo("");
    }
  };

  const borrarArchivo = (doc) => {
    if (!permiso.borrar_doc || !tarea) return;
    const versiones = (doc.versiones || []).length;
    const conVersiones = versiones === 0 ? "" : versiones === 1 ? " y su versión anterior" : ` y sus ${versiones} versiones anteriores`;
    const aviso = `¿Eliminar el archivo "${doc.nombre}"${conVersiones}? Esta acción queda registrada en el historial.`;
    if (!window.confirm(aviso)) return;
    try {
      eliminarDocumento(tarea.id, doc.id);
      setErrorArchivo("");
    } catch (error) {
      setErrorArchivo(error?.message || "No se pudo eliminar el archivo.");
    }
    recargar();
  };

  const descargar = async (doc) => {
    if (!permiso.descargar) return;
    try {
      await descargarArchivo(doc.archivoId, doc.nombre);
    } catch (error) {
      setErrorArchivo(error?.message || "No se pudo descargar el archivo.");
    }
  };

  const descargarVersion = async (doc, version, numero) => {
    if (!permiso.descargar) return;
    try {
      await descargarArchivo(version.archivoId, nombreDeVersion(doc, version, numero));
    } catch (error) {
      setErrorArchivo(error?.message || "No se pudo descargar la versión.");
    }
  };

  const descargarTodos = async () => {
    if (!permiso.descargar || !tarea) return;
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
    if (!permiso.descargar) return;
    const documentos = items.flatMap((i) =>
      (i.documentos || []).map((doc) => ({ ...doc, nombre: `${i.codigo}/${doc.nombre}` }))
    );
    if (!documentos.length) {
      setErrorTramite("Este expediente todavía no tiene archivos cargados.");
      return;
    }
    try {
      setErrorTramite("");
      await descargarComoZip(documentos, `Expediente ${tramite.codigo}.zip`);
    } catch (error) {
      setErrorTramite(error?.message || "No se pudo descargar el expediente.");
    }
  };

  const eliminarTareaActual = () => {
    if (!permiso.borrar_hito || !tarea) return;
    if (!window.confirm(`¿Eliminar el trámite "${tarea.nombre}" del expediente? Esta acción queda registrada en el historial.`)) return;
    try {
      removeItem(tarea.id);
      setTareaId(null);
    } catch (error) {
      setErrorArchivo(error?.message || "No se pudo eliminar el hito.");
    }
    recargar();
  };

  const eliminarContrato = () => {
    if (!permiso.eliminar) return;
    if (!window.confirm(`¿Eliminar el contrato "${tramite.codigo}" con todos sus hitos y archivos? Esta acción no se puede deshacer y queda registrada en el historial.`)) return;
    try {
      deleteTramite(id);
      navigate("/tramites");
    } catch (error) {
      setErrorTramite(error?.message || "No se pudo eliminar el contrato.");
    }
  };

  // Sin ningún permiso de edición el hito se muestra solo para consulta.
  const sinEdicion = !["estado", "plazos", "subir", "reemplazar", "borrar_doc", "borrar_hito"].some((clave) => permiso[clave]);

  // Fila de un archivo con sus acciones y, si tiene, la lista de versiones anteriores.
  const renderArchivo = (doc, conTipo) => {
    const versiones = doc.versiones || [];
    // Las versiones nuevas son archivos aparte ("versión N"); el primero de una serie se rotula "versión 1".
    const etiquetaVersion = doc.version
      ? `versión ${doc.version}`
      : versiones.length
        ? `versión ${versiones.length + 1}`
        : (tarea?.documentos || []).some((d) => d.versionDe === doc.id) ? "versión 1" : "";
    return (
      <React.Fragment key={doc.id}>
        <div className="archivo-fila">
          <div className="doc-ico">{iconoArchivo(doc.mime, doc.nombre)}</div>
          <div className="archivo-datos">
            <strong title={doc.nombre}>{doc.nombre}</strong>
            <span>{conTipo ? `${doc.tipoDoc} · ` : ""}{formatearTamano(doc.tamano)} · {fecha(doc.fecha)}{etiquetaVersion ? ` · ${etiquetaVersion}` : ""}</span>
          </div>
          {(permiso.descargar || permiso.reemplazar || permiso.borrar_doc) && (
            <div className="archivo-acciones">
              {permiso.descargar && <BotonVer archivoId={doc.archivoId} nombre={doc.nombre} mime={doc.mime} />}
              {permiso.descargar && <button type="button" className="btn mini" onClick={() => descargar(doc)}>Descargar</button>}
              {permiso.reemplazar && (
                <label className={`btn mini subir-archivo ${subiendo ? "deshabilitado" : ""}`} title="Sube una nueva versión como archivo adicional; el anterior se queda en la lista">
                  {subiendo === `v:${doc.id}` ? "Subiendo…" : "Nueva versión"}
                  <input type="file" hidden disabled={Boolean(subiendo)} onChange={(e) => subirNuevaVersion(e, doc)} />
                </label>
              )}
              {permiso.borrar_doc && (
                <button type="button" className="btn-icono peligro" title="Eliminar archivo" onClick={() => borrarArchivo(doc)}>×</button>
              )}
            </div>
          )}
        </div>
        {versiones.length > 0 && (
          <details className="versiones-doc">
            <summary>Versiones anteriores ({versiones.length})</summary>
            {versiones.map((v, i) => ({ v, numero: i + 1 })).reverse().map(({ v, numero }) => (
              <div className="version-fila" key={`${doc.id}-${numero}`}>
                <div className="doc-ico">{iconoArchivo("", v.nombre)}</div>
                <div className="version-datos">
                  <strong>Versión {numero}</strong> · {formatearTamano(v.tamano)} · {fecha(v.fecha)}
                  <br />
                  Reemplazada el {fechaHora(v.reemplazadoEl)} por {v.reemplazadoPor || "—"}
                </div>
                {permiso.descargar && (
                  <div className="version-acciones">
                    <BotonVer archivoId={v.archivoId} nombre={nombreDeVersion(doc, v, numero)} mime={v.mime} />
                    <button type="button" className="btn mini" onClick={() => descargarVersion(doc, v, numero)}>Descargar</button>
                  </div>
                )}
              </div>
            ))}
          </details>
        )}
      </React.Fragment>
    );
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
          {permiso.editar && (
            <button className="btn" onClick={() => { setForm({ ...tramite, ejecutor: tramite.ejecutor || { tipo: "empresa" } }); setEditando(true); }}>Editar datos</button>
          )}
          {permiso.descargar && <button className="btn" onClick={descargarExpediente}>Descargar expediente</button>}
          <button className="btn" onClick={() => window.print()}>Imprimir</button>
          {permiso.agregar && (
            <button className="btn primario" onClick={() => abrirNuevoProcedimiento()}>+ Nuevo trámite</button>
          )}
          {permiso.eliminar && (
            <button className="btn peligro" onClick={eliminarContrato}>Eliminar contrato</button>
          )}
        </div>
      </div>

      {errorTramite && <div className="alerta" role="alert">{errorTramite}</div>}

      <div className="ficha">
        <div><b>Entidad</b><span>{tramite.entidad || "—"}</span></div>
        <div>
          <b>Ejecutor</b>
          <span>{nombreEjecutor(tramite)}</span>
          <div className="ref">{ejecutorConsorcio ? "Consorcio" : "Ejecución directa"}</div>
        </div>
        <div><b>Área usuaria</b><span>{tramite.area || "—"}</span></div>
        <div><b>Monto contractual</b><span>{fmt(tramite.monto)}</span></div>
        <div><b>Inicio</b><span>{fecha(tramite.fecha_inicio)}</span></div>
        <div><b>Fin contractual</b><span>{fecha(tramite.fecha_fin)}</span></div>
      </div>

      {ejecutorConsorcio && (
        <details className="ejecutor-detalle">
          <summary>Integrantes del consorcio ({integrantesEjecutor.length})</summary>
          <div className="ref">
            RUC: {tramite.ejecutor.ruc || "—"} · Representante legal: {tramite.ejecutor.representante || "—"}
          </div>
          {integrantesEjecutor.length > 0 && (
            <table className="tabla">
              <thead><tr><th>Razón social</th><th>RUC</th><th>Participación</th></tr></thead>
              <tbody>
                {integrantesEjecutor.map((i, n) => (
                  <tr key={n}><td>{i.razonSocial || "—"}</td><td>{i.ruc || "—"}</td><td>{i.participacion} %</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </details>
      )}
      {avisosEjecutor.map((aviso) => <div className="nota-info ambar" role="status" key={aviso}>{aviso}</div>)}

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
        <button className={tab === "tramites" ? "activo" : ""} onClick={() => setTab("tramites")}>
          Trámites <span className="tab-num">{procedimientos.length}</span>
        </button>
        <button className={tab === "historial" ? "activo" : ""} onClick={() => setTab("historial")}>Historial</button>
      </div>


      {tab === "historial" && (
        <div className="tarjeta">
          <div className="tarjeta-cab">
            <h3>Historial del contrato</h3>
            <span className="ref">Eliminaciones, reemplazos de documentos y otros cambios registrados</span>
          </div>
          <div className="cuerpo">
            <HistorialLista tramiteId={id} vacio="Este contrato todavía no tiene cambios registrados." />
          </div>
        </div>
      )}

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
            <div className="tarjeta-cab"><h3>Hitos eventuales</h3>{permiso.agregar && <button className="btn mini" onClick={() => setModalEventual(true)}>+ Nuevo</button>}</div>
            <div className="cuerpo">
              {eventuales.length === 0 && <div className="vacio">Sin hitos eventuales. Se crean solo cuando ocurre el hecho (cambio de personal, ampliación, adicional, etc.).</div>}
              {eventuales.map((t) => (
                <button key={t.id} className="fila-tarea-boton" onClick={() => abrirTarea(t)}>
                  <div>
                    <div className="codigo">{t.codigo} · {etiquetaClase(t)}</div>
                    <strong>{t.nombre}</strong>
                    <div className="ref">{avanceRequisitos(t).cumplidos}/{avanceRequisitos(t).total} documentos · {t.estado}</div>
                  </div>
                  <span className={`badge ${claseEstado(t.estado)}`}>{t.estado}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="tarjeta">
            <div className="tarjeta-cab"><h3>Hitos propios</h3>{permiso.agregar && <button className="btn mini" onClick={() => setModalHito(true)}>+ Nuevo</button>}</div>
            <div className="cuerpo">
              {propios.length === 0 && <div className="vacio">Sin hitos propios. Son los que creas solo para este contrato y no están en el catálogo.</div>}
              {propios.map((t) => (
                <button key={t.id} className="fila-tarea-boton" onClick={() => abrirTarea(t)}>
                  <div>
                    <div className="codigo">{t.codigo} · {etiquetaClase(t)}</div>
                    <strong>{t.nombre}</strong>
                    <div className="ref">{avanceRequisitos(t).cumplidos}/{avanceRequisitos(t).total} documentos · {t.estado}</div>
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

      {tab === "tramites" && (
        <div className="tarjeta">
          <div className="tarjeta-cab">
            <div>
              <h3>Trámites del contrato</h3>
              <span className="ref">Procedimientos del contratista para cumplir un hito. Aquí se guardan movimientos, cargos y documentos internos.</span>
            </div>
            {permiso.agregar && <button className="btn mini primario" onClick={() => abrirNuevoProcedimiento()}>+ Nuevo trámite</button>}
          </div>
          <div className="cuerpo">
            {procedimientos.length === 0 && <div className="vacio">Todavía no hay trámites. Crea uno para seguir un procedimiento hasta el documento objetivo de un hito.</div>}
            {procedimientos.map((p) => (
              <div className="catalogo-hito-fila" key={p.id}>
                <div>
                  <strong>{p.nombre}</strong>
                  <span className="ref">
                    Hito {p.hitoCodigo} · {p.hitoNombre} · {p.destino === "entidad" ? "Entidad" : p.destino === "supervision" ? "Supervisión" : "Interno"}
                  </span>
                  <span className="ref">
                    {p.estado} · {p.movimientos?.length || 0} movimiento(s) · vence {fecha(p.fechaObjetivo)}
                  </span>
                </div>
                <div className="chips">
                  <button type="button" className="btn mini" onClick={() => abrirProcedimiento(p)}>Abrir trámite</button>
                </div>
              </div>
            ))}
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
              <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} aria-label="Filtrar por tipo de hito">
                <option value="Todos">Todos los tipos de hito</option>
                {Object.entries(CLASES_HITO).map(([clave, c]) => <option key={clave} value={clave}>{c.plural}</option>)}
              </select>
              <span className="contador">{itemsFiltrados.length} de {items.length}</span>
              {permiso.agregar && <button className="btn mini" onClick={() => { setEventualSel(""); setModalEventual(true); }}>+ Hito eventual</button>}
              {permiso.agregar && <button className="btn mini" onClick={() => setModalOpcional(true)}>+ Hito opcional</button>}
              {permiso.agregar && <button className="btn mini" onClick={() => setModalHito(true)}>+ Hito propio</button>}
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
                      {permiso.agregar && seccion.codigo === "1.2.10" && (
                        <button className="btn mini" onClick={abrirFianzas}>Configurar fianzas</button>
                      )}
                      {permiso.agregar && seccion.codigo === "2.2.7" && (
                        <button className="btn mini" onClick={abrirFianzas}>Configurar fianzas</button>
                      )}
                      {permiso.agregar && PERIODOS_A_MANO[seccion.codigo] && (
                        <button className="btn mini" onClick={() => agregarMes(seccion.codigo)}>{PERIODOS_A_MANO[seccion.codigo]}</button>
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
                                {claseDeHito(t) !== "catalogo" && <InsigniaClase item={t} />}
                                {procedimientos.filter((p) => p.hitoId === t.id).length > 0 && (
                                  <span className="badge violeta">{procedimientos.filter((p) => p.hitoId === t.id).length} trámite(s)</span>
                                )}
                                {silencioProducido(t) && <span className="badge rojo">Silencio positivo</span>}
                                {t.plazoDias > 0 && <span className="badge gris">{t.plazoDias} días {t.plazoHabiles ? "hábiles" : "calendario"}</span>}
                              </div>
                              <div className="tarea-meta">
                                {t.estado === "No aplica" ? (
                                  <span>No aplica: no requiere documentos</span>
                                ) : (
                                  <>
                                    <span>{avanceRequisitos(t).cumplidos}/{avanceRequisitos(t).total} documentos</span>
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
                              {permiso.agregar && (
                                <span className="orden-hito" onClick={(e) => { e.stopPropagation(); moverHito(t, -1); }} title="Subir posición">↑</span>
                              )}
                              {permiso.agregar && (
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
                  <InsigniaClase item={tarea} />
                  {hitoPadre && <button type="button" className="btn mini" onClick={() => abrirTarea(hitoPadre)}>← Hito {hitoPadre.codigo}</button>}
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
              {hitoPadre && (
                <div className="nota-info">
                  Trámite del hito <strong>{hitoPadre.codigo} · {hitoPadre.nombre}</strong>. Reúne los documentos internos y los pasos ante la supervisión o la entidad hasta emitir el documento objetivo.
                </div>
              )}
              {sinEdicion && (
                <div className="nota-info">
                  Tu rol solo permite consultar los hitos{permiso.descargar ? " y descargar archivos" : ""}; no puedes modificar el expediente.
                </div>
              )}
              {errorArchivo && <div className="alerta">{errorArchivo}</div>}

              <React.Fragment key={tarea.id}>
              <Plegable
                titulo="Estado y responsable"
                resumen={`${tarea.estado || "Pendiente"}${tarea.responsable ? ` · ${tarea.responsable}` : ""}`}
                abierto
                recordar="hito-estado"
              >
                <div className="grid-form">
                  {tarea.pasos?.length ? (
                    <div className="campo-grupo">
                      <span className="campo">Estado del hito</span>
                      <div className="chips">
                        <span className="badge azul">{tarea.estado}</span>
                        {permiso.estado && (tarea.estado === "No aplica"
                          ? <button type="button" className="btn mini" onClick={() => cambiarItem({ estado: "Pendiente" })}>Reabrir</button>
                          : <button type="button" className="btn mini" onClick={() => cambiarItem({ estado: "No aplica" })}>Marcar como No aplica</button>)}
                      </div>
                      <span className="ref">Lo determinan los pasos del trámite.</span>
                    </div>
                  ) : (
                    <label className="campo-grupo">
                      <span className="campo">Estado del hito</span>
                      <select disabled={!permiso.estado} value={tarea.estado || "Pendiente"} onChange={(e) => cambiarItem({ estado: e.target.value })}>
                        {ESTADOS.map((e) => <option key={e}>{e}</option>)}
                      </select>
                    </label>
                  )}
                  <label className="campo-grupo">
                    <span className="campo">Responsable</span>
                    <input disabled={!permiso.estado} value={tarea.responsable || ""} onChange={(e) => cambiarItem({ responsable: e.target.value })} placeholder="Área o persona responsable" />
                  </label>
                  <label className="campo-grupo">
                    <span className="campo">Fecha de presentación</span>
                    <input disabled={!permiso.estado} type="date" value={tarea.fecha || ""} onChange={(e) => cambiarItem({ fecha: e.target.value })} />
                  </label>
                  <label className="campo-grupo">
                    <span className="campo">Fecha límite</span>
                    <input disabled={!permiso.plazos || Boolean(tarea.pasos?.length)} type="date" value={tarea.fecha_limite || ""} onChange={(e) => cambiarItem({ fecha_limite: e.target.value })} />
                  </label>
                  <label className="campo-grupo ancho-completo">
                    <span className="campo">Observación / sustento</span>
                    <textarea disabled={!permiso.estado} rows="2" value={tarea.observacion || ""} onChange={(e) => cambiarItem({ observacion: e.target.value })} placeholder="Anotaciones, número de expediente, cargo de recepción…" />
                  </label>
                </div>
              </Plegable>

              <Plegable titulo="Norma y plazos" resumen={textoVencimiento(tarea)} recordar="hito-norma">
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
                    <b>Se da por cumplido con</b>
                    <strong>{tarea.docCumplimiento || "Marcado manual"}</strong>
                    <span>{tarea.docsRequeridos?.length || 0} documento(s) en la plantilla</span>
                  </div>
                </div>
              </Plegable>

              <LineaTiempo item={tarea} permiso={permiso} onCambio={recargar} />

              <Plegable
                titulo="Trámites vinculados"
                resumen={procedimientosDelHito.length ? `${procedimientosDelHito.length} trámite(s)` : "Ninguno"}
                abierto={procedimientosDelHito.length > 0}
                recordar="hito-tramites"
              >
                <p className="plegable-sub">Movimientos del flujo completo hasta el documento objetivo.</p>
                {permiso.agregar && (
                  <div className="chips" style={{ marginBottom: 10 }}>
                    <button type="button" className="btn mini" onClick={() => abrirNuevoProcedimiento(tarea.id)}>+ Iniciar trámite</button>
                  </div>
                )}
                {procedimientosDelHito.length === 0 ? (
                  <div className="catalogo-hito-datos">Este hito todavía no tiene trámites. Un trámite es el procedimiento del contratista para lograr su documento objetivo.</div>
                ) : (
                  <div className="catalogo-hito-datos">
                    {procedimientosDelHito.map((p) => (
                      <button key={p.id} type="button" className="btn mini" onClick={() => abrirProcedimiento(p)}>
                        {p.nombre} →
                      </button>
                    ))}
                  </div>
                )}
              </Plegable>

              <Plegable
                titulo="Documentos requeridos"
                resumen={`${avanceRequisitos(tarea).cumplidos}/${avanceRequisitos(tarea).total} completos`}
                abierto
                recordar="hito-docs"
              >
                <p className="plegable-sub">Los cambios se guardan también en la plantilla para futuros contratos.</p>

                {permiso.catalogo && (
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
                  const estadoReq = estadoRequisito(tarea, req);
                  const noCorresponde = estadoReq === "no_corresponde";
                  return (
                    <div className={`requisito requisito-${estadoReq.replace("_", "-")}`} key={req}>
                      <div className="requisito-cab">
                        <div>
                          <strong>{req}</strong>
                          <span className="ref">
                            {noCorresponde ? "No corresponde a este contrato: se da por cumplido" : docs.length ? `${docs.length} archivo(s)` : "Pendiente de carga"}
                          </span>
                        </div>
                        <div className="requisito-acciones">
                          <span className={`badge ${noCorresponde ? "azul" : docs.length ? "verde" : "ambar"}`}>
                            {noCorresponde ? "No corresponde" : docs.length ? "Cargado" : "Pendiente"}
                          </span>
                          {permiso.catalogo && (
                            <>
                              <button type="button" className="btn-icono" title="Subir documento en la lista" onClick={() => moverDocumento(idx, -1)}>↑</button>
                              <button type="button" className="btn-icono" title="Bajar documento en la lista" onClick={() => moverDocumento(idx, 1)}>↓</button>
                              <button type="button" className="btn-icono peligro" title="Quitar documento" onClick={() => quitarDocumento(req)}>×</button>
                            </>
                          )}
                        </div>
                      </div>
                      {docs.length > 0 && <div className="requisito-archivos">{docs.map((doc) => renderArchivo(doc, false))}</div>}
                      {noCorresponde ? (
                        permiso.estado && (
                          <div className="subir-fila">
                            <button type="button" className="btn mini btn-no-corresponde" onClick={() => alternarNoCorresponde(req, false)}>Volver a exigir</button>
                          </div>
                        )
                      ) : (
                        <>
                          {permiso.subir ? (
                            <SubirArchivo
                              etiqueta={subiendo === req ? "Subiendo…" : docs.length ? "+ Agregar otro archivo" : "Subir archivo"}
                              ocupado={Boolean(subiendo)}
                              onChange={(e) => subirArchivo(e, req)}
                            >
                              {permiso.estado && docs.length === 0 && botonNoCorresponde(req)}
                            </SubirArchivo>
                          ) : (
                            permiso.estado && docs.length === 0 && <div className="subir-fila">{botonNoCorresponde(req)}</div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}

                {permiso.catalogo && (
                  <form className="agregar-documento" onSubmit={agregarRequisito}>
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
              </Plegable>

              <Plegable
                titulo="Otros documentos"
                resumen={otrosDocumentos.length ? `${otrosDocumentos.length} archivo(s)` : "Ninguno"}
                abierto={otrosDocumentos.length > 0}
                recordar="hito-otros"
              >
                <p className="plegable-sub">Documentos adicionales que no están en la lista de requisitos.</p>
                {otrosDocumentos.map((doc) => renderArchivo(doc, true))}
                {permiso.subir && (
                  <SubirArchivo
                    etiqueta={subiendo === "Otros" ? "Subiendo…" : "+ Subir otro documento"}
                    ocupado={Boolean(subiendo)}
                    onChange={(e) => subirArchivo(e, "Otros")}
                  />
                )}
              </Plegable>

              <Plegable
                titulo="Catálogo de este hito"
                resumen={!estadoCatalogo ? "Fuera del catálogo" : estadoCatalogo.campos.length === 0 ? "Al día" : "Difiere del catálogo"}
                recordar="hito-catalogo"
              >
                <p className="plegable-sub">
                  {estadoCatalogo
                    ? `Está en el catálogo (${ROTULO_TIPO_CATALOGO[estadoCatalogo.tipo] || estadoCatalogo.tipo}) · clave ${estadoCatalogo.clave}`
                    : "Aún no está en el catálogo"}
                </p>
                <div className="catalogo-hito-datos">
                  {estadoCatalogo && (estadoCatalogo.campos.length === 0
                    ? <span>El catálogo ya tiene este mismo detalle.</span>
                    : <span className="texto-ambar">El catálogo difiere en: {describirCamposCatalogo(estadoCatalogo.campos)}.</span>)}
                  <span>{tarea.docsRequeridos?.length || 0} documento(s) en la plantilla</span>
                  <span>Cumplimiento: {tarea.docCumplimiento || "Manual"}</span>
                  <span>{tarea.plazoDias ? `${tarea.plazoDias} días ${tarea.plazoHabiles ? "hábiles" : "calendario"}` : "Sin plazo automático"}</span>
                  <span>Los cambios aquí afectan a contratos nuevos.</span>
                </div>
                {permiso.catalogo && (
                  <div className="chips" style={{ margin: "12px 0 4px" }}>
                    {estadoCatalogo ? (
                      <>
                        <button type="button" className="btn mini primario" disabled={estadoCatalogo.campos.length === 0} onClick={actualizarCatalogoConEsteHito}>
                          Actualizar catálogo con este hito
                        </button>
                        {estadoCatalogo.tipo === "hito" && (
                          <button type="button" className="btn mini" onClick={abrirEditarCatalogo}>Editar catálogo</button>
                        )}
                      </>
                    ) : (
                      <button type="button" className="btn mini" onClick={abrirEditarCatalogo}>Convertir en catálogo</button>
                    )}
                  </div>
                )}
              </Plegable>
              </React.Fragment>
            </div>

            <div className="modal-pie">
              {permiso.borrar_hito && (
                <button type="button" className="btn peligro" onClick={eliminarTareaActual}>Quitar hito del expediente</button>
              )}
              <span className="pie-espacio" />
              {permiso.descargar && (
                <button
                  type="button"
                  className="btn"
                  onClick={descargarTodos}
                  disabled={!(tarea.documentos || []).length}
                >
                  Descargar todos
                </button>
              )}
              <button type="button" className="btn" onClick={() => setTareaId(null)}>Cerrar</button>
              {tarea.pasos?.length ? null : permiso.estado && tarea.estado === "Completado" ? (
                <button
                  type="button"
                  className="btn"
                  onClick={() => cambiarItem({ estado: "Pendiente" })}
                >
                  Desmarcar hito
                </button>
              ) : permiso.estado ? (
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

      {modalProcedimiento && (
        <div className="modal-fondo" onClick={(e) => e.target === e.currentTarget && setModalProcedimiento(false)}>
          <form className="modal" onSubmit={guardarProcedimiento}>
            <div className="modal-cab">
              <div>
                <h3>Nuevo trámite</h3>
                <span className="ref">Procedimiento para cumplir un hito. La entidad y la obra se toman del contrato abierto.</span>
              </div>
              <button type="button" className="cerrar" onClick={() => setModalProcedimiento(false)}>×</button>
            </div>
            <div className="modal-cuerpo">
              {errorProc && <div className="alerta">{errorProc}</div>}
              <div className="nota-info">
                <strong>Entidad:</strong> {tramite.entidad || "—"} <br />
                <strong>Obra:</strong> {tramite.codigo} · {tramite.denominacion}
              </div>
              <div className="grid-form">
                <label className="campo-grupo ancho-completo">
                  <span className="campo">Hito que debe cumplir *</span>
                  <select
                    required
                    value={procForm.hitoId || ""}
                    onChange={(e) => {
                      const hito = items.find((i) => i.id === e.target.value);
                      setProcForm((f) => ({
                        ...f,
                        hitoId: e.target.value,
                        nombre: f.nombre && !f.nombre.startsWith("Trámite para ") ? f.nombre : (hito ? `Trámite para ${hito.codigo} ${hito.nombre}` : ""),
                      }));
                    }}
                  >
                    <option value="">Selecciona un hito</option>
                    {items.filter((i) => i.estado !== "No aplica").map((i) => (
                      <option key={i.id} value={i.id}>{i.codigo} · {i.nombre}</option>
                    ))}
                  </select>
                </label>
                <label className="campo-grupo ancho-completo">
                  <span className="campo">Nombre del trámite</span>
                  <input value={procForm.nombre || ""} onChange={(e) => setProcForm({ ...procForm, nombre: e.target.value })} placeholder="Ej. Trámite de ampliación de plazo" />
                </label>
                <label className="campo-grupo">
                  <span className="campo">Destino</span>
                  <select value={procForm.destino || "entidad"} onChange={(e) => setProcForm({ ...procForm, destino: e.target.value })}>
                    <option value="entidad">Entidad</option>
                    <option value="supervision">Supervisión de obra</option>
                    <option value="interno">Interno</option>
                  </select>
                </label>
                <label className="campo-grupo">
                  <span className="campo">Prioridad</span>
                  <select value={procForm.prioridad || "Normal"} onChange={(e) => setProcForm({ ...procForm, prioridad: e.target.value })}>
                    {PRIORIDADES_TRAMITE.map((p) => <option key={p}>{p}</option>)}
                  </select>
                </label>
                <label className="campo-grupo ancho-completo">
                  <span className="campo">Descripción</span>
                  <textarea rows="2" value={procForm.descripcion || ""} onChange={(e) => setProcForm({ ...procForm, descripcion: e.target.value })} placeholder="Qué se gestiona y qué documento objetivo se espera…" />
                </label>
              </div>
            </div>
            <div className="modal-pie">
              <button type="button" className="btn" onClick={() => setModalProcedimiento(false)}>Cancelar</button>
              <button type="submit" className="btn primario" disabled={!procForm.hitoId}>Crear trámite</button>
            </div>
          </form>
        </div>
      )}

      {proc && (
        <div className="modal-fondo" onClick={(e) => e.target === e.currentTarget && setProcedimientoId(null)}>
          <div className="modal modal-tarea">
            <div className="modal-cab modal-tarea-cab">
              <div>
                <div className="codigo">
                  {proc.numero} · {tramite.entidad || "—"} · {tramite.codigo} {tramite.denominacion}
                </div>
                <h3>{proc.nombre}</h3>
                <div className="chips">
                  <span className="badge azul">{proc.destino === "entidad" ? "Entidad" : proc.destino === "supervision" ? "Supervisión" : "Interno"}</span>
                  <span className={`badge ${proc.prioridad === "Normal" ? "gris" : "rojo"}`}>{proc.prioridad || "Normal"}</span>
                  <span className="badge gris">{proc.estado}</span>
                  <button type="button" className="btn mini" onClick={() => { const h = items.find((i) => i.id === proc.hitoId); if (h) { setProcedimientoId(null); abrirTarea(h); } }}>
                    Hito {proc.hitoCodigo} →
                  </button>
                </div>
              </div>
              <button type="button" className="cerrar" onClick={() => setProcedimientoId(null)}>×</button>
            </div>
            <div className="modal-cuerpo modal-tarea-cuerpo">
              {errorProc && <div className="alerta">{errorProc}</div>}
              <div className="nota-info">
                Procedimiento para cumplir el hito <strong>{proc.hitoCodigo} · {proc.hitoNombre}</strong>. El trámite es todo el flujo hasta la obtención del documento objetivo; al completarse el hito se archiva automáticamente.
              </div>

              <div className="flujo-tramite">
                {ESTADOS_TRAMITE.map((estado, i) => {
                  const actualIndex = ESTADOS_TRAMITE.indexOf(proc.estado);
                  return (
                    <span key={estado} className={`flujo-paso ${i < actualIndex ? "hecho" : i === actualIndex ? "actual" : ""}`} title={estado}>
                      {estado}
                    </span>
                  );
                })}
              </div>

              {permiso.registrar && (
                <div className="grid-form">
                  <label className="campo-grupo">
                    <span className="campo">Estado del trámite</span>
                    <select value={proc.estado} onChange={(e) => { actualizarProcedimiento(proc.id, { estado: e.target.value }); recargar(); }}>
                      {ESTADOS_TRAMITE.map((e) => <option key={e}>{e}</option>)}
                    </select>
                  </label>
                  <label className="campo-grupo">
                    <span className="campo">Prioridad</span>
                    <select value={proc.prioridad || "Normal"} onChange={(e) => { actualizarProcedimiento(proc.id, { prioridad: e.target.value }); recargar(); }}>
                      {PRIORIDADES_TRAMITE.map((p) => <option key={p}>{p}</option>)}
                    </select>
                  </label>
                </div>
              )}

              <div className="docs-bloque">
                <div className="docs-cab"><h4>Movimientos del trámite</h4></div>
                {(proc.movimientos || []).length === 0 && <div className="vacio">Sin movimientos todavía.</div>}
                {(proc.movimientos || []).map((m) => (
                  <div className="archivo-fila" key={m.id}>
                    <div className="doc-ico">{fecha(m.fecha).slice(0, 6)}</div>
                    <div className="archivo-datos">
                      <strong>
                        {m.tipo}
                        {m.numeroRegistro ? ` · Reg. ${m.numeroRegistro}` : ""}
                        {m.numeroDocumento ? ` · ${m.numeroDocumento}` : ""}
                      </strong>
                      <span>
                        {fecha(m.fecha)}{m.hora ? ` ${m.hora}` : ""}{m.usuario ? ` · ${m.usuario}` : ""}
                        {m.dependenciaOrigen ? ` · ${m.dependenciaOrigen} → ${m.dependenciaDestino || "Entidad"}` : ""}
                        {m.oficina ? ` · ${m.oficina}` : ""}
                      </span>
                      <span>{m.nota || ""}{m.archivoNombre ? ` · ${m.archivoNombre}` : ""}</span>
                    </div>
                    {m.archivoId && permiso.descargar && (
                      <div className="archivo-acciones">
                        <BotonVer archivoId={m.archivoId} nombre={m.archivoNombre} />
                        <button type="button" className="btn mini" onClick={() => descargarArchivo(m.archivoId, m.archivoNombre).catch((e) => setErrorProc(e.message))}>Descargar</button>
                      </div>
                    )}
                  </div>
                ))}
                {permiso.registrar && (
                  <form className="grid-form" onSubmit={guardarMovimientoProc}>
                    <label className="campo-grupo">
                      <span className="campo">Fecha</span>
                      <input type="date" value={movForm.fecha || ""} onChange={(e) => setMovForm({ ...movForm, fecha: e.target.value })} required />
                    </label>
                    <label className="campo-grupo">
                      <span className="campo">Hora</span>
                      <input type="time" value={movForm.hora || ""} onChange={(e) => setMovForm({ ...movForm, hora: e.target.value })} />
                    </label>
                    <label className="campo-grupo">
                      <span className="campo">Acción</span>
                      <select value={movForm.tipo || "otro"} onChange={(e) => setMovForm({ ...movForm, tipo: e.target.value })}>
                        {["asiento", "presentado", "observado", "levantado", "conformidad", "pronunciamiento", "otro"].map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </label>
                    <label className="campo-grupo">
                      <span className="campo">N.º de registro de oficina</span>
                      <input value={movForm.numeroRegistro || ""} onChange={(e) => setMovForm({ ...movForm, numeroRegistro: e.target.value })} placeholder="Ej. 015-2026" />
                    </label>
                    <label className="campo-grupo">
                      <span className="campo">Oficina</span>
                      <input value={movForm.oficina || ""} onChange={(e) => setMovForm({ ...movForm, oficina: e.target.value })} placeholder="Mesa de partes, logística…" />
                    </label>
                    <label className="campo-grupo">
                      <span className="campo">N.º de documento</span>
                      <input value={movForm.numeroDocumento || ""} onChange={(e) => setMovForm({ ...movForm, numeroDocumento: e.target.value })} placeholder="Carta N.º 015-2026" />
                    </label>
                    <label className="campo-grupo ancho-completo">
                      <span className="campo">Nota</span>
                      <input value={movForm.nota || ""} onChange={(e) => setMovForm({ ...movForm, nota: e.target.value })} placeholder="Observación o proveído" />
                    </label>
                    <label className="campo-grupo ancho-completo">
                      <span className="campo">Archivo del movimiento</span>
                      <input type="file" onChange={(e) => setProcArchivo(e.target.files?.[0] || null)} />
                    </label>
                    <div className="ancho-completo">
                      <TomarFoto onChange={(e) => setProcArchivo(e.target.files?.[0] || null)} />
                      {procArchivo && <span className="ref"> Archivo elegido: {procArchivo.name}</span>}
                    </div>
                    <div className="acciones-descarga ancho-completo">
                      <button type="submit" className="btn primario">Registrar trámite</button>
                    </div>
                  </form>
                )}
              </div>

            </div>
            <div className="modal-pie">
              {permiso.borrar_hito && <button type="button" className="btn peligro" onClick={borrarProcedimiento}>Eliminar trámite</button>}
              <span className="pie-espacio" />
              <button type="button" className="btn" onClick={() => setProcedimientoId(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {modalEventual && (
        <div className="modal-fondo" onClick={(e) => e.target === e.currentTarget && setModalEventual(false)}>
          <form className="modal" onSubmit={crearEventual}>
            <div className="modal-cab">
              <div>
                <h3>Nuevo hito eventual</h3>
                <span className="ref">Solo se crea cuando ocurre el hecho generador. Cada instancia conserva sus propios documentos y plazos. Para seguir un procedimiento, usa “+ Nuevo trámite”.</span>
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
              <label className="campo-grupo">
                <span className="campo">Hito al que corresponde (opcional)</span>
                <select value={eventualHitoId} onChange={(e) => setEventualHitoId(e.target.value)}>
                  <option value="">Sin hito vinculado</option>
                  {items
                    .filter((i) => i.tipo !== "eventual" && i.tipo !== "tramite" && i.estado !== "No aplica")
                    .map((i) => (
                      <option key={i.id} value={i.id}>{i.codigo} · {i.nombre}</option>
                    ))}
                </select>
              </label>
              {eventualSel && (
                <div className="nota-info">
                  Se creará el trámite con su código correlativo dentro de “Modificaciones y ampliaciones”. El trámite reúne los documentos internos, los pasos ante la supervisión o la entidad y los cargos hasta emitir el documento objetivo del hito. {eventualHitoId ? "Quedará vinculado al hito elegido." : ""}
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
              {permiso.catalogo ? (
                <>
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
                </>
              ) : (
                <div className="nota-info">El hito queda solo en este contrato.</div>
              )}
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
                <h3>{catalogoModo === "crear" ? "Convertir en catálogo" : "Editar catálogo del hito"}</h3>
                <span className="ref">
                  {catalogoModo === "crear"
                    ? (catalogoForm.tipoCat === "eventual"
                      ? "Un hito eventual no se crea solo: se agrega al contrato cuando ocurre el hecho (ampliación, adicional, cambio de personal…)."
                      : catalogoForm.tipoCat === "opcional"
                        ? "Un hito opcional no se crea solo: se agrega al contrato cuando se necesita, y aparece en la etapa que elijas."
                        : "Un hito de catálogo se crea en todos los contratos nuevos. Elige una etapa real para ordenarlo junto a los demás; “Hitos propios” lo mantiene aparte.")
                    : "Los cambios se guardan en la plantilla y aparecerán en los contratos nuevos."}
                </span>
              </div>
              <button type="button" className="cerrar" onClick={() => setEditandoCatalogo(false)}>×</button>
            </div>
            <div className="modal-cuerpo">
              {catalogoModo === "crear" && (
                <label className="campo-grupo">
                  <span className="campo">Tipo de hito en el catálogo</span>
                  <select value={catalogoForm.tipoCat || "hito"} onChange={(e) => setCatalogoForm({ ...catalogoForm, tipoCat: e.target.value })}>
                    <option value="hito">Hito de catálogo (se crea en cada contrato nuevo)</option>
                    <option value="eventual">Hito eventual (se agrega cuando ocurre el hecho)</option>
                    <option value="opcional">Hito opcional (se agrega cuando se necesita)</option>
                  </select>
                </label>
              )}
              {catalogoModo === "crear" && catalogoForm.tipoCat !== "eventual" && (
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
                    {catalogoForm.tipoCat === "hito" && <option value="P">Hitos propios</option>}
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
                {!(catalogoModo === "crear" && catalogoForm.tipoCat === "eventual") && (
                  <label className="campo-grupo">
                    <span className="campo">Base del plazo</span>
                    <select value={catalogoForm.base || "inicio"} onChange={(e) => setCatalogoForm({ ...catalogoForm, base: e.target.value })}>
                      <option value="suscripcion">Fecha de suscripción</option>
                      <option value="inicio">Fecha de inicio</option>
                    </select>
                  </label>
                )}
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
                {catalogoModo === "crear" && catalogoForm.tipoCat === "eventual" && (
                  <label className="campo-grupo">
                    <span className="campo">Silencio positivo</span>
                    <select value={catalogoForm.silencioPositivo ? "si" : "no"} onChange={(e) => setCatalogoForm({ ...catalogoForm, silencioPositivo: e.target.value === "si" })}>
                      <option value="no">No aplica</option>
                      <option value="si">Aplica si la entidad no se pronuncia</option>
                    </select>
                  </label>
                )}
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
              {errorFianzas && <div className="alerta" role="alert">{errorFianzas}</div>}
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
              <div className="nota-info">Se regenerarán los hitos de renovación. Los documentos ya cargados se conservan en el mismo orden. Si quedan menos hitos que documentos, los hitos sobrantes se eliminan con sus archivos (requiere poder eliminar hitos y queda en el historial).</div>
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
                <label className="campo-grupo"><span className="campo">Monto</span><input type="number" value={form.monto || 0} onChange={(e) => setForm({ ...form, monto: e.target.value })} /></label>
                <label className="campo-grupo"><span className="campo">Fecha de suscripción</span><input type="date" value={form.fecha_suscripcion || ""} onChange={(e) => setForm({ ...form, fecha_suscripcion: e.target.value })} /></label>
                <label className="campo-grupo"><span className="campo">Inicio</span><input type="date" value={form.fecha_inicio || ""} onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })} /></label>
                <label className="campo-grupo"><span className="campo">Fin contractual</span><input type="date" value={form.fecha_fin || ""} onChange={(e) => setForm({ ...form, fecha_fin: e.target.value })} /></label>
                <EjecutorForm value={form.ejecutor} onChange={(ejecutor) => setForm({ ...form, ejecutor })} />
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
