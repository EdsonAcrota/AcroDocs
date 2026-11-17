# Flujo de trámite, roles, catálogo, consorcios y mesa de partes — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir AcroDocs (demo local) en un control de trámites por pasos para una contratista mediana, con 9 roles, catálogo completo editable, consorcios y mesa de partes.

**Architecture:** La lógica nueva va en módulos puros y testeables (`fechas.js`, `permisos.js`, `flujo.js`, `migracion.js`, `cargos.js`). `store.js` sigue siendo la única capa de persistencia (localStorage `acrodocs_demo_v7`), con listas planas listas para pasar a tablas. Las páginas React consumen el store y `puede()`.

**Tech Stack:** React 18, react-router-dom 6, Vite 5, Vitest 2.1.9 + jsdom 25.0.1 (nuevo), localStorage + IndexedDB.

**Spec:** `docs/superpowers/specs/2026-11-17-flujo-tramite-design.md`. Léelo completo antes de cualquier tarea; las secciones citadas (§) son de ahí.

## Global Constraints

- Interfaz en español, con el lenguaje visual actual (`src/styles.css`). No agregar librerías de UI.
- Almacenamiento: clave `acrodocs_demo_v7`, `version: 7`. Los datos v6 en `acrodocs_demo_v6` se migran sin perder contratos, hitos ni documentos (§5.8).
- Toda lista nueva es plana, con `id` (uid) y referencias por id: `usuarios`, `permisosRoles`, `catalogo`, `movimientos`, `cargos`, `historial`, `empresa`.
- Estados de hito: exactamente `"Pendiente" | "En revisión" | "Observado" | "Completado" | "No aplica"`.
- Ningún plazo legal no verificado genera alerta de vencimiento. Un paso con `plazoDias = 0` muestra "plazo sin definir".
- Nada se borra en silencio: eliminaciones, anulaciones, reemplazos y cambios de catálogo, permisos o usuarios escriben en `historial`.
- La fila del rol `gerente` no se puede editar, y siempre debe existir al menos un usuario `gerente` activo.
- Cada tarea deja `npm run build` y `npx vitest run` en verde.

## Review Focus

1. **Los datos v6 reales del usuario** (contratos con documentos en IndexedDB y estados marcados) deben migrar intactos. Prueba en la Tarea 3: `migrarV6aV7 conserva items, documentos y estados`.
2. **Plazos que caen en fin de semana o feriado** (contar hábiles desde un viernes o pasando sobre un feriado de `feriados`). Prueba en la Tarea 1: `sumarHabiles salta sábado, domingo y feriado`.
3. **Anular el movimiento que cerró un paso** debe reabrir ese paso y recalcular los plazos siguientes, no dejar el hito Completado. Prueba en la Tarea 9: `anular el movimiento reabre el paso`.
4. **Un socio intentando degradar o desactivar al único gerente**, o al gerente en general, debe fallar con un mensaje claro. Prueba en la Tarea 3: `no se puede editar ni desactivar a un gerente`.
5. **Un residente sin contratos asignados** debe ver listas vacías (contratos, Panel, cargos) sin errores. Prueba en la Tarea 2: `residente sin asignaciones no ve contratos`. Prueba en la Tarea 13: `cargosVisibles para residente`.

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `src/lib/fechas.js` (nuevo) | `hoy`, `sumarDias`, `esHabil`, `sumarHabiles`, `diasEntre`. Única fuente; `store.js` y `catalogo.js` la importan |
| `src/lib/permisos.js` (nuevo) | Claves de permiso, roles, matriz inicial y `tienePermiso` (puro) |
| `src/lib/migracion.js` (nuevo) | `migrarV6aV7(data)` (puro) |
| `src/lib/catalogo.js` (mod.) | Semilla del catálogo y generación de hitos desde un catálogo almacenado |
| `src/lib/pasosSemilla.js` (nuevo) | Secuencias de pasos iniciales (§5.5) |
| `src/lib/flujo.js` (nuevo) | Motor puro de pasos: `instanciarPasos`, `calcularFlujo` |
| `src/lib/cargos.js` (nuevo) | `cargosVisibles`, `cargosACsv` (puros) |
| `src/lib/store.js` (mod.) | Persistencia, `puede`, historial, usuarios, ejecutor, catálogo, movimientos, cargos, alertas |
| `src/components/LineaTiempo.jsx` (nuevo) | Pasos y movimientos de un hito, con el formulario de registro |
| `src/components/UsuariosPermisos.jsx` (nuevo) | Usuarios y matriz de permisos |
| `src/components/HistorialLista.jsx` (nuevo) | Lista del historial filtrable |
| `src/pages/Catalogo.jsx` (nuevo) | Editor del catálogo completo |
| `src/pages/MesaPartes.jsx` (nuevo) | Registro y listado de cargos |
| `src/pages/*.jsx`, `src/App.jsx` (mod.) | Usar `puede()`, nuevas rutas, pestañas Historial y Cargos |
| `schema.sql`, `README.md` (mod.) | Tablas nuevas y documentación |

Las pruebas van junto al módulo: `src/lib/<modulo>.test.js`.

---

### Task 0: Repositorio, Vitest y módulo de fechas

**Files:**
- Create: `.gitignore` (`node_modules`, `dist`, `.env.local`), `vitest.config.js`, `src/lib/fechas.js`, `src/lib/fechas.test.js`
- Modify: `package.json` (script `"test": "vitest run"`), `src/lib/store.js:19-69`, `src/lib/catalogo.js:6-56`

**Interfaces:**
- Produces: `hoy(): string`, `sumarDias(iso, n): string`, `esHabil(iso, feriados: string[]): boolean`, `sumarHabiles(iso, n, feriados): string`, `diasEntre(a, b): number`, `FERIADOS_2026: string[]`

- [ ] **Step 1:** Ejecuta `git init`, crea `.gitignore` y haz el commit inicial del estado actual: `git add -A && git commit -m "chore: estado inicial de AcroDocs"`.
- [ ] **Step 2:** Instala las dependencias de prueba con `npm i -D vitest@2.1.9 jsdom@25.0.1`. En `vitest.config.js` usa `environment: "jsdom"`.
- [ ] **Step 3: Escribe las pruebas que fallan** en `fechas.test.js`:
  - `sumarHabiles salta sábado, domingo y feriado`: `sumarHabiles("2026-07-24", 2, ["2026-07-28"])` === `"2026-07-29"`. El viernes 24 + 2 hábiles salta el sábado 25 y el domingo 26, cuenta el lunes 27, salta el feriado 28 y cae el 29.
  - `sumarHabiles con 0 devuelve la misma fecha`: `sumarHabiles("2026-11-17", 0, [])` === `"2026-11-17"`.
  - `diasEntre`: `diasEntre("2026-11-17", "2026-11-20")` === 3, y `diasEntre("2026-11-20", "2026-11-17")` === -3.
  - `esHabil("2026-11-21", [])` === false (sábado).
- [ ] **Step 4:** Ejecuta `npx vitest run src/lib/fechas.test.js`. Esperado: FAIL, el módulo no existe.
- [ ] **Step 5:** Mueve a `fechas.js` las funciones duplicadas de `store.js` y `catalogo.js`. Los feriados se pasan siempre como argumento; ya no se usa el estado global `feriadosActivos`, así que `configurarFeriados` desaparece y quienes lo llamaban pasan `data.feriados`. Firmas provisionales hasta la Tarea 6: `crearTareas(tramite, plantillasDocs, catalogoHitos, feriados)` y `crearTareaEventual(tramite, clave, existentes, feriados)`. Actualiza los imports.
- [ ] **Step 6:** Ejecuta `npx vitest run` y `npm run build`. Esperado: PASS y build OK. Abre la app y verifica que un contrato nuevo genera los mismos hitos con las mismas fechas que antes.
- [ ] **Step 7:** Commit: `refactor: unificar cálculo de fechas y agregar Vitest`.

### Task 1: Permisos (módulo puro)

**Files:**
- Create: `src/lib/permisos.js`, `src/lib/permisos.test.js`

**Interfaces:**
- Produces:
  - `PERMISOS: Array<{clave, grupo, nombre, peligroso?: true}>`, con las 19 claves de §5.1 en ese orden.
  - `ROLES: Array<{clave, nombre, descripcion}>`, con las claves `gerente, socio, jefe, residente, asis_tec, asis_adm, finanzas, legal, consulta`.
  - `MATRIZ_INICIAL: Record<rol, string[]>`, exactamente la tabla "Matriz inicial" de §5.1 (gerente y socio = todas).
  - `ROL_ANTIGUO: {admin:"gerente", logistica:"asis_adm", area_usuaria:"asis_tec", legal:"legal", lectura:"consulta"}`
  - `tienePermiso(matriz, usuario: {rol, contratos?: string[]}|null, permiso: string, tramiteId?: string): boolean`
  - `veContrato(matriz, usuario, tramiteId): boolean`

- [ ] **Step 1: Escribe las pruebas que fallan:**
  - `gerente tiene todo aunque la matriz diga otra cosa`: `tienePermiso({gerente: []}, {rol:"gerente"}, "borrar_doc")` === true.
  - `asis_adm no puede borrar_doc ni borrar_hito`.
  - `residente sin asignaciones no ve contratos`: `veContrato(MATRIZ_INICIAL, {rol:"residente", contratos:[]}, "t-001")` === false.
  - `residente asignado ve su contrato y puede subir en él`: con `contratos:["t-001"]`, `tienePermiso(..., "subir", "t-001")` === true y con `"t-002"` === false.
  - `usuario null no tiene permisos`.
- [ ] **Step 2:** Ejecuta `npx vitest run src/lib/permisos.test.js`. Esperado: FAIL.
- [ ] **Step 3:** Implementa `permisos.js`. Si llega `tramiteId`, `tienePermiso` exige además `veContrato`. `veContrato` es true si el rol tiene `ver_todos` o si `tramiteId ∈ usuario.contratos`.
- [ ] **Step 4:** Ejecuta las pruebas. Esperado: PASS.
- [ ] **Step 5:** Commit: `feat: módulo de permisos y roles`.

### Task 2: Store v7 — migración, usuarios, sesión, `puede` e historial

**Files:**
- Create: `src/lib/migracion.js`, `src/lib/migracion.test.js`, `src/lib/store.test.js`
- Modify: `src/lib/store.js` (KEY, `seed`, `read`, login y funciones destructivas)

**Interfaces:**
- Consumes: Task 1 completa.
- Produces:
  - `migrarV6aV7(v6): DataV7`, puro, en `migracion.js`. Agrega `usuarios`, `permisosRoles: MATRIZ_INICIAL` (copia), `historial: []`, `empresa: {razonSocial:"", ruc:""}`, `movimientos: []`, `cargos: []`. Agrega `ejecutor` a cada contrato (§5.3: texto que empieza con "Consorcio" → `{tipo:"consorcio", nombre: contratista, ruc:"", representante:"", integrantes:[]}`, si no `{tipo:"empresa"}`). Agrega `pasos: []` a cada item. `catalogo` se agrega en la Tarea 5.
  - `USUARIOS_DEMO`: un usuario por rol, `{id, nombre, email: "<x>@acrodocs.local", password: "<x>123", rol, contratos: [], activo: true}`, con `x` ∈ `gerente, socio, jefe, residente, tecnico, administrativo, finanzas, legal, consulta`. El residente queda asignado a `t-001`.
  - En store: `loginDemo(email, password)` (busca en `data.usuarios`; rechaza a los inactivos), `getSession()` (devuelve `{usuarioId, nombre, email, rol, contratos}`), `puede(permiso, tramiteId?)` (usa la sesión y `data.permisosRoles`), `exigir(permiso, tramiteId?)` (lanza `Error("No tienes permiso para esta acción.")`), `registrarHistorial({accion, objeto, objetoId, tramiteId?, detalle})`, `listarHistorial({tramiteId?, objeto?})`.
  - `listTramites()` filtra por `veContrato`.
  - Las funciones destructivas existentes llaman a `exigir` y a `registrarHistorial`: `removeItem` (`borrar_hito`), eliminar documento (`borrar_doc`) y eliminar contrato (`eliminar`; créala si no existe, como `deleteTramite(id)`).

- [ ] **Step 1: Escribe las pruebas que fallan** en `migracion.test.js`:
  - `migrarV6aV7 conserva items, documentos y estados`: con un v6 de 2 contratos, uno de cuyos items tiene `documentos:[{archivoId:"a1"}]` y `estado:"Completado"`, el resultado tiene el mismo número de items y conserva ese documento y ese estado.
  - `contratista "Consorcio X" pasa a ejecutor consorcio`.
  - `crea los 9 usuarios demo y la matriz inicial`.
- [ ] **Step 2:** Escribe las pruebas que fallan en `store.test.js`. Usa `localStorage.clear()` en `beforeEach` y entra como cada rol con `loginDemo`.
  - `asistente administrativo no puede eliminar un hito`: `removeItem(id)` lanza un error, el item sigue existiendo y no se agrega nada al historial.
  - `gerente elimina un hito y queda en historial`: `listarHistorial()[0].accion` === `"eliminar"` y `objeto` === `"hito"`.
  - `residente sin asignaciones no ve contratos`: tras quitarle `t-001`, `listTramites()` devuelve `[]`.
  - `read migra acrodocs_demo_v6 y borra la clave vieja`.
- [ ] **Step 3:** Ejecuta `npx vitest run`. Esperado: FAIL.
- [ ] **Step 4:** Implementa. `KEY = "acrodocs_demo_v7"`, `KEYS_ANTERIORES = ["acrodocs_demo_v6"]`. La lógica de migración vive en `migracion.js`; `store.js` solo la invoca. Antes de borrar la clave v6, copia su texto crudo a `acrodocs_respaldo_v6`. Con eso se cumple el "respaldo antes de migrar" de §5.8 sin bloquear el arranque. En la Tarea 3, Configuración muestra "Descargar respaldo previo a la migración" (permiso `respaldo`) mientras exista esa clave. Agrega la prueba `read guarda acrodocs_respaldo_v6`.
- [ ] **Step 5:** Ejecuta `npx vitest run`. Esperado: PASS.
- [ ] **Step 6:** Commit: `feat: almacenamiento v7 con usuarios, permisos e historial`.

### Task 3: Gestión de usuarios y de la matriz de permisos

**Files:**
- Create: `src/components/UsuariosPermisos.jsx`
- Modify: `src/lib/store.js`, `src/lib/store.test.js`, `src/pages/Configuracion.jsx`

**Interfaces:**
- Produces (store, todas con `exigir("usuarios")` e historial): `listarUsuarios()`, `crearUsuario({nombre,email,password,rol,contratos})`, `actualizarUsuario(id, cambios)`, `getPermisosRoles()`, `setPermisoRol(rol, permiso, activo: boolean)`

- [ ] **Step 1: Escribe las pruebas que fallan:**
  - `no se puede editar ni desactivar a un gerente`: como socio, tanto `actualizarUsuario(idGerente, {activo:false})` como `{rol:"socio"}` lanzan `"La cuenta del gerente general no se puede modificar."`.
  - `setPermisoRol("gerente", ...) lanza error`.
  - `crearUsuario con email repetido lanza error`.
  - `setPermisoRol("asis_adm","borrar_doc",true) habilita borrar_doc al asistente`.
- [ ] **Step 2:** Ejecuta. Esperado: FAIL.
- [ ] **Step 3:** Implementa las funciones del store. Un usuario `gerente` solo lo puede editar otro gerente, y nunca puede quedar ningún gerente activo.
- [ ] **Step 4:** Ejecuta. Esperado: PASS.
- [ ] **Step 5:** Agrega a la UI la sección "Usuarios y permisos" en Configuración, visible con `puede("usuarios")`:
  - tabla de usuarios: alta, edición, activar o desactivar, rol y contratos asignados (multiselección);
  - matriz: roles × permisos con casillas agrupadas como en §5.1, los permisos `peligroso` en rojo y la fila del gerente bloqueada.
  
  Las demás secciones de Configuración se muestran por permiso: feriados con `feriados`, respaldo con `respaldo` y catálogo personalizado con `catalogo` (en la Tarea 6 se mueve a su propia página).
- [ ] **Step 6:** Commit: `feat: gestión de usuarios y matriz de permisos`.

### Task 4: Permisos en toda la interfaz, versiones de documentos y pestaña Historial

**Files:**
- Create: `src/components/HistorialLista.jsx`
- Modify: `src/App.jsx`, `src/pages/Login.jsx`, `src/pages/Tramites.jsx`, `src/pages/TramiteDetalle.jsx`, `src/pages/Panel.jsx`, `src/lib/store.js`, `src/lib/store.test.js`

**Interfaces:**
- Consumes: `puede`, `listarHistorial`.
- Produces (store):
  - `agregarDocumento(itemId, meta)`, con `exigir("subir", tramiteId)`;
  - `reemplazarDocumento(itemId, docId, meta)`, con `exigir("reemplazar", tramiteId)`: el doc conserva su `id`, toma el nuevo `archivoId/nombre/tamano/fecha` y agrega el anterior a `doc.versiones` (`[{archivoId, nombre, tamano, fecha, reemplazadoPor, reemplazadoEl}]`);
  - `eliminarDocumento(itemId, docId)`, con `exigir("borrar_doc", tramiteId)`, que borra también sus versiones de IndexedDB.

- [ ] **Step 1: Escribe las pruebas que fallan:**
  - `reemplazarDocumento guarda la versión anterior`.
  - `asis_tec puede agregarDocumento a un documento ya cargado sin tocar el anterior` (regla 7 de §5.9).
  - `asis_tec no puede reemplazarDocumento`.
- [ ] **Step 2:** Ejecuta. Esperado: FAIL. Luego implementa y vuelve a ejecutar. Esperado: PASS.
- [ ] **Step 3:** Cambios de UI:
  - Reemplaza toda comprobación `soloLectura` y `session.rol === "admin"` por `puede(...)` con su `tramiteId`. Los botones sin permiso no se muestran.
  - `TramiteDetalle` usa las tres funciones del store en lugar de llamar a `updateItem` con `documentos`.
  - Agrega el botón "Nueva versión" (con `reemplazar`) y la lista desplegable de versiones descargables por documento.
  - Agrega una pestaña "Historial" en el contrato (`HistorialLista` con `tramiteId`) y una sección "Historial de cambios" en Configuración (`HistorialLista` con `objeto` ∈ `catalogo`, `permisos`, `usuarios`).
  - Login lista los 9 usuarios demo.
  - El pie de la barra lateral muestra el nombre del rol desde `ROLES`.
- [ ] **Step 4:** Ejecuta `npm run build`. Luego, en el navegador:
  - como `administrativo@acrodocs.local`, no aparece ningún botón de eliminar y sí aparece "Subir";
  - como `consulta@acrodocs.local`, solo se puede ver y descargar.
- [ ] **Step 5:** Commit: `feat: permisos por rol en la interfaz, versiones de documentos e historial`.

### Task 5: Ejecutor y consorcios

**Files:**
- Modify: `src/lib/store.js`, `src/lib/store.test.js`, `src/pages/Tramites.jsx`, `src/pages/TramiteDetalle.jsx` (cabecera), `src/pages/Configuracion.jsx`

**Interfaces:**
- Produces:
  - `validarEjecutor(ejecutor): string[]`, que devuelve avisos y no bloquea. Ejemplo: `"Las participaciones suman 90 %; deben sumar 100 %."`.
  - `getEmpresa()` y `guardarEmpresa({razonSocial, ruc})` (con `exigir("usuarios")`).
  - `createTramite(form)` acepta `form.ejecutor`.
  - `nombreEjecutor(tramite): string`: la razón social de la empresa o el nombre del consorcio.

- [ ] **Step 1: Escribe las pruebas que fallan:**
  - `validarEjecutor avisa si las participaciones no suman 100`.
  - `consorcio sin integrantes produce aviso`.
  - `createTramite guarda ejecutor consorcio`.
- [ ] **Step 2:** Ejecuta, implementa y vuelve a ejecutar. Esperado: PASS.
- [ ] **Step 3:** Cambios de UI:
  - Formulario de contrato con un selector Empresa/Consorcio. Si es consorcio: nombre, RUC, representante e integrantes (razón social, RUC, %), con los avisos de `validarEjecutor`.
  - Filtro por ejecutor en el listado de contratos.
  - Bloque "Empresa" en Configuración.
  - La cabecera del contrato muestra `nombreEjecutor`.
- [ ] **Step 4:** Ejecuta `npm run build` y prueba en el navegador a crear un contrato en consorcio.
- [ ] **Step 5:** Commit: `feat: contratos ejecutados por empresa o consorcio`.

### Task 6: Catálogo almacenado (fusión de plantillas y catálogo personalizado)

**Files:**
- Modify: `src/lib/catalogo.js`, `src/lib/migracion.js`, `src/lib/migracion.test.js`, `src/lib/store.js`, `src/lib/store.test.js`, `src/pages/TramiteDetalle.jsx` (los llamados a `guardarPlantilla`, `actualizarCatalogoPorClave` y `agregarCatalogoHito`)
- Create: `src/lib/catalogo.test.js`

**Interfaces:**
- Produces:
  - `catalogoSemilla(): Catalogo`. Es serializable y se arma desde `OBRA`, `CONSULTORIA`, `EVENTUALES` y `HITOS_OPCIONALES`.
    ```text
    Catalogo = { obra: Arbol, consultoria: Arbol,
                 eventuales: {obra: Plantilla[], consultoria: Plantilla[]},
                 opcionales: {obra: Plantilla[], consultoria: Plantilla[]} }
    Arbol = { codigo, nombre, etapas: [{ id, codigo, nombre, secciones: [{ id, codigo, nombre,
              recurrente?: "mensual"|"anual", diaLimite?, soloPrimerPeriodo?, plantilla?: Plantilla,
              hitos?: Plantilla[] }] }] }
    Plantilla = { id, clave, nombre, docs, cumplimiento, plazoDias, plazoBase, plazoHabiles, norma, nota,
                  activo, verificado, pasos: Paso[], plazoLevantamiento: {dias, habiles}|null,
                  silencioPositivo?, diasSilencio? }
    ```
    `clave` = el código actual del hito (por ejemplo `"1.1.1"`) o la clave del eventual (`"ampliacion"`), para no romper los `clavePlantilla` existentes. `verificado: false` y `pasos: []` en todos; los pasos se cargan en la Tarea 8.
  - `crearTareas(tramite, catalogo, feriados)` reemplaza la firma `(tramite, plantillasDocs, catalogoHitos)`. Toma el árbol de `catalogo.obra` o `catalogo.consultoria` según `esConsultoria`, omite los hitos con `activo:false` y numera por orden.
  - `crearTareaEventual(tramite, clave, existentes, catalogo, feriados)` y `listarEventuales(tipo, catalogo)`, igual para los opcionales.
  - Al migrar (en `migracion.js`): `catalogo = catalogoSemilla()`, con `plantillasDocs[clave]` (docs, cumplimiento y overrides) aplicado sobre la plantilla de la misma `clave`, y cada `catalogoHitos[i]` insertado como hito al final de la sección `etapaCodigo` de su árbol. Se eliminan `plantillasDocs` y `catalogoHitos`.
  - Store: `getCatalogo()`, `guardarCatalogo(catalogo, detalle)` (con `exigir("catalogo")` e historial `{accion:"editar", objeto:"catalogo"}`), `restaurarCatalogo(ruta?)`. Las funciones viejas (`guardarPlantilla`, `agregarCatalogoHito`, `actualizarCatalogoHito`, `eliminarCatalogoHito`, `actualizarCatalogoPorClave`) se reescriben sobre `catalogo`, con la misma firma, para no tocar más UI de la necesaria.

- [ ] **Step 1: Escribe las pruebas que fallan:**
  - `crearTareas con catalogoSemilla genera los mismos códigos que antes`. Antes del cambio, captura en la prueba la lista de `codigo` que genera el código actual para el contrato demo `t-001` y para `t-002`, y compara.
  - `hito desactivado no se genera`.
  - `migración funde plantillasDocs (docs editados) en el catálogo`.
  - `migración inserta catalogoHitos en su etapa`.
  - `asis_adm no puede guardarCatalogo`, y `jefe` sí.
- [ ] **Step 2:** Ejecuta. Esperado: FAIL.
- [ ] **Step 3:** Implementa. Ejecuta `npx vitest run`. Esperado: PASS.
- [ ] **Step 4:** Ejecuta `npm run build`. En el navegador, crea un contrato nuevo, edita los documentos de un hito con "guardar en plantilla" y crea otro contrato: el segundo trae el cambio.
- [ ] **Step 5:** Commit: `feat: catálogo completo almacenado como datos`.

### Task 7: Pantalla Catálogo

**Files:**
- Create: `src/pages/Catalogo.jsx`
- Modify: `src/App.jsx` (ruta `/catalogo` y entrada en la barra lateral), `src/pages/Configuracion.jsx` (quitar el catálogo personalizado y dejar un enlace a `/catalogo`)

**Interfaces:**
- Consumes: `getCatalogo`, `guardarCatalogo`, `restaurarCatalogo`, `puede("catalogo")`.

- [ ] **Step 1:** Implementa la página según §5.4:
  - pestañas Obra, Consultoría, Trámites eventuales y Opcionales;
  - árbol con subir y bajar (la numeración se recalcula sobre el árbol);
  - agregar etapa, sección o hito, y desactivar o quitar (pide confirmación al quitar);
  - formulario de plantilla: todos los campos de `Plantilla` y la casilla "Plazo verificado";
  - etiqueta "plazo por verificar" cuando `verificado` es false y `plazoDias > 0`;
  - "Restaurar original" por hito y global.
  
  El editor de pasos dentro de la plantilla es una lista editable de `Paso` (campos en la Tarea 8), y `desde` se elige entre los pasos anteriores.
  
  Sin `catalogo`, la página es de solo lectura. Se guarda con un botón "Guardar cambios", que hace una sola llamada a `guardarCatalogo`, no una por cada tecla.
- [ ] **Step 2:** Ejecuta `npm run build` y verifica en el navegador:
  - como jefe, renombrar un hito, agregar un documento, desactivar otro y crear un contrato: el contrato refleja los tres cambios;
  - como asistente, la página no deja editar.
- [ ] **Step 3:** Commit: `feat: pantalla de catálogo completo editable`.

### Task 8: Motor de flujo (puro) y pasos semilla

**Files:**
- Create: `src/lib/flujo.js`, `src/lib/flujo.test.js`, `src/lib/pasosSemilla.js`
- Modify: `src/lib/catalogo.js` (`catalogoSemilla` asigna los pasos semilla)

**Interfaces:**
- Produces:
  - `Paso = {clave, nombre, responsable: "contratista"|"supervision"|"entidad", tipoRegistro: "asiento"|"presentacion"|"respuesta"|"otro", plazoDias, habiles, desde: string|null, alertas: number[], alVencer: "aviso"|"silencio_positivo", verificado}`. Valores por defecto: `alertas: [5, 3, 1]`, `alVencer: "aviso"`, `habiles: true`, `verificado: false`.
  - `PASOS_SEMILLA: Record<clavePlantilla, Paso[]>` para `ampliacion` (obra y consultoría), `adicional`, `cambio_personal`, `1.3.2` y `2.3.2` (valorización), y `1.3.3` y `2.3.3` (informe mensual). Usa las secuencias de la tabla de §5.5:
    - En la ampliación, "Presentar solicitud" tiene `plazoDias: 10, habiles: true, desde: "fin_causal", verificado: true`.
    - "Pronunciamiento de la entidad" tiene `desde: "informe_supervision", alVencer: "silencio_positivo"`.
    - Todos los demás plazos de supervisión y entidad van con `plazoDias: 0, verificado: false`.
    - `cambio_personal` tiene `alVencer: "silencio_positivo"` en su pronunciamiento.
  - `instanciarPasos(pasos: Paso[], fechaLimiteHito: string): PasoItem[]`: hace una copia profunda y fija `pasos[0].fechaLimiteFija = fechaLimiteHito || null` (regla 1 de §5.9).
  - `calcularFlujo(item: {pasos: PasoItem[], plazoLevantamiento}, movimientos: Movimiento[], {feriados, hoy}): Flujo`
    ```text
    Movimiento = {id, itemId, pasoClave, tipo, fecha, anulado?}
    Flujo = { pasos: [{...PasoItem, estado: "cumplido"|"actual"|"pendiente"|"sin_respuesta",
                       inicio: string|null, fechaLimite: string|null, movimiento: Movimiento|null}],
              actual: number,            // -1 si todos cumplidos
              ciclo: number,             // cantidad de "observado" no anulados
              observado: boolean,        // último observado/levantado es "observado"
              levantamientoLimite: string|null,
              estado: "Pendiente"|"En revisión"|"Observado"|"Completado",
              aCargo: "contratista"|"supervision"|"entidad"|null,
              fechaLimite: string,       // "" si no hay
              silencioVencido: boolean }
    ```
  - Reglas que implementa `calcularFlujo` (§5.5 y §5.9):
    - Solo cuentan los movimientos no anulados del item.
    - Un paso se cumple con un movimiento de tipo distinto de `observado`/`levantado`, con `pasoClave` igual a su clave y fecha posterior o igual al último `levantado` que lo reabrió.
    - Inicio del paso i > 0 = la fecha del movimiento del paso `desde` (o del anterior); si ese paso no tiene movimiento, su `fechaLimite`. `fechaLimite = inicio + plazoDias` (hábiles o calendario). Si `plazoDias` es 0, `fechaLimite = null`. El paso 0 usa `fechaLimiteFija`.
    - Los pasos no cumplidos anteriores al último cumplido quedan como `sin_respuesta`.
    - `observado` sobre el paso P abre el levantamiento (a cargo del contratista, límite = fecha + `plazoLevantamiento`). `levantado` reabre P con inicio = fecha del levantado.
    - `estado` según la tabla de §5.5. `silencioVencido` = el paso actual tiene `alVencer: "silencio_positivo"`, `fechaLimite < hoy` y no está cumplido.

- [ ] **Step 1: Escribe las pruebas que fallan**, cada una con fechas concretas y `feriados: []`:
  - `ampliación: fin de causal el 2026-11-10 fija la solicitud el 2026-11-24`. Son 10 hábiles desde el martes 10: del 11 al 24, sin fines de semana.
  - `sin movimientos, el primer paso está actual y el estado es Pendiente`.
  - `paso de la supervisión actual → En revisión, aCargo supervision`.
  - `entidad cuenta desde el vencimiento de la supervisión si esta no actuó`: el informe de la supervisión tiene `plazoDias: 5`, la solicitud se presentó el 2026-11-24 y no hay informe. El pronunciamiento de la entidad, con `plazoDias: 10`, tiene `inicio = "2026-12-01"`.
  - `registro fuera de orden marca sin_respuesta`.
  - `observado y levantado vuelven al paso que observó, ciclo 1`.
  - `anular el movimiento reabre el paso` (Review Focus 3): con el último paso cumplido y su movimiento `anulado:true`, el estado no es Completado y `actual` apunta a ese paso.
  - `silencioVencido true cuando vence el pronunciamiento de la entidad sin movimiento`, con `hoy` posterior a la fecha límite.
  - `plazo 0 → fechaLimite null y silencioVencido false`.
  - `todos cumplidos → Completado, actual -1`.
- [ ] **Step 2:** Ejecuta `npx vitest run src/lib/flujo.test.js`. Esperado: FAIL.
- [ ] **Step 3:** Implementa `flujo.js` y `pasosSemilla.js`, y conecta los pasos en `catalogoSemilla`.
- [ ] **Step 4:** Ejecuta `npx vitest run`. Esperado: PASS.
- [ ] **Step 5:** Commit: `feat: motor de flujo de trámite por pasos`.

### Task 9: Movimientos en el store

**Files:**
- Modify: `src/lib/store.js`, `src/lib/store.test.js`, `src/lib/catalogo.js` (`crearTarea` copia `pasos` con `instanciarPasos` y copia `plazoLevantamiento`)

**Interfaces:**
- Consumes: `calcularFlujo`, `instanciarPasos`.
- Produces:
  - `registrarMovimiento(itemId, {pasoClave, tipo, fecha, hora?, numeroDocumento?, asientoCO?, cargoId?, archivoId?, nota?}): Movimiento`, con `exigir("registrar", tramiteId)`.
  - `anularMovimiento(id, motivo)`, con `exigir("corregir", tramiteId)` e historial.
  - `listarMovimientos(itemId)`.
  - `flujoDeItem(itemId): Flujo|null` (null si el item no tiene pasos).
  - `activarPasos(itemId)` (con `estado`): copia los pasos de la plantilla vigente del catálogo y falla si el item ya tiene pasos.
  - `registrarSilencio(itemId)`: crea un `pronunciamiento` en el paso actual con nota `"Aprobado por silencio positivo"` y fecha = `sumarDias(fechaLimite, 1)`. Solo funciona si `silencioVencido` es true.
  - Tras cada cambio, `sincronizarItem(itemId)` (interno) escribe `estado` y `fecha_limite` del item desde `calcularFlujo`, salvo que el item esté en `"No aplica"`.
  - `updateItem` rechaza `estado` distinto de `"No aplica"` o `"Pendiente"` (reabrir) en items con pasos.

- [ ] **Step 1: Escribe las pruebas que fallan:**
  - `registrar fin de causal actualiza fecha_limite del item a la de la solicitud`.
  - `anularMovimiento recalcula y deja historial`.
  - `registrarSilencio falla si el plazo no venció`.
  - `registrarSilencio completa el hito con la fecha del día siguiente al vencimiento`.
  - `updateItem({estado:"Completado"}) en item con pasos lanza error`.
  - `activarPasos en un item migrado sin pasos copia los de la plantilla`.
- [ ] **Step 2:** Ejecuta, implementa y vuelve a ejecutar. Esperado: PASS.
- [ ] **Step 3:** Commit: `feat: movimientos de trámite en el store`.

### Task 10: Línea de tiempo en la ficha del hito

**Files:**
- Create: `src/components/LineaTiempo.jsx`
- Modify: `src/pages/TramiteDetalle.jsx` (modal del hito, líneas ~900-1140)

**Interfaces:**
- Consumes: `flujoDeItem`, `registrarMovimiento`, `anularMovimiento`, `activarPasos`, `registrarSilencio`, `puede`.

- [ ] **Step 1:** Implementa `LineaTiempo` con estas props: `{item, onCambio}`. Debe mostrar:
  - pasos con ✔ (cumplido), ● (actual), ○ (pendiente) y "sin respuesta";
  - por paso: responsable, fecha límite, días restantes y "plazo sin definir" o "plazo por verificar";
  - movimientos con número de documento, asiento, enlace al archivo y "Ver cargo" si tiene `cargoId`, y los anulados tachados con su motivo;
  - el ciclo de observaciones ("Observación 2").
  
  Botones, cada uno según su permiso:
  - "Registrar" en el paso actual: un formulario con tipo, fecha, n.º de documento, asiento, nota y archivo opcional (se guarda con `guardarArchivo`);
  - "Observar" y "Levantar observaciones";
  - "Anular";
  - "Registrar aprobación por silencio" con confirmación, visible solo si `silencioVencido`;
  - "Activar seguimiento por pasos", si el item no tiene pasos y su plantilla sí.
- [ ] **Step 2:** En el modal, en items con pasos:
  - el desplegable de estado solo ofrece "No aplica" o "Reabrir";
  - se ocultan los botones "Marcar completado" y "Desmarcar";
  - subir el documento de cumplimiento ya no cambia el estado (regla 5 de §5.9).
  
  En items sin pasos todo queda igual.
- [ ] **Step 3:** Ejecuta `npm run build` y prueba en el navegador el caso 1 del spec:
  - crea una ampliación de plazo en el contrato demo;
  - registra el asiento de inicio y el de fin de causal (2026-11-10);
  - verifica que "Presentar solicitud" vence el 24/11/2026;
  - registra la solicitud, una observación y su levantamiento;
  - anula un movimiento y comprueba que el flujo se recalcula.
- [ ] **Step 4:** Commit: `feat: línea de tiempo y registro de pasos en la ficha del hito`.

### Task 11: Alertas del Panel

**Files:**
- Modify: `src/lib/store.js`, `src/lib/store.test.js`, `src/pages/Panel.jsx`

**Interfaces:**
- Produces: `alertasPanel(hoy?: string): Array<{grupo: "te_toca"|"otra_parte"|"sin_pasos"|"plazo_sin_definir", nivel: "rojo"|"ambar", texto, url}>`. Devuelve `[]` sin el permiso `alertas`. Solo considera los contratos visibles.
  - `te_toca`: paso actual del contratista (o levantamiento pendiente) con `fechaLimite` y `diasEntre(hoy, fechaLimite) <= max(alertas)`. Si ya venció es `rojo`, si no `ambar`. Texto: `"{codigoContrato} · {codigoHito} {nombre}: {nombrePaso} vence en N día(s)"` (o `"vence hoy"`, o `"venció hace N día(s)"`).
  - `otra_parte`: paso actual de la supervisión o la entidad, vencido, nivel `rojo`.
    - Con `silencioVencido`, el texto es: `"Posible aprobación por silencio: la entidad no se pronunció; plazo vencido el dd/mm/aaaa (hace N días)"`.
    - Si no: `"{Supervisión|Entidad} sin respuesta: {nombrePaso} venció hace N día(s)"`.
  - `sin_pasos`: la lógica actual del Panel para items sin pasos.
  - `plazo_sin_definir`: solo para quien tiene `catalogo`. Un único aviso con la cantidad de pasos actuales con `plazoDias = 0`.
- [ ] **Step 1: Escribe las pruebas que fallan**, una por grupo, con `hoy` fijo. Incluye: `consulta no recibe alertas` y `paso con plazo 0 no genera te_toca`.
- [ ] **Step 2:** Ejecuta, implementa y vuelve a ejecutar. Esperado: PASS.
- [ ] **Step 3:** El Panel muestra los cuatro grupos con encabezados ("Te toca", "Plazo vencido de la otra parte", "Otros hitos" y "Plazos por definir"). Se conservan las alertas de fin de ejecución de contrato y los KPIs (filtrados por contratos visibles).
- [ ] **Step 4:** Ejecuta `npm run build` y verifica en el navegador con la ampliación de la Tarea 10.
- [ ] **Step 5:** Commit: `feat: alertas por paso en el Panel`.

### Task 12: Mesa de partes — lógica

**Files:**
- Create: `src/lib/cargos.js`, `src/lib/cargos.test.js`
- Modify: `src/lib/store.js`, `src/lib/store.test.js`

**Interfaces:**
- Produces:
  - `Cargo` con los campos de §5.7 (`emisor` = `"empresa"` o el id de un contrato en consorcio).
  - `cargosVisibles(cargos, usuario, matriz): Cargo[]` (regla 6 de §5.9):
    - con `ver_todos`, ve todos;
    - si no, los de `usuario.contratos` más los que tienen `registradoPor === usuario.usuarioId`.
  - `cargosACsv(cargos, tramitesPorId): string`. Usa separador `;`, BOM UTF-8 y estas columnas: `Fecha;Hora;Entidad;Oficina;N° registro;Tipo;N° documento;Asunto;Emisor;Contrato;Hito;Presentado por;Anulado`.
  - Store:
    - `registrarCargo(datos)`, con `exigir("registrar")` (y `tramiteId` si lo tiene). Si trae `itemId` y `pasoClave`, llama a `registrarMovimiento(itemId, {pasoClave, tipo:"presentado", fecha, hora, numeroDocumento, cargoId})`.
    - `anularCargo(id, motivo)`, con `corregir`; anula también el movimiento vinculado.
    - `eliminarCargo(id)`, con `borrar_doc` e historial.
    - `listarCargos({desde, hasta, tramiteId, entidad, emisor, texto})`, que aplica `cargosVisibles`.
- [ ] **Step 1: Escribe las pruebas que fallan:**
  - `cargosVisibles para residente`: ve el cargo de `t-001` y el que registró él sin contrato, pero no el de `t-002` ni el cargo sin contrato de otro usuario.
  - `cargosACsv escapa punto y coma y saltos de línea en el asunto`.
  - `registrarCargo vinculado a un paso avanza el flujo`.
  - `anularCargo anula su movimiento`.
  - `asis_adm no puede eliminarCargo`.
- [ ] **Step 2:** Ejecuta, implementa y vuelve a ejecutar. Esperado: PASS.
- [ ] **Step 3:** Commit: `feat: lógica de mesa de partes`.

### Task 13: Mesa de partes — pantallas

**Files:**
- Create: `src/pages/MesaPartes.jsx`
- Modify: `src/App.jsx` (ruta `/mesa-partes` y entrada en la barra lateral), `src/pages/TramiteDetalle.jsx` (pestaña "Cargos"), `src/components/LineaTiempo.jsx` ("Ver cargo" abre el cargo)

**Interfaces:**
- Consumes: `listarCargos`, `registrarCargo`, `anularCargo`, `eliminarCargo`, `cargosACsv`, `guardarArchivo`, `descargarTexto`.

- [ ] **Step 1:** Implementa la página según §5.7:
  - por defecto muestra los cargos de hoy, con filtros por fechas, contrato, entidad, ejecutor y texto;
  - botón "Registrar cargo": formulario con todos los campos y adjunto del cargo sellado. El contrato es opcional; al elegirlo aparecen sus hitos, y al elegir un hito con pasos se puede elegir el paso. La fecha y la hora por defecto son las de ahora;
  - acciones Anular y Eliminar según permiso;
  - "Exportar CSV" de lo filtrado (`acrodocs_cargos_<desde>_<hasta>.csv`).
  
  En el contrato, la pestaña "Cargos" usa la misma lista filtrada por `tramiteId`.
- [ ] **Step 2:** Ejecuta `npm run build` y prueba en el navegador:
  - registrar un cargo vinculado al paso "Presentar solicitud" de la ampliación: el paso queda cumplido y la línea de tiempo muestra "Ver cargo";
  - el CSV abre bien en Excel, con los acentos correctos;
  - como residente, solo ve lo que le corresponde.
- [ ] **Step 3:** Commit: `feat: pantalla de mesa de partes y pestaña de cargos`.

### Task 14: Esquema, README y verificación final

**Files:**
- Modify: `schema.sql`, `README.md`

- [ ] **Step 1:** En `schema.sql`:
  - agrega las tablas `empresa`, `permisos_roles (rol, permiso)`, `usuario_contratos`, `movimientos` y `cargos`;
  - agrega `catalogo` como `jsonb` en `config`, `ejecutor jsonb` en `tramites` y `pasos jsonb` y `plazo_levantamiento jsonb` en `tramite_items`;
  - cambia el `check` de roles por las 9 claves nuevas.
  
  Solo es referencia para la etapa 2; no se conecta.
- [ ] **Step 2:** En `README.md` actualiza:
  - usuarios demo y roles;
  - flujo por pasos y la regla del silencio (no se aprueba solo);
  - mesa de partes;
  - catálogo;
  - consorcios;
  - la clave de almacenamiento `acrodocs_demo_v7` en "Reiniciar el demo";
  - `npm test`.
- [ ] **Step 3:** Ejecuta `npx vitest run` y `npm run build`. Esperado: todo PASS y build OK.
- [ ] **Step 4:** Verificación de migración en el navegador:
  - con los datos v6 del demo cargados (abrir la versión anterior desde el commit inicial con `git stash` o una copia de `dist`, o sembrar `acrodocs_demo_v6` con el respaldo JSON), abre la versión nueva;
  - los contratos, documentos (descargables) y estados siguen ahí, y `acrodocs_demo_v6` desaparece.
- [ ] **Step 5:** Commit: `docs: esquema y README para el flujo de trámite`.
