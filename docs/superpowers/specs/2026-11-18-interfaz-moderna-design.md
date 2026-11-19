# Interfaz moderna y adaptable (celular, tablet y PC)

Fecha: 2026-11-18 · Estado: **pendiente de aprobación** · Rama: `feature/flujo-tramite`

## Intención

Edson pidió "una interfaz más moderna y amigable" que "quede bien en celular, tablet y PC".
Todos los usuarios (dueño, jefes de proyecto, residentes, asistentes, finanzas y legal) abren AcroDocs
desde el celular para tres cosas: **actualizar documentos**, **verificar** (ver qué falta y qué vence)
y **hacer seguimiento** de los documentos. Por eso el celular es una pantalla principal, no un
caso secundario.

Hoy la interfaz parece un archivo técnico: esquinas casi cuadradas, letra de 10 a 13 px, etiquetas
en fuente monoespaciada y un menú lateral que en celular se vuelve una franja apretada. Botones de
20 a 26 px son difíciles de tocar, las tablas ocultan columnas a la fuerza y la ventana de un hito mide
920 px.

Edson eligió el estilo **C · cercano y colorido** (pasteles por tipo de dato, botones en píldora,
menú flotante) entre tres maquetas, y aprobó cómo se adapta a PC, tablet y celular.

## Metas

- Estilo C aplicado a todas las pantallas.
- Cada pantalla se usa cómodamente con el pulgar en un celular de unos 390 px de ancho.
- Subir un documento desde el celular en pocos toques, incluida la opción de **tomar una foto**.
- Tablet y PC aprovechan el ancho: menú lateral y varias columnas.

## No metas

- No cambia la lógica: trámites, hitos, pasos, permisos, plazos, alertas, consorcios, catálogo y datos.
- No se agregan funciones nuevas (por ejemplo, un estado "verificado" o aprobaciones). Si Edson lo
  necesita, es un trabajo aparte.
- No hay modo oscuro.
- No se sube un archivo desde el Panel sin abrir el hito (posible mejora posterior).

## Anti-metas (sería un fracaso aunque "se vea bien")

- Que la impresión de la ficha (`@media print`) deje de funcionar.
- Que una acción que hoy existe quede inalcanzable en celular (por ejemplo, cerrar sesión o Configuración).
- Que se rompa el modo nube (`CLOUD_SYNC`) o los permisos: la interfaz solo cambia la presentación.

## Restricciones

- Casi todo el estilo vive en `src/styles.css` (688 líneas) y hay muy pocos estilos en línea
  (unos 30 en total). Es la base del trabajo.
- Las pantallas son React con `react-router-dom`; no se agregan librerías de diseño.
- La rama tiene **26 archivos modificados sin commit** (incluidos `styles.css`, `Login.jsx`, `Tramites.jsx`,
  `Catalogo.jsx`). El rediseño se mezclaría con ese trabajo; conviene guardarlo antes en un commit.
- Pocas pruebas: `npx vitest run` y `npm run build` más una revisión visual en el navegador
  (Edson pidió no abusar de las pruebas). La interfaz no tiene pruebas automáticas.

## Enfoques considerados

- **A · Reestilizar lo existente, por fases (elegido).** Reescribir `styles.css` con el estilo C y
  ajustar el marcado solo donde el celular lo exige. Rápido, la lógica no se toca, riesgo bajo.
  Límite: la ficha del hito, muy cargada, puede necesitar reacomodar su estructura.
- **B · Reconstruir con componentes nuevos** (botón, tarjeta, lista adaptable, hoja). Más uniforme a
  futuro, pero reescribe unas 4.700 líneas sin pruebas de interfaz; mucho más lento y costoso.
- **Librería de diseño (Tailwind, MUI).** Descartada: obliga a reescribir todo, igual que B.

## Diseño

### Sistema visual

Variables CSS en `:root` (reemplazan las actuales; los nombres viejos pueden mantenerse como alias
mientras se migra):

| Elemento | Valor |
|---|---|
| Fondo de la página | crema `#fbf8f2` |
| Superficie (tarjetas, menú) | blanco |
| Color de marca / acción | verde azulado `#1c7a8a` (hover más oscuro) |
| Pasteles | azul `#d9eef4`, violeta `#e9e3f7`, ámbar `#fcecc4`, rojo `#fadcd6`, verde `#dcefe4` |
| Texto | tinta `#2a2f33`; secundario gris cálido |
| Radios | 12 px campos y controles, 18–20 px tarjetas, 999 px botones y chips |
| Sombras | suaves, `0 2px 8px rgba(80,60,30,.08)` |
| Letra | pila del sistema (Segoe UI / system-ui); base **15 px** (hoy 13,5); mínimo 12 px |
| Códigos | `CT-001` y similares siguen en monoespaciada; los chips dejan de serlo |
| Controles táctiles | altura mínima **44 px** en pantallas táctiles (`@media (pointer: coarse)`) |

Los pasteles se usan con significado: azul = contratos, violeta = hitos, ámbar = por vencer o
pendiente, rojo = vencido o alerta, verde = cargado o completo.

### Tamaños

- **Celular** (menos de 700 px): menú flotante abajo, una columna, tablas como tarjetas,
  ventanas a pantalla completa.
- **Tablet** (700 a 1099 px): menú lateral angosto solo con íconos, contenido en una o dos columnas.
- **PC** (1100 px o más): menú lateral con nombres y usuario, contenido en dos columnas, ancho
  máximo 1320 px como hoy.

Los cortes exactos pueden ajustarse al construir; lo importante es el comportamiento.

### Navegación (`App.jsx`)

- Íconos reales (SVG en línea, sin librería) para Panel, Contratos, Catálogo, Configuración y Salir;
  hoy `.nav-ico` es un cuadrito vacío.
- Celular: barra flotante inferior con Panel, Contratos, Catálogo y **Más**. "Más" abre una hoja con
  el usuario y su rol, Configuración (solo a quien tenga permiso, igual que hoy), Cerrar sesión y la
  etiqueta "Modo demo / Nube". Se oculta al imprimir.
- Tablet: riel lateral de íconos; el nombre aparece como `title`; abajo, avatar y salir.
- PC: menú lateral claro con nombres, avatar, rol y "Cerrar sesión".

### Pantallas

- **Ingreso:** tarjeta redondeada centrada, campos grandes; mismo contenido (incluida la lista de
  usuarios de demostración).
- **Panel:** saludo con el nombre ("Buenos días / tardes / noches, Edson"). Cuatro KPI en pasteles
  (2×2 en celular, 4 en una fila en PC). **"Alertas y vencimientos" pasa primero** (columna izquierda
  en PC, arriba en celular) porque el seguimiento es el uso principal; luego "Ficha de contratos" y
  "Avance de expedientes". En cada alerta el botón sigue diciendo **Abrir** y lleva al hito.
- **Contratos:** la tabla de 8 columnas se muestra como **tarjetas** por debajo de unos 900 px:
  código, denominación, entidad y monto, estado, ejecutor, barra de avance, fechas y un botón Abrir
  (toda la tarjeta es tocable). Requiere `data-label` en las celdas, como ya hace la tabla de
  usuarios. Filtros apilados: buscador a todo el ancho, selectores en dos columnas. En PC la tabla
  se conserva con el estilo nuevo.
- **Ficha del contrato:** encabezado compacto en celular; las pestañas (Expediente, Resumen, Trámites,
  Historial) en una sola fila desplazable, sin saltar de línea; etapas, secciones y hitos con filas de
  al menos 56 px, el código del hito en su propia línea.
- **Ventana del hito (`modal-tarea`) y demás modales:** en celular ocupan toda la pantalla, con la
  cabecera y el pie fijos; en PC siguen centradas. Los botones del pie envuelven y el de peligro va
  en su propia fila, como ya hace la regla actual.
- **Documentos del hito:** cada requisito es una tarjeta con su estado (verde "Cargado", ámbar
  "Pendiente") y dos botones grandes: **Subir archivo** y **Tomar foto**. "Tomar foto" es un segundo
  `<input type="file" accept="image/*" capture="environment">` que usa el mismo manejador
  `subirArchivo` y solo se muestra en pantallas táctiles. Aplica donde hoy se sube un archivo:
  requisitos, "Otros documentos" y los adjuntos de pasos y trámites (`LineaTiempo.jsx`, procedimiento).
  El botón sigue protegido por el mismo permiso (`permiso.subir`).
- **Catálogo y Configuración:** formularios en una columna, listas como tarjetas. La matriz de
  permisos se mantiene como tabla con desplazamiento horizontal y primera columna fija (ya existe).
  La tabla de usuarios sigue como tarjetas en celular, con el estilo nuevo.

### Fases (cada una deja el sistema funcionando)

1. **Base:** variables, letra, botones, formularios, tarjetas, chips, tablas, modales (`styles.css`).
2. **Menú e ingreso:** `App.jsx`, íconos, barra inferior, riel y menú lateral, hoja "Más"; `Login.jsx`.
3. **Panel y Contratos:** `Panel.jsx`, `Tramites.jsx` (tarjetas, filtros).
4. **Ficha del contrato y del hito:** `TramiteDetalle.jsx`, `LineaTiempo.jsx`; botón Tomar foto.
5. **Catálogo y Configuración:** `Catalogo.jsx`, `Configuracion.jsx`, `UsuariosPermisos.jsx`, `EditorPlantilla.jsx`.

## Verificación

- `npx vitest run` y `npm run build` sin errores tras cada fase.
- Revisión visual en el navegador a 390, 768 y 1280 px de ancho en: ingreso, Panel, Contratos, ficha
  con un hito abierto, Catálogo y Configuración; y vista de impresión de la ficha.

## Decisiones tomadas por el constructor (a confirmar al leer)

- Verde azulado `#1c7a8a` como color de marca (el actual `#1c5b73` queda como tono oscuro de hover).
- Íconos en SVG propios, sin librería.
- Alertas primero en el Panel, con saludo según la hora.
- Botón de alerta se queda en **Abrir** (la maqueta decía "Subir"; subir ocurre dentro del hito).
- Tomar foto solo en pantallas táctiles.
- Cortes de tamaño: 700 y 1100 px para el menú, unos 900 px para tablas a tarjetas.

## Pendiente de Edson

- ¿Guardar antes en un commit los 26 archivos sin commit de la rama?
