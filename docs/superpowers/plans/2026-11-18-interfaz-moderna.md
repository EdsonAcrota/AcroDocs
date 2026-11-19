# Interfaz moderna y adaptable — Plan de implementación

> **Para quien ejecute:** usar `superpowers:executing-plans`, todo en la sesión, **sin subagentes y sin revisión por tarea** (Edson lo pidió así). Los pasos usan casillas `- [ ]`.

**Meta:** aplicar el estilo C (cercano y colorido) a todas las pantallas de AcroDocs y dejarlas cómodas en celular, tablet y PC, con botones de subir archivo y tomar foto en los documentos del hito.

**Arquitectura:** se reescribe `src/styles.css` con variables nuevas y se ajusta el marcado solo donde el celular lo exige (menú, tablas a tarjetas, ventanas a pantalla completa). Se crean dos piezas compartidas: `Iconos.jsx` (SVG en línea) y `SubirArchivo.jsx`. La lógica de trámites, permisos y datos no se toca.

**Tecnología:** React 18, `react-router-dom` 6, Vite 5, Vitest 2 (jsdom). Sin librerías nuevas.

**Spec:** `docs/superpowers/specs/2026-11-18-interfaz-moderna-design.md`

## Restricciones globales

- Colores: fondo `#fbf8f2`, superficie blanca, marca `#1c7a8a` (el actual `#1c5b73` queda como tono de hover), pasteles azul `#d9eef4`, violeta `#e9e3f7`, ámbar `#fcecc4`, rojo `#fadcd6`, verde `#dcefe4`, texto `#2a2f33`.
- Radios: 12 px campos y controles, 18–20 px tarjetas, 999 px botones y chips. Sombra `0 2px 8px rgba(80,60,30,.08)`.
- Letra: pila del sistema, base **15 px**, mínimo 12 px. Los códigos (`CT-001`) siguen en monoespaciada; los chips ya no.
- Pantallas táctiles (`@media (pointer: coarse)`): controles de al menos **44 px** de alto y campos con **16 px** de letra (evita el zoom automático de iOS).
- Cortes: menú inferior bajo 700 px, riel de íconos de 700 a 1099 px, menú lateral completo desde 1100 px; tablas a tarjetas bajo 900 px.
- Sin modo oscuro, sin funciones nuevas, sin cambiar rutas, permisos ni datos. La impresión de la ficha (`@media print`) debe seguir igual.
- Todo texto visible en español. No hacer `git commit` hasta que Edson lo pida; los pasos de commit de abajo solo se ejecutan con su visto bueno.
- Pruebas: una por comportamiento clave (aquí solo `saludoPorHora`). La interfaz se verifica con `npm run build` y revisión en el navegador.

## Enfoque de revisión

Cinco fallos que el diseño sugiere y ninguna prueba automática cubre; cada uno tiene su verificación en la tarea que lo posee:

1. Un rol **sin permiso `subir`** no debe ver "Subir archivo" ni "Tomar foto" (Tarea 5).
2. Un rol **sin permiso de configuración** no debe ver Configuración en la barra ni en "Más" (Tarea 3).
3. **Textos largos** (denominación, ejecutor, nombre de archivo) no deben generar desplazamiento horizontal de la página a 360 px (Tareas 4 a 6).
4. La **barra inferior y el pie fijo** de las ventanas no deben tapar el último contenido ni los botones (Tareas 3 y 5).
5. **Imprimir** la ficha no debe mostrar la barra inferior ni la hoja "Más" (Tarea 7).

---

### Tarea 1: Saludo según la hora

**Archivos:**
- Modificar: `src/lib/fechas.js`
- Probar: `src/lib/fechas.test.js`

**Interfaces:**
- Produce: `export const saludoPorHora = (hora: number): string` en `fechas.js`. De 5 a 11 devuelve `"Buenos días"`, de 12 a 18 `"Buenas tardes"`, el resto (19 a 23 y 0 a 4) `"Buenas noches"`. La Tarea 4 lo usa en el Panel.

- [ ] **Paso 1: escribir la prueba que falla** en `fechas.test.js` (importar `saludoPorHora`):

```js
it("saludoPorHora: días de 5 a 11, tardes de 12 a 18, noches el resto", () => {
  expect(saludoPorHora(5)).toBe("Buenos días");
  expect(saludoPorHora(11)).toBe("Buenos días");
  expect(saludoPorHora(12)).toBe("Buenas tardes");
  expect(saludoPorHora(18)).toBe("Buenas tardes");
  expect(saludoPorHora(19)).toBe("Buenas noches");
  expect(saludoPorHora(4)).toBe("Buenas noches");
});
```

- [ ] **Paso 2: ejecutar** `npx vitest run src/lib/fechas.test.js`. Esperado: falla porque `saludoPorHora` no existe.
- [ ] **Paso 3: implementar** `saludoPorHora` en `src/lib/fechas.js` con las reglas de arriba.
- [ ] **Paso 4: ejecutar** `npx vitest run`. Esperado: todas las pruebas pasan.
- [ ] **Paso 5: commit (con permiso):** `git add src/lib/fechas.js src/lib/fechas.test.js` y `git commit -m "feat: saludo según la hora"`.

---

### Tarea 2: Base de estilos (fase 1)

**Archivos:**
- Modificar: `src/styles.css`, `src/components/UsuariosPermisos.jsx` (solo la clase de la tabla).

**Interfaces:**
- Produce: variables `--radio-campo: 12px`, `--radio-tarjeta: 20px`, `--radio-pill: 999px`; clases de color `.kpi.azul|violeta|ambar|rojo` (fondo pastel); clase genérica `.tabla-tarjetas` (tabla que pasa a tarjetas bajo 900 px: la primera celda es el encabezado sin etiqueta, la última son las acciones sin etiqueta, las demás muestran `data-label`); clase `.solo-tactil` (oculta salvo en `pointer: coarse`). Las tareas 3 a 6 las usan. Los nombres de variables actuales (`--blue`, `--sheet`, `--paper`, `--ink`...) se conservan con los valores nuevos para no romper reglas existentes.

- [ ] **Paso 1: valores base.** Reemplazar el bloque `:root` con los colores y radios de las restricciones globales; `body` a 15 px con la pila `system-ui, "Segoe UI", sans-serif`, fondo crema; los títulos usan la misma pila en peso 600 (se elimina `Bahnschrift`).
- [ ] **Paso 2: componentes.** Reestilizar con los radios y sombras globales: `.tarjeta`, `.tarjeta-cab`, `.btn` (píldora; `.primario` en verde azulado), `.btn.mini`, `input/select/textarea` (radio 12, foco con anillo verde azulado), `.badge` (píldora, sin monoespaciada), `.kpis` y `.kpi` (tarjetas separadas con fondo pastel por clase de color, ícono como círculo blanco), `.barra` y `.barra-fill` (píldora con degradado `#1c7a8a` a `#4fb3a5`), `.tabla`, `.tabs`, `.modal` y su cabecera y pie (radio 20), `.alerta`, `.exito`, `.nota-info`. Quitar los bordes izquierdos gruesos y las reglas de 2–3 px de radio.
- [ ] **Paso 3: táctil.** Dentro de `@media (pointer: coarse)`: `.btn`, `.btn.mini`, `.btn-icono`, `.orden-hito`, `.tabs button`, `select` e `input` con alto mínimo de 44 px; `input, select, textarea` con 16 px de letra. Agregar `.solo-tactil { display: none }` y su excepción dentro de ese mismo bloque (`display: inline-flex`).
- [ ] **Paso 4: tablas a tarjetas.** Convertir las reglas móviles de `.tabla-usuarios` (bajo 560 px) en reglas genéricas de `.tabla.tabla-tarjetas` bajo **900 px**, con primera y última celda sin etiqueta. Quitar la regla que oculta las columnas 4 y 5 de cualquier tabla. En `UsuariosPermisos.jsx` agregar `tabla-tarjetas` junto a `tabla-usuarios` en el `<table>`.
- [ ] **Paso 5: verificar.** `npm run build` termina sin errores. Con `npm run dev` abrir `http://localhost:5173` a 1280 px y comprobar que Panel, Contratos y la tabla de usuarios (Configuración) se ven con el estilo nuevo y siguen legibles. Aún no se espera el menú nuevo.
- [ ] **Paso 6: commit (con permiso):** `git add src/styles.css src/components/UsuariosPermisos.jsx` y `git commit -m "style: base visual del estilo cercano y colorido"`.

---

### Tarea 3: Menú e ingreso (fase 2)

**Archivos:**
- Crear: `src/components/Iconos.jsx`
- Modificar: `src/App.jsx`, `src/styles.css`, `index.html`, `src/pages/Login.jsx` (solo si el marcado lo exige)

**Interfaces:**
- Produce: `export default function Icono({ nombre, tam = 20 })` en `Iconos.jsx`; `nombre` es `"panel" | "contratos" | "catalogo" | "configuracion" | "salir" | "mas"`; devuelve un `<svg aria-hidden="true">` de trazo (`stroke="currentColor"`) y `null` si el nombre no existe.
- Consume: clases de la Tarea 2.

- [ ] **Paso 1: crear `Iconos.jsx`** con los seis íconos como SVG de trazo de 24×24.
- [ ] **Paso 2: marcado de `App.jsx`.** Mantener `<aside className="sidebar">` (la regla de impresión ya lo oculta). Cada `NavLink` lleva `title`, `<Icono />` y `<span className="nav-texto">`. Agregar el estado `masAbierto` (se cierra al cambiar de ruta) y un botón "Más" (`.nav-mas`, solo visible bajo 700 px). El pie (usuario, rol, "Cerrar sesión" con ícono, etiqueta Demo/Nube) pasa a ser la hoja `.sidebar-pie` con la clase `abierto` cuando `masAbierto` es verdadero. Repetir el enlace a Configuración dentro del pie (`.mas-config`, solo visible bajo 700 px), con la misma condición `verConfiguracion`; el enlace de la barra se oculta bajo 700 px.
- [ ] **Paso 3: reglas de tamaño en `styles.css`.** Desde 1100 px: menú lateral blanco de 232 px, activo con fondo verde azulado. De 700 a 1099 px: riel de 76 px solo con íconos (ocultar `.nav-texto`, `.usuario-datos`, `.marca-sub` y el nombre `.logo`). Bajo 700 px: el aside es una barra flotante fija (`left/right: 10px`, `bottom: calc(10px + env(safe-area-inset-bottom))`, radio 24, sombra) con Panel, Contratos, Catálogo y Más; el pie se muestra como hoja inferior sobre un fondo atenuado cuando está `abierto`; `.contenido` suma `padding-bottom: calc(96px + env(safe-area-inset-bottom))`.
- [ ] **Paso 4: `index.html`.** Cambiar la etiqueta viewport a `width=device-width, initial-scale=1.0, viewport-fit=cover`.
- [ ] **Paso 5: ingreso.** Tarjeta redondeada (radio 24), campos y botón grandes, usuarios de demostración como botones de al menos 44 px; mismo contenido y mismos textos.
- [ ] **Paso 6: verificar.** `npm run build` sin errores. En el navegador: a 390 px aparece la barra inferior y "Más" abre la hoja con usuario, rol y Cerrar sesión; a 768 px el riel de íconos; a 1280 px el menú con nombres. **Revisión 2:** iniciar sesión con un rol sin permisos de configuración (ver `src/lib/permisos.js`) y confirmar que Configuración no aparece ni en la barra ni en "Más". **Revisión 4:** a 390 px el último elemento de cada página queda visible por encima de la barra.
- [ ] **Paso 7: commit (con permiso):** `git add src/components/Iconos.jsx src/App.jsx src/styles.css index.html src/pages/Login.jsx` y `git commit -m "feat: menú inferior, riel y menú lateral adaptables"`.

---

### Tarea 4: Panel y Contratos (fase 3)

**Archivos:**
- Modificar: `src/pages/Panel.jsx`, `src/pages/Tramites.jsx`, `src/styles.css`

**Interfaces:**
- Consume: `saludoPorHora` (Tarea 1), `getSession` de `src/lib/store.js`, `.kpi.<color>` y `.tabla-tarjetas` (Tarea 2).

- [ ] **Paso 1: Panel.** Saludo en el encabezado: `` `${saludoPorHora(new Date().getHours())}, ${primerNombre}` `` con el primer nombre de `getSession().nombre`; la línea de apoyo pasa a "Esto es lo que necesita tu atención hoy". Poner la clase de color en cada `.kpi` (`azul`, `violeta`, `ambar`, `rojo`, en este orden). Si `verAlertas`, la tarjeta "Alertas y vencimientos" va **antes** de "Ficha de contratos" dentro de `.grid-2`. Los botones de alerta siguen diciendo "Abrir".
- [ ] **Paso 2: Contratos.** El `<table>` pasa a `className="tabla tabla-tarjetas"`; cada `<td>` intermedio lleva `data-label` ("Objeto", "Ejecutor", "Expediente", "Ejecución", "Estado"); la primera celda (código y denominación) y la última (botón Abrir) quedan sin etiqueta. Los filtros se apilan bajo 700 px: buscador a todo el ancho y selectores en dos columnas.
- [ ] **Paso 3: tarjeta tocable.** Bajo 900 px la tarjeta de cada contrato muestra la barra de avance y el botón Abrir a todo el ancho de la tarjeta, con al menos 44 px de alto.
- [ ] **Paso 4: verificar.** `npm run build`. En el navegador, Panel a 390, 768 y 1280 px (KPI 2×2 en celular y 4 en una fila en PC) y Contratos como tarjetas a 390 y como tabla a 1280. **Revisión 3:** a 360 px `document.documentElement.scrollWidth <= window.innerWidth` es verdadero en ambas pantallas, también con una denominación de más de 80 caracteres.
- [ ] **Paso 5: commit (con permiso):** `git add src/pages/Panel.jsx src/pages/Tramites.jsx src/styles.css` y `git commit -m "feat: Panel y Contratos adaptables"`.

---

### Tarea 5: Ficha del contrato, hito y subida de archivos (fase 4)

**Archivos:**
- Crear: `src/components/SubirArchivo.jsx`
- Modificar: `src/pages/TramiteDetalle.jsx` (zonas de requisitos ~1441 y de otros documentos ~1484, formulario de trámite ~1715), `src/components/LineaTiempo.jsx` (~224), `src/styles.css`

**Interfaces:**
- Produce en `SubirArchivo.jsx`:
  - `export function TomarFoto({ onChange, disabled })`: `<label className="btn mini subir-archivo subir-foto solo-tactil">Tomar foto<input type="file" hidden accept="image/*" capture="environment" … /></label>`.
  - `export default function SubirArchivo({ etiqueta, ocupado, onChange, camara = true })`: la etiqueta "Subir archivo" existente más, si `camara`, un `TomarFoto` con el mismo `onChange` y `disabled={ocupado}`. `onChange` recibe el evento del input sin transformarlo, de modo que sirve `subirArchivo(e, req)`.

- [ ] **Paso 1: crear `SubirArchivo.jsx`** con esas dos exportaciones; las clases `.subir-archivo` y `.deshabilitado` se reutilizan tal como están.
- [ ] **Paso 2: usarlo en los documentos del hito.** En requisitos y en "Otros documentos" reemplazar el `<label …><input type="file" hidden …/></label>` por `<SubirArchivo etiqueta={…} ocupado={Boolean(subiendo)} onChange={(e) => subirArchivo(e, req)} />` (`"Otros"` en el segundo). Conservar el `permiso.subir` que lo envuelve y los textos "Subiendo…", "+ Agregar otro archivo", "Subir archivo" y "+ Subir otro documento". "Nueva versión" no se toca.
- [ ] **Paso 3: adjuntos de pasos y trámites.** En `LineaTiempo.jsx` y en el formulario de trámite (`setProcArchivo`) se deja el `<input type="file">` visible y se agrega a su lado `<TomarFoto onChange={mismoManejador} />`.
- [ ] **Paso 4: ficha.** Encabezado compacto bajo 700 px (botones de `.encabezado-acciones` en dos columnas); `.tabs` en una sola fila desplazable (`flex-wrap: nowrap; overflow-x: auto`, botones `flex: none`); filas de hito (`.tarea-fila`) de al menos 56 px; `.requisito` como tarjeta con estado ("Cargado" verde, "Pendiente" ámbar) y los botones de subida en dos columnas de 44 px.
- [ ] **Paso 5: ventanas a pantalla completa bajo 700 px.** `.modal-fondo` sin relleno; `.modal` con `width: 100%`, `min-height: 100dvh`, sin radio, en columna; `.modal-cuerpo` con `flex: 1; overflow-y: auto`; `.modal-pie` fijo abajo (`position: sticky; bottom: 0`) con `padding-bottom: calc(12px + env(safe-area-inset-bottom))`. Desde 700 px siguen centradas.
- [ ] **Paso 6: verificar.** `npm run build`. Abrir un contrato y un hito a 390 px: pestañas desplazables, ventana completa, botones "Subir archivo" y "Tomar foto" (este último solo con emulación táctil; confirmar que a 1280 px sin táctil no aparece). Subir un archivo de prueba desde "Subir archivo" y ver que sigue cargándose. **Revisión 1:** con un rol sin `subir` no aparece ninguno de los dos botones. **Revisión 4:** con un campo enfocado, el pie de la ventana sigue visible. **Revisión 3:** sin desplazamiento horizontal de la página a 360 px, con un nombre de archivo largo.
- [ ] **Paso 7: commit (con permiso):** `git add src/components/SubirArchivo.jsx src/pages/TramiteDetalle.jsx src/components/LineaTiempo.jsx src/styles.css` y `git commit -m "feat: ficha adaptable y botón Tomar foto"`.

---

### Tarea 6: Catálogo y Configuración (fase 5)

**Archivos:**
- Modificar: `src/pages/Catalogo.jsx`, `src/pages/Configuracion.jsx`, `src/components/UsuariosPermisos.jsx`, `src/components/EditorPlantilla.jsx`, `src/styles.css`

- [ ] **Paso 1: formularios.** `.grid-form` y `.grid-2` pasan a una columna bajo 700 px; filas de formularios en línea (`.agregar-documento`, `.form-feriado`, `.checklist-add`) apiladas con campos a todo el ancho; listas del catálogo (`.catalogo-hito-fila`, `.feriado-fila`) como tarjetas con el estilo nuevo.
- [ ] **Paso 2: usuarios y permisos.** La tabla de usuarios mantiene su vista de tarjetas con la regla genérica (Tarea 2). La matriz de permisos (`.matriz-wrap`) se desplaza horizontalmente **dentro de su tarjeta** con la primera columna fija, sin desplazar la página.
- [ ] **Paso 3: verificar.** `npm run build`. Revisar Catálogo y Configuración (todas sus secciones) a 390, 768 y 1280 px. **Revisión 3:** sin desplazamiento horizontal de la página a 360 px, incluida la matriz.
- [ ] **Paso 4: commit (con permiso):** `git add src/pages/Catalogo.jsx src/pages/Configuracion.jsx src/components/UsuariosPermisos.jsx src/components/EditorPlantilla.jsx src/styles.css` y `git commit -m "feat: Catálogo y Configuración adaptables"`.

---

### Tarea 7: Verificación final

**Archivos:** ninguno nuevo (correcciones solo si algo falla).

- [ ] **Paso 1:** `npx vitest run`. Esperado: todas las pruebas pasan.
- [ ] **Paso 2:** `npm run build`. Esperado: termina con "built in".
- [ ] **Paso 3:** recorrido visual a 390, 768 y 1280 px: ingreso, Panel, Contratos, ficha con un hito abierto, Catálogo y Configuración. Cada pantalla sin desplazamiento horizontal de la página y sin texto cortado.
- [ ] **Paso 4: Revisión 5.** Imprimir (`Ctrl+P`) la ficha de un contrato: sin barra inferior, sin hoja "Más" y con el diseño de impresión de siempre.
- [ ] **Paso 5:** informar a Edson qué quedó verificado y qué no (por ejemplo, la cámara real solo se prueba en un teléfono), y preguntarle si quiere guardar los cambios en commits.
