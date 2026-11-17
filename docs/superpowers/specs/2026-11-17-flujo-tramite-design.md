# AcroDocs — Flujo de trámite, roles, catálogo completo, consorcios y mesa de partes

Fecha: 2026-11-17 · Estado: borrador para aprobación

## 1. Intención

AcroDocs lo usa una **empresa contratista mediana** (obras y consultorías de obra, algunas en consorcio) para controlar sus expedientes ante la **supervisión** y la **entidad**. Hoy cada hito tiene un solo estado y una sola fecha límite, y el sistema no ve que **cada paso de un trámite abre un plazo nuevo**. Casos reales que motivan el cambio:

1. **Ampliación de plazo:** se anotó en el cuaderno de obra el inicio y el fin de la causal, pero se pasaron los 10 días hábiles para presentar la solicitud. Nadie avisó.
2. **Ampliación de plazo:** la entidad se pasó de su plazo para pronunciarse y no se detectó a tiempo para hacerlo valer.
3. **Mesa de partes diaria:** a diario se presentan documentos en la municipalidad y otras oficinas, y hay que registrar el número y la fecha de recepción (el cargo).

El sistema lo usan el dueño, sus socios, el jefe de proyectos, residentes, asistentes técnicos y administrativos, contabilidad y el asesor legal. Varias personas tocan el mismo expediente, así que hacen falta permisos y trazabilidad.

## 2. Objetivos, no objetivos y anti-objetivos

**Objetivos**
- Trámites como **secuencia de pasos** con responsable (contratista, supervisión o entidad) y plazo propio, encadenados a la fecha real del paso anterior.
- **Alertas** antes de que venza un plazo propio y cuando venza el plazo de la otra parte, incluido el aviso de posible silencio positivo.
- **Registro de cargos** (mesa de partes) general, ligado a contrato y paso cuando corresponda.
- **9 roles** con matriz de permisos editable. Los asistentes no pueden borrar.
- **Catálogo completo editable** (etapas, hitos, documentos, plazos y pasos), no solo los hitos agregados.
- Contratos ejecutados por la **empresa** o por un **consorcio**.
- Trazabilidad: quién borró, corrigió o cambió el catálogo o los permisos.

**No objetivos (en esta etapa)**
- Servidor, base de datos compartida y login real. Se hace después (etapa 2, Supabase).
- Notificaciones por correo o WhatsApp.
- Firma digital, OCR de cargos y multiempresa (varias contratistas en una instalación).

**Anti-objetivos (sería un fracaso aunque funcione)**
- Que el sistema avise con un **plazo legal equivocado** sin que el usuario lo sepa. Todo plazo legal es editable, muestra su norma, y los plazos no verificados se marcan como tales.
- Que un asistente pueda **perder documentos** borrándolos o reemplazándolos sin dejar rastro.
- Romper los expedientes que ya existen en el navegador del usuario.

## 3. Restricciones

- **Primero local** (opción elegida): todo sigue en localStorage e IndexedDB, como hoy. Los datos nuevos deben tener **forma de tablas** (listas planas con `id` y claves foráneas) para migrar directo a Supabase en la etapa 2.
- Los permisos en local son de interfaz más chequeo en `store.js`. No son seguridad real hasta la etapa 2, y eso se acepta.
- Mantener todo lo que ya funciona: generación de hitos, recurrentes, fianzas, SCTR, ZIP, impresión, feriados.
- Interfaz en español, con el lenguaje visual actual (archivo técnico de obra).
- Migración automática del almacenamiento v6 a v7 sin pérdida de datos.

## 4. Enfoques considerados

| Enfoque | A favor | En contra |
|---|---|---|
| **A. Local primero, servidor después** (elegido) | Se prueba rápido con casos reales; los pasos y plazos se corrigen antes de fijar la base de datos | Mientras sea local, un solo navegador y permisos solo de pantalla |
| B. Servidor desde ya (Supabase) | Multiusuario y permisos reales desde el día 1 | Mucho más tiempo hasta algo usable; el modelo de flujo se fijaría en la BD antes de validarlo |

El usuario eligió **A**.

## 5. Diseño

### 5.1 Roles y permisos

**Claves de permiso:**

| Grupo | Clave | Significado |
|---|---|---|
| Contratos | `ver_todos` | Ver todos los contratos (si no lo tiene, solo los asignados) |
| | `crear` | Crear contratos |
| | `editar` | Editar datos del contrato |
| | `eliminar` | Eliminar contratos |
| Hitos | `estado` | Cambiar estado de hitos |
| | `agregar` | Agregar hitos y trámites eventuales |
| | `plazos` | Modificar plazos y fechas límite |
| | `borrar_hito` | Eliminar hitos |
| Documentos | `subir` | Subir documentos |
| | `descargar` | Descargar documentos y ZIP |
| | `reemplazar` | Subir nueva versión de un documento (la anterior se conserva) |
| | `borrar_doc` | Eliminar documentos |
| Seguimiento | `registrar` | Registrar movimientos y cargos |
| | `corregir` | Corregir o anular movimientos y cargos |
| | `alertas` | Ver alertas de vencimiento en el Panel |
| Administración | `catalogo` | Editar el catálogo completo |
| | `feriados` | Configurar feriados |
| | `usuarios` | Gestionar usuarios y permisos |
| | `respaldo` | Descargar respaldo completo |

**Matriz inicial (decidida por el usuario):**

| Rol (clave) | Permisos |
|---|---|
| Gerente general `gerente` | Todos. No editable. |
| Socio `socio` | Todos. |
| Jefe de proyectos `jefe` | ver_todos, crear, editar, estado, agregar, plazos, subir, descargar, reemplazar, registrar, corregir, alertas, catalogo |
| Residente o ingeniero de campo `residente` | estado, subir, descargar, registrar, alertas (**solo contratos asignados**) |
| Asistente técnico `asis_tec` | ver_todos, estado, subir, descargar, registrar, alertas |
| Asistente administrativo `asis_adm` | ver_todos, estado, subir, descargar, registrar, alertas |
| Contabilidad y finanzas `finanzas` | ver_todos, subir, descargar, registrar, alertas |
| Asesor legal `legal` | ver_todos, subir, descargar, registrar, alertas |
| Solo consulta `consulta` | ver_todos, descargar |

**Reglas:**
- La matriz se guarda en datos (`permisosRoles`) y se edita en **Configuración → Usuarios y permisos** (permiso `usuarios`). La fila del gerente es de solo lectura.
- **Usuarios** (`usuarios`): nombre, correo, rol, contratos asignados (para roles sin `ver_todos`) y activo. En local, contraseña demo por usuario.
- **Protección del gerente:** nadie, ni un socio, puede desactivar, cambiar de rol ni editar a un usuario `gerente`. Debe existir siempre al menos un gerente activo.
- Un único helper `puede(session, permiso, tramiteId?)` en `store.js`. Lo usan la interfaz (ocultar o deshabilitar) y las funciones del store (rechazar con error). Sin `ver_todos`, solo se ven los contratos asignados (listados, Panel, mesa de partes).
- **Migración de roles antiguos:** admin → gerente, logistica → asis_adm, area_usuaria → asis_tec, legal → legal, lectura → consulta.
- **Versiones de documentos:** "reemplazar" guarda el archivo nuevo y mueve el anterior a `versiones` del mismo documento. Las versiones se ven y descargan desde la ficha. Solo `borrar_doc` elimina, y eso queda en el historial.

### 5.2 Historial (auditoría)

Lista `historial`: `{id, fecha (ISO con hora), usuario, accion, objeto, objetoId, tramiteId?, detalle}`. Se registra:
- eliminaciones (contrato, hito, documento, cargo);
- correcciones y anulaciones de movimientos;
- cambios de catálogo, permisos y usuarios;
- reemplazo de documentos.

Se ve en la ficha del contrato (pestaña Historial) y en Configuración (cambios de catálogo y permisos).

### 5.3 Ejecutor: empresa o consorcio

- **Configuración → Empresa:** razón social y RUC de la empresa propia.
- Cada contrato tiene `ejecutor`:
  - `{tipo: "empresa"}`; o
  - `{tipo: "consorcio", nombre, ruc, representante, integrantes: [{razonSocial, ruc, participacion}]}`.
- Se reemplaza el campo libre `contratista`. En la migración, los contratos existentes quedan como `consorcio` si su texto empieza con "Consorcio" (ese texto pasa a ser su nombre); el resto queda como `empresa`.
- Los listados de contratos y la mesa de partes se filtran por ejecutor. Las participaciones deben sumar 100 %, con un aviso si no.

### 5.4 Catálogo completo editable

- Las constantes `OBRA`, `CONSULTORIA`, `EVENTUALES` y los opcionales de `catalogo.js` pasan a ser **solo la semilla**. Al iniciar v7 se copian a `catalogo` en los datos, y desde ahí se genera todo.
- `catalogoHitos` y `plantillasDocs` se **funden** en `catalogo` durante la migración. Dejan de existir como estructuras separadas.
- Nueva pantalla **Catálogo** en la barra lateral (visible con `catalogo`; para los demás, solo lectura). Pestañas Obra, Consultoría, Trámites eventuales y Opcionales.
  - Árbol etapas → secciones → hitos, con subir/bajar y numeración recalculada.
  - Por hito: nombre, documentos requeridos, documento de cumplimiento, plazo (días, base, hábiles o calendario), norma, nota, activo, y **pasos** (5.5).
  - Por sección recurrente: frecuencia, día límite, solo primer periodo.
  - Agregar y quitar etapas, secciones y hitos. Desactivar es preferible a quitar.
  - "Restaurar catálogo original" (con confirmación), por hito y global.
- Los cambios aplican **solo a contratos nuevos**. Los existentes conservan lo suyo, como hoy. El botón actual "Convertir en catálogo" y la edición de ficha desde el modal escriben en `catalogo`.
- Cada plazo tiene la marca `verificado`. Mientras no esté verificado, el catálogo y la ficha muestran "plazo por verificar".

### 5.5 Flujo de trámite (pasos y movimientos)

**Definición en el catálogo:** cualquier hito o trámite eventual puede tener `pasos`:

```text
paso = {
  clave, nombre,
  responsable: "contratista" | "supervision" | "entidad",
  tipoRegistro: "asiento" | "presentacion" | "respuesta" | "otro",
  plazoDias, habiles, desde: clave de paso (por defecto el anterior),
  alertas: [5, 3, 1],               // días antes del vencimiento
  alVencer: "aviso" | "silencio_positivo",
  verificado: false
}
```

Un hito **sin pasos** funciona como hoy, con una sola fecha límite y el estado manual.

**En el contrato:** al crear el hito, se copian sus pasos (`item.pasos`). Los hechos se registran como **movimientos** en la lista plana `movimientos`:

```text
{ id, tramiteId, itemId, pasoClave, ciclo,
  tipo: "asiento" | "presentado" | "observado" | "levantado" | "conformidad" | "pronunciamiento" | "otro",
  fecha, hora?, numeroDocumento?, asientoCO?, cargoId?, archivoId?, nota,
  usuario, registrado, anulado?, anuladoPor?, motivoAnulacion? }
```

**Reglas del flujo:**
- Un paso se **cumple** con su primer movimiento válido. El **plazo del siguiente** = fecha de ese movimiento (o del paso `desde`) + `plazoDias`, en hábiles o calendario, con los feriados.
- **Paso actual** = el primer paso no cumplido. La `fecha_limite` del hito = la fecha límite del paso actual, de modo que el Panel y los filtros existentes siguen funcionando.
- El **estado se deriva**:

  | Situación | Estado |
  |---|---|
  | Paso actual del contratista | Pendiente |
  | Paso actual de supervisión o entidad | En revisión, con "A cargo de: Supervisión/Entidad" |
  | Último movimiento "observado" | Observado |
  | Todos los pasos cumplidos | Completado |

  "No aplica" sigue siendo manual.
- **Ciclo de observaciones:** si la supervisión o la entidad registran `observado`, se abre un paso temporal "Levantar observaciones" a cargo del contratista (plazo configurable por hito; si no hay, sin plazo). Al registrar `levantado`, se vuelve a abrir el paso revisor con su plazo contado desde el levantamiento. Cada vuelta incrementa `ciclo` y queda visible ("Observación 2").
- **Corregir o anular** un movimiento (permiso `corregir`) nunca lo borra: lo marca anulado con su motivo, se recalcula el flujo y queda en el historial.
- La **ficha del hito** muestra la línea de tiempo: pasos con ✔, ● o ○, la fecha límite, quién está a cargo, los días restantes y el botón "Registrar" en el paso actual (con `registrar`).

**Secuencias iniciales de la semilla** (los plazos marcados como *por verificar* los confirma el usuario contra el Reglamento de la Ley 32069 antes de usarlos):

| Trámite | Pasos |
|---|---|
| Ampliación de plazo (obra y consultoría) | Asiento inicio de causal (contratista, asiento, sin plazo) → Asiento fin de causal (contratista, asiento, sin plazo) → Presentar solicitud (contratista, **10 d.h. desde fin de causal**, dato del usuario) → Informe de la supervisión (supervisión, *por verificar*) → Pronunciamiento de la entidad (entidad, *por verificar*, `silencio_positivo`) |
| Presupuesto adicional / deductivo | Asiento de necesidad → Presentar expediente → Pronunciamiento de la supervisión → Resolución de la entidad (plazos *por verificar*) |
| Cambio de personal clave | Presentar solicitud → Pronunciamiento de la entidad (*por verificar*, con el silencio que indique la norma) |
| Valorización (recurrente) | Presentar a la supervisión → Conformidad de la supervisión → Aprobación y pago de la entidad (*por verificar*) |
| Informe mensual (recurrente) | Presentar → Conformidad (*por verificar*) |

Mientras un plazo no tenga días definidos, el paso muestra "plazo sin definir" y **no genera alerta de vencimiento**, aunque sí aparece como "pendiente de definir plazo" en el Panel para el rol con `catalogo`.

### 5.6 Alertas (Panel)

Se calculan en el momento, sin servicio en segundo plano, solo para roles con `alertas` y solo sobre los contratos visibles. Hay tres grupos:
1. **Te toca:** pasos del contratista que vencen dentro de su ventana de `alertas` (por ejemplo 5, 3 y 1 días) o ya vencidos.
2. **Plazo vencido de la otra parte:** paso de la supervisión o la entidad vencido sin movimiento. Si `alVencer = silencio_positivo`, el texto es "Posible aprobación por silencio: la entidad no se pronunció; plazo vencido el dd/mm (hace N días)".
3. **Hitos sin pasos** con fecha límite (comportamiento actual).

Cada alerta enlaza a la ficha del hito.

### 5.7 Mesa de partes (cargos)

Lista plana `cargos`:

```text
{ id, fecha, hora, entidad, oficina, numeroRegistro, asunto,
  tipoDocumento: "carta" | "oficio" | "solicitud" | "informe" | "otro", numeroDocumento,
  emisor: "empresa" | id del contrato en consorcio, presentadoPor,
  tramiteId?, itemId?, pasoClave?, archivoCargoId?, registradoPor, registrado, anulado? }
```

- Nueva pantalla **Mesa de partes** en la barra lateral:
  - por defecto muestra los cargos de **hoy**;
  - filtros por rango de fechas, contrato, entidad, ejecutor y texto;
  - botón "Registrar cargo" con adjunto del cargo sellado (IndexedDB, como los demás archivos).
- **Vínculo:** contrato e hito opcionales; si se elige un hito con pasos, se puede elegir el paso. Al guardar, se crea el movimiento `presentado` en ese paso con la fecha de recepción del cargo (y `cargoId`), lo que avanza el flujo.
- En la ficha del contrato, la pestaña **Cargos** muestra solo los suyos.
- Registrar requiere `registrar`. Anular requiere `corregir` y nunca borra. La eliminación definitiva requiere `borrar_doc` y queda en el historial.
- Exportar la lista filtrada a CSV.

### 5.8 Datos y migración

- La clave del almacenamiento pasa a `acrodocs_demo_v7`, con `version: 7`. Se agrega `"acrodocs_demo_v6"` a la migración: se leen los datos v6, se transforman (roles, ejecutor, catálogo fusionado y `pasos` vacíos para los hitos existentes) y se conservan **todos** los contratos, hitos y documentos.
- Los hitos existentes **no reciben pasos retroactivamente**. Solo los trámites y contratos nuevos los tienen, además de la acción "Activar seguimiento por pasos" en la ficha de un hito existente (copia los pasos del catálogo vigente).
- Nuevas listas planas en los datos: `usuarios`, `permisosRoles`, `catalogo`, `movimientos`, `cargos`, `historial` y `empresa`. Todas usan `id` y referencias por id para mapear 1:1 a tablas en la etapa 2.
- `schema.sql` se actualiza con las tablas nuevas, como referencia para la etapa 2 (sin conexión todavía).
- Antes de migrar se ofrece descargar el respaldo JSON.

### 5.9 Reglas precisas del flujo (decisiones tomadas en el diseño, marcadas *[criterio de Claude]*)

1. **Plazo del primer paso** *[criterio de Claude]*: si el hito ya tenía plazo propio (`plazoDias`/`plazoBase`, o `diaLimite` en los recurrentes como valorización o informe), ese es el plazo del **primer paso**. Así las valorizaciones e informes siguen alertando como hoy. Si no tenía, el primer paso queda sin plazo.
2. **Paso que nunca ocurre** *[criterio de Claude]*: `desde` puede apuntar a **cualquier paso anterior**, no solo al inmediato. Si el paso referido aún no tiene movimiento, el plazo se cuenta desde su **fecha de vencimiento**. Ejemplo: si la supervisión no emite su informe, el plazo de la entidad corre igual desde el vencimiento del plazo de la supervisión. Así el caso 2 siempre se detecta. En la semilla de la ampliación de plazo, el plazo de la entidad se configura así, y el usuario puede cambiarlo en el catálogo al verificar la norma.
3. **Registro fuera de orden** *[criterio de Claude]*: se puede registrar un movimiento en un paso posterior al actual. Los pasos saltados quedan como "sin respuesta" (no cumplidos, pero cerrados) y se ven así en la línea de tiempo.
4. **Observaciones** *[criterio de Claude]*: el paso revisor (supervisión o entidad) puede registrar `observado` sobre la presentación del contratista. `levantado` devuelve el flujo **al paso que observó**, no al primero. `ciclo` se cuenta **por hito**.
5. **Controles de estado en hitos con pasos** *[criterio de Claude]*: en un hito con pasos, el estado se deriva. El desplegable manual solo ofrece "No aplica" o "Reabrir", con permiso `estado`. Subir el documento de cumplimiento **no** completa el hito; lo completa el último paso. En hitos sin pasos todo sigue como hoy.
6. **Visibilidad de la mesa de partes** *[criterio de Claude]*: los roles con `ver_todos` ven todos los cargos. Los roles sin `ver_todos` ven los cargos de sus contratos asignados y los que registraron ellos mismos. `consulta` ve todo, en solo lectura.
7. **Más de un archivo en el mismo documento** *[criterio de Claude]*: agregar otro archivo a un documento que ya tiene uno es **subir** (permiso `subir`). El anterior queda intacto, así que nada se pierde. **Reemplazar** (permiso `reemplazar`) marca el nuevo como versión vigente y pasa el anterior a `versiones`.

8. **Vencimiento con silencio positivo** *(decisión del usuario)*: el sistema **no** aprueba nada solo. Cuando vence un paso con `alVencer = silencio_positivo`, el paso sigue a cargo de la entidad (estado "En revisión") y el Panel y la ficha muestran la alerta "Posible aprobación por silencio" con la fecha de vencimiento. En la ficha aparece el botón **"Registrar aprobación por silencio"** (permiso `registrar`, con confirmación). Al pulsarlo se crea un movimiento `pronunciamiento` con la nota "Aprobado por silencio positivo", fechado el día siguiente al vencimiento, y el hito se completa. Si la entidad responde tarde, su respuesta igual se registra como movimiento y queda en la línea de tiempo.

## 6. Orden de construcción

1. Roles, permisos, usuarios e historial.
2. Ejecutor y consorcios.
3. Catálogo completo editable (incluye la definición de pasos).
4. Flujo: movimientos, estado derivado, observaciones y línea de tiempo.
5. Alertas en el Panel.
6. Mesa de partes.

Cada parte deja la app funcionando y se prueba en el navegador antes de seguir.

## 7. Queda a criterio del constructor

- División en componentes (en particular, partir `TramiteDetalle.jsx`, de 1.427 líneas) y estructura de archivos.
- Diseño visual detallado dentro del lenguaje actual.
- Unificar las funciones de fechas duplicadas en un solo módulo.
- Pruebas automáticas: se recomienda agregar Vitest al menos para el cálculo de plazos (hábiles, feriados, encadenamiento y ciclos de observación).
- Inicializar git antes de empezar.
