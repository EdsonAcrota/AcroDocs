import React, { useState } from "react";
import { getCatalogo, guardarCatalogo, restaurarCatalogo, puede } from "../lib/store.js";
import {
  tipoDeAmbito, completarPlantilla, recorrerPlantillas, renumerarHitos,
  siguienteCodigoEtapa, siguienteCodigoSeccion, claveUnica,
} from "../lib/catalogo.js";
import EditorPlantilla from "../components/EditorPlantilla.jsx";

const uid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);
const copiar = (o) => JSON.parse(JSON.stringify(o));

const buscar = (cat, id) => {
  let hallada = null;
  recorrerPlantillas(cat, (u) => { if (!hallada && u.plantilla.id === id) hallada = u; });
  return hallada;
};

// Texto corto de lo que cambió entre dos catálogos, para el historial.
const resumenCambios = (antes, despues) => {
  const mapa = (cat) => {
    const m = new Map();
    recorrerPlantillas(cat, (u) => m.set(u.plantilla.id, { nombre: u.plantilla.nombre, json: JSON.stringify(u.plantilla) }));
    return m;
  };
  const a = mapa(antes);
  const d = mapa(despues);
  const cambiados = [...d].filter(([id, v]) => a.has(id) && a.get(id).json !== v.json).map(([, v]) => v.nombre);
  const nuevos = [...d.keys()].filter((id) => !a.has(id)).length;
  const quitados = [...a.keys()].filter((id) => !d.has(id)).length;
  const partes = [];
  if (cambiados.length) partes.push(`modificó ${cambiados.slice(0, 5).map((n) => `«${n}»`).join(", ")}${cambiados.length > 5 ? ` y ${cambiados.length - 5} más` : ""}`);
  if (nuevos) partes.push(`agregó ${nuevos}`);
  if (quitados) partes.push(`quitó ${quitados}`);
  return partes.length ? `Catálogo: ${partes.join("; ")}.` : "Catálogo: cambios en etapas o secciones.";
};

const badgesDe = (p) => (
  <>
    {p.activo === false && <span className="badge gris">Inactivo</span>}
    {!p.verificado && Number(p.plazoDias) > 0 && <span className="badge ambar">Plazo por verificar</span>}
    {(p.pasos || []).length > 0 && <span className="badge azul">{p.pasos.length} paso(s)</span>}
  </>
);

const resumenPlazo = (p) => (Number(p.plazoDias) > 0 ? `${p.plazoDias} días ${p.plazoHabiles ? "hábiles" : "calendario"}` : "sin plazo");

export default function Catalogo() {
  const editable = puede("catalogo");
  const [guardado, setGuardado] = useState(() => JSON.stringify(getCatalogo()));
  const [borrador, setBorrador] = useState(() => JSON.parse(guardado));
  const [pestana, setPestana] = useState("obra");
  const [ambitoLista, setAmbitoLista] = useState("obra");
  const [edicion, setEdicion] = useState(null);
  const [aviso, setAviso] = useState("");
  const [error, setError] = useState("");

  const sucio = JSON.stringify(borrador) !== guardado;
  const esArbol = pestana === "obra" || pestana === "consultoria";
  const ambito = esArbol ? pestana : ambitoLista;

  const mutar = (fn) => {
    const c = copiar(borrador);
    fn(c);
    setBorrador(c);
    setAviso("");
    setError("");
  };

  const cargar = (catalogo) => {
    const texto = JSON.stringify(catalogo);
    setGuardado(texto);
    setBorrador(JSON.parse(texto));
  };

  const guardar = () => {
    try {
      cargar(guardarCatalogo(borrador, resumenCambios(JSON.parse(guardado), borrador)));
      setAviso("Catálogo guardado. Los cambios se aplican a los contratos nuevos; los que ya existen no se tocan.");
      setError("");
    } catch (e) {
      setError(e.message || "No se pudo guardar el catálogo.");
    }
  };

  const descartar = () => {
    setBorrador(JSON.parse(guardado));
    setAviso("Se descartaron los cambios sin guardar.");
    setError("");
  };

  const restaurar = (clave) => {
    const que = clave ? "este elemento a su versión original" : "TODO el catálogo al original (se pierden los hitos propios)";
    if (!window.confirm(`¿Restaurar ${que}?${sucio ? " Los cambios sin guardar se descartan." : ""}`)) return;
    try {
      cargar(restaurarCatalogo(clave));
      setAviso("Catálogo restaurado.");
      setError("");
    } catch (e) {
      setError(e.message || "No se pudo restaurar.");
    }
  };

  // ---------- edición del árbol ----------
  const aplicarPlantilla = (id, valores) => {
    mutar((c) => { const u = buscar(c, id); if (u) Object.assign(u.plantilla, valores); });
    setEdicion(null);
  };
  const alternarActivo = (id) => mutar((c) => { const u = buscar(c, id); if (u) u.plantilla.activo = u.plantilla.activo === false; });
  const quitarPlantilla = (id, nombre) => {
    if (!window.confirm(`¿Quitar «${nombre}» del catálogo? No se elimina de los contratos ya creados. Si solo quieres dejar de generarlo, usa Desactivar.`)) return;
    mutar((c) => { const u = buscar(c, id); if (u?.lista) u.lista.splice(u.lista.indexOf(u.plantilla), 1); else if (u?.seccion) u.etapa.secciones.splice(u.etapa.secciones.indexOf(u.seccion), 1); });
  };
  const moverEnLista = (id, dir) =>
    mutar((c) => {
      const u = buscar(c, id);
      if (!u?.lista) return;
      const i = u.lista.indexOf(u.plantilla);
      const j = i + dir;
      if (j < 0 || j >= u.lista.length) return;
      [u.lista[i], u.lista[j]] = [u.lista[j], u.lista[i]];
      if (u.tipo === "hito") renumerarHitos(u.seccion);
    });

  const nuevaPlantilla = (extra = {}) => completarPlantilla({ id: uid(), nota: "Agregado al catálogo.", plazoBase: "inicio", ...extra });

  const agregarEtapa = () => mutar((c) => {
    const arbol = c[ambito];
    arbol.etapas.push({ id: uid(), codigo: siguienteCodigoEtapa(arbol, ambito), nombre: "Nueva etapa", secciones: [] });
  });
  const agregarSeccion = (etapaId) => mutar((c) => {
    const etapa = c[ambito].etapas.find((e) => e.id === etapaId);
    etapa.secciones.push({ id: uid(), codigo: siguienteCodigoSeccion(etapa), nombre: "Nueva sección", hitos: [] });
  });
  const agregarHito = (etapaId, seccionId) => mutar((c) => {
    const seccion = c[ambito].etapas.find((e) => e.id === etapaId).secciones.find((s) => s.id === seccionId);
    seccion.hitos.push(nuevaPlantilla({ clave: `cat_${uid()}`, nombre: "Nuevo hito" }));
  });
  const quitarEtapa = (etapa) => {
    if (!window.confirm(`¿Quitar la etapa ${etapa.codigo} ${etapa.nombre} con todo lo que contiene?`)) return;
    mutar((c) => { c[ambito].etapas = c[ambito].etapas.filter((e) => e.id !== etapa.id); });
  };
  const quitarSeccion = (etapaId, seccion) => {
    if (!window.confirm(`¿Quitar la sección ${seccion.codigo} ${seccion.nombre} con sus hitos?`)) return;
    mutar((c) => { const e = c[ambito].etapas.find((x) => x.id === etapaId); e.secciones = e.secciones.filter((s) => s.id !== seccion.id); });
  };
  const renombrar = (etapaId, seccionId, nombre) => mutar((c) => {
    const e = c[ambito].etapas.find((x) => x.id === etapaId);
    if (seccionId) e.secciones.find((s) => s.id === seccionId).nombre = nombre;
    else e.nombre = nombre;
  });

  const agregarALista = (grupo) => mutar((c) => {
    const lista = c[grupo][ambito];
    const clave = claveUnica(grupo === "eventuales" ? "tramite" : "hito", lista.map((p) => p.clave));
    const base = grupo === "eventuales"
      ? { clave, nombre: "Nuevo trámite eventual", plazoBase: "manual", nota: "Trámite eventual agregado al expediente. No se crea automáticamente." }
      : { clave, nombre: "Nuevo hito opcional", etapaCodigo: c[ambito].etapas[0]?.codigo || "", etapaNombre: c[ambito].etapas[0]?.nombre || "" };
    lista.push(nuevaPlantilla(base));
  });

  // ---------- piezas de la pantalla ----------
  const claveRestaurar = (tipo, p) => {
    if (String(p.clave).startsWith("cat_")) return null;
    if (tipo === "eventual") return `eventual:${p.clave}`;
    if (tipo === "opcional") return `opcional:${p.clave}`;
    return p.clave;
  };

  const Fila = ({ tipo, p, indice, total }) => {
    const restauraCon = claveRestaurar(tipo, p);
    return (
      <div className="catalogo-hito-fila" style={p.activo === false ? { opacity: 0.6 } : undefined}>
        <div>
          <strong>{p.codigo ? `${p.codigo} · ` : ""}{p.nombre}</strong>
          <span className="ref">{(p.docs || []).length} documento(s) · {resumenPlazo(p)}{p.norma ? ` · ${p.norma}` : ""}</span>
          <div className="chips" style={{ marginTop: 4 }}>{badgesDe(p)}</div>
        </div>
        <div className="chips">
          {editable && tipo !== "recurrente" && (
            <>
              <button type="button" className="btn-icono" title="Subir" disabled={indice === 0} onClick={() => moverEnLista(p.id, -1)}>↑</button>
              <button type="button" className="btn-icono" title="Bajar" disabled={indice === total - 1} onClick={() => moverEnLista(p.id, 1)}>↓</button>
            </>
          )}
          <button type="button" className="btn mini" onClick={() => setEdicion({ id: p.id, tipo })}>{editable ? "Editar" : "Ver"}</button>
          {editable && (
            <>
              <button type="button" className="btn mini" onClick={() => alternarActivo(p.id)}>{p.activo === false ? "Activar" : "Desactivar"}</button>
              {restauraCon && <button type="button" className="btn mini" onClick={() => restaurar(restauraCon)}>Restaurar</button>}
              {tipo !== "recurrente" && <button type="button" className="btn-icono peligro" title="Quitar del catálogo" onClick={() => quitarPlantilla(p.id, p.nombre)}>×</button>}
            </>
          )}
        </div>
      </div>
    );
  };

  const enEdicion = edicion ? buscar(borrador, edicion.id) : null;
  const tiposDeAmbito = (
    <div className="tabs">
      {["obra", "consultoria"].map((a) => (
        <button key={a} type="button" className={ambitoLista === a ? "activo" : ""} onClick={() => setAmbitoLista(a)}>{tipoDeAmbito(a)}</button>
      ))}
    </div>
  );

  const arbol = esArbol ? borrador[pestana] : null;

  return (
    <div>
      <div className="vista-encabezado">
        <div>
          <div className="eyebrow">Catálogo</div>
          <h2>Hitos, documentos, plazos y pasos</h2>
          <p>Lo que cambies aquí se aplica a los contratos que crees después. Los contratos existentes conservan lo suyo.</p>
        </div>
        <div className="chips">
          {editable && sucio && <span className="badge ambar">Cambios sin guardar</span>}
          {editable && <button type="button" className="btn" disabled={!sucio} onClick={descartar}>Descartar</button>}
          {editable && <button type="button" className="btn primario" disabled={!sucio} onClick={guardar}>Guardar cambios</button>}
        </div>
      </div>

      {!editable && <div className="nota-info">Puedes consultar el catálogo, pero solo quien tiene permiso para editarlo puede modificarlo.</div>}
      {aviso && <div className="nota-info">{aviso}</div>}
      {error && <div className="alerta">{error}</div>}

      <div className="tabs">
        {[["obra", "Obra"], ["consultoria", "Consultoría"], ["eventuales", "Hitos eventuales"], ["opcionales", "Hitos opcionales"]].map(([clave, rotulo]) => (
          <button key={clave} type="button" className={pestana === clave ? "activo" : ""} onClick={() => setPestana(clave)}>{rotulo}</button>
        ))}
      </div>

      {esArbol && arbol.etapas.map((etapa) => (
        <div className="tarjeta" key={etapa.id}>
          <div className="tarjeta-cab">
            <h3>
              {etapa.codigo}{" "}
              {editable
                ? <input style={{ width: 280 }} value={etapa.nombre} onChange={(e) => renombrar(etapa.id, null, e.target.value)} />
                : etapa.nombre}
            </h3>
            {editable && (
              <div className="chips">
                <button type="button" className="btn mini" onClick={() => agregarSeccion(etapa.id)}>+ Sección</button>
                <button type="button" className="btn-icono peligro" title="Quitar etapa" onClick={() => quitarEtapa(etapa)}>×</button>
              </div>
            )}
          </div>
          <div className="cuerpo">
            {etapa.secciones.length === 0 && <div className="vacio">Esta etapa no tiene secciones.</div>}
            {etapa.secciones.map((seccion) => (
              <div key={seccion.id} style={{ marginBottom: 12 }}>
                <div className="tarjeta-cab" style={{ padding: "6px 0" }}>
                  <strong>
                    {seccion.codigo}{" "}
                    {editable
                      ? <input style={{ width: 260 }} value={seccion.nombre} onChange={(e) => renombrar(etapa.id, seccion.id, e.target.value)} />
                      : seccion.nombre}
                    {seccion.recurrente && <span className="badge violeta" style={{ marginLeft: 8 }}>Recurrente · {seccion.recurrente}</span>}
                  </strong>
                  {editable && (
                    <div className="chips">
                      {!seccion.recurrente && <button type="button" className="btn mini" onClick={() => agregarHito(etapa.id, seccion.id)}>+ Hito</button>}
                      <button type="button" className="btn-icono peligro" title="Quitar sección" onClick={() => quitarSeccion(etapa.id, seccion)}>×</button>
                    </div>
                  )}
                </div>
                {seccion.recurrente
                  ? seccion.plantilla && <Fila tipo="recurrente" p={seccion.plantilla} indice={0} total={1} />
                  : seccion.hitos.map((h, i) => <Fila key={h.id} tipo="hito" p={h} indice={i} total={seccion.hitos.length} />)}
                {!seccion.recurrente && seccion.hitos.length === 0 && <div className="vacio">Sin hitos.</div>}
              </div>
            ))}
          </div>
        </div>
      ))}
      {esArbol && editable && <button type="button" className="btn" onClick={agregarEtapa}>+ Etapa</button>}

      {!esArbol && (
        <>
          {tiposDeAmbito}
          <div className="tarjeta">
            <div className="tarjeta-cab">
              <h3>{pestana === "eventuales" ? "Trámites que se agregan cuando ocurren" : "Hitos que se agregan cuando se necesitan"}</h3>
              {editable && <button type="button" className="btn mini" onClick={() => agregarALista(pestana)}>+ Agregar</button>}
            </div>
            <div className="cuerpo">
              {borrador[pestana][ambito].length === 0 && <div className="vacio">No hay elementos.</div>}
              {borrador[pestana][ambito].map((p, i, lista) => (
                <Fila key={p.id} tipo={pestana === "eventuales" ? "eventual" : "opcional"} p={p} indice={i} total={lista.length} />
              ))}
            </div>
          </div>
        </>
      )}

      {editable && (
        <div style={{ marginTop: 18 }}>
          <button type="button" className="btn" onClick={() => restaurar(undefined)}>Restaurar catálogo original completo</button>
        </div>
      )}

      {enEdicion && (
        <EditorPlantilla
          key={enEdicion.plantilla.id}
          plantilla={enEdicion.plantilla}
          tipo={edicion.tipo}
          soloLectura={!editable}
          onAplicar={(valores) => aplicarPlantilla(enEdicion.plantilla.id, valores)}
          onCerrar={() => setEdicion(null)}
        />
      )}
    </div>
  );
}
