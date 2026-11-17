# AcroDocs — Expediente documentario por contrato (React)

Control documentario para una **empresa contratista** de obra y consultoría de obra bajo la Ley 32069: el expediente de cada contrato, el seguimiento de cada trámite ante la **supervisión** y la **entidad**, y el registro de los cargos de mesa de partes.

Cada contrato genera un **expediente jerárquico**: etapas, secciones, hitos numerados y documentos adjuntos por hito. Los trámites que pasan por varias manos (ampliación de plazo, adicionales, cambio de personal, valorizaciones) se siguen **paso a paso**, cada paso con su plazo y su responsable.

La interfaz usa un lenguaje de **archivo técnico de obra**: papel de expediente, tinta de plano, reglas y sellos.

## Inicio rápido

1. Ejecuta `iniciar-demo.bat` (doble clic).
2. Espera a que abra `http://localhost:5173`.
3. Ingresa con `gerente@acrodocs.local` / `gerente123`.

También puedes iniciar manualmente:

```bash
npm install
npm run dev
```

Pruebas y compilación:

```bash
npm test
npm run build
```

> Todo se guarda en el navegador (localStorage e IndexedDB). Es la etapa 1: sirve para probar el flujo con casos reales. La etapa 2 pasa a un servidor (Supabase) para que varias personas lo usen a la vez; ver más abajo.

## Usuarios y roles

Hay nueve roles. La matriz de permisos se edita en **Configuración → Usuarios y permisos** (permiso `usuarios`). El gerente general no se puede limitar, y nadie puede desactivarlo ni cambiar su rol; siempre debe haber un gerente activo.

| Correo | Contraseña | Rol |
|---|---|---|
| `gerente@acrodocs.local` | `gerente123` | Gerente general (dueño) |
| `socio@acrodocs.local` | `socio123` | Socio |
| `jefe@acrodocs.local` | `jefe123` | Jefe de proyectos |
| `residente@acrodocs.local` | `residente123` | Residente (solo los contratos asignados) |
| `tecnico@acrodocs.local` | `tecnico123` | Asistente técnico |
| `administrativo@acrodocs.local` | `administrativo123` | Asistente administrativo |
| `finanzas@acrodocs.local` | `finanzas123` | Contabilidad y finanzas |
| `legal@acrodocs.local` | `legal123` | Asesor legal |
| `consulta@acrodocs.local` | `consulta123` | Solo consulta |

Los **asistentes** (técnico y administrativo) pueden subir documentos y registrar movimientos, pero **no pueden borrar** documentos, hitos ni contratos. Para corregir un archivo equivocado se sube una **nueva versión**: la anterior se conserva y se puede descargar.

Los permisos son: ver todos los contratos, crear, editar y eliminar contratos, cambiar estado de hitos, agregar hitos y trámites, modificar plazos, eliminar hitos, subir, descargar, reemplazar y eliminar documentos, registrar y corregir movimientos, recibir alertas, editar el catálogo, configurar feriados, gestionar usuarios y descargar respaldos. Los de eliminar aparecen en rojo en la matriz.

Cada eliminación, anulación, reemplazo y cambio de catálogo, permisos o usuarios queda en el **Historial** (del contrato y de Configuración), con quién y cuándo.

## Modelo del expediente

La numeración es jerárquica y se conserva en todo el sistema:

```text
1 OBRA
  1.1 CONTRATO Y EXPEDIENTE
    1.1.1 PERFECCIONAMIENTO
    1.1.2 GARANTÍA DE FIEL CUMPLIMIENTO
  1.2 INICIO Y ASEGURAMIENTO
    1.2.10.1 RENOVACIÓN DE CARTA FIANZA 1
    1.2.11.1 SCTR MENSUAL 01 — JUNIO 2026
  1.3 EJECUCIÓN DE OBRA
    1.3.2.1 VALORIZACIÓN 01 — JUNIO 2026
    1.3.3.1 INFORME MENSUAL DE AVANCE 01 — JUNIO 2026
  1.4 MODIFICACIONES Y AMPLIACIONES
    1.4.1 CAMBIO DE PERSONAL CLAVE (eventual)
    1.4.2 AMPLIACIÓN DE PLAZO (eventual)
  1.5 RECEPCIÓN Y LIQUIDACIÓN
```

Para consultoría se usa la serie `2.x` y el trámite eventual se numera en `2.5.x`.

### Tipos de hito

- **Fijo:** se crea automáticamente al registrar el contrato.
- **Recurrente:** una fila por mes o por año (SCTR, valorizaciones, informes, renovación de carta fianza). El SCTR se crea con el mes de inicio; los siguientes se agregan desde el expediente.
- **Opcional:** no se genera por defecto; se agrega con **“+ Hito opcional”**.
- **Eventual:** se agrega con **“+ Nuevo trámite”** cuando ocurre el hecho: cambio de personal clave, ampliación de plazo, adicional o deductivo, paralización, sustitución del supervisor.
- **Propio:** hito manual para casos no previstos.

Cada hito tiene estado, responsable, fecha de presentación y límite, plazo, norma, documentos requeridos y archivos cargados.

## Contratos en consorcio

Cada contrato indica quién lo ejecuta: **la empresa** o **un consorcio** (nombre, RUC, representante e integrantes con su porcentaje de participación; avisa si no suman 100 %). Los listados se filtran por ejecutor. La razón social y el RUC de la empresa se configuran en **Configuración → Empresa**.

## Seguimiento por pasos

Un trámite con pasos se sigue como una secuencia, por ejemplo la ampliación de plazo:

```text
✔ Asiento de inicio de la causal          CO · 03/11/2026
✔ Asiento de fin de la causal             CO · 10/11/2026
● Presentar la solicitud                  vence 24/11/2026 (10 días hábiles desde el fin de la causal)
○ Informe de la supervisión               plazo por definir
○ Pronunciamiento de la entidad           plazo por definir · posible silencio positivo
```

- Cada paso tiene un **responsable** (contratista, supervisión o entidad), un plazo en días hábiles o calendario y las **alertas** (por ejemplo 5, 3 y 1 días antes).
- Cada movimiento que registras (asiento del cuaderno, presentación, conformidad, pronunciamiento, observación) lleva fecha, número de documento y, si quieres, el archivo. La fecha del movimiento **arranca el plazo del paso siguiente**.
- Si la supervisión o la entidad no actúan, el plazo del paso siguiente corre desde el **vencimiento** del anterior, así el atraso se detecta igual.
- **Observaciones:** el revisor puede observar; el contratista las levanta (con su propio plazo) y el trámite vuelve al paso que observó. Se cuenta cada ronda.
- **Se puede registrar un paso fuera de orden**; los pasos saltados quedan “sin respuesta”.
- **Anular** un movimiento nunca lo borra: queda tachado con su motivo, el flujo se recalcula y se anota en el historial.
- El **estado del hito lo determinan los pasos**. Solo se puede dar por “No aplica” o reabrir.
- **Silencio positivo:** si vence el plazo de la entidad para pronunciarse, el sistema **solo avisa** (“Posible aprobación por silencio”, con la fecha). Tú decides y pulsas **“Registrar aprobación por silencio”**; si la entidad responde tarde, su respuesta igual se registra.

Los hitos que ya existían no reciben pasos solos: en su ficha aparece **“Activar seguimiento por pasos”** cuando el catálogo define pasos para ellos.

### Alertas del Panel

Se calculan al abrir el Panel, solo para los roles con el permiso de alertas y solo sobre los contratos que el usuario ve:

- **Te toca:** pasos del contratista que vencen dentro de su ventana de aviso o ya vencieron.
- **Plazo vencido de la otra parte:** pasos de la supervisión o la entidad vencidos sin respuesta (con el aviso de posible silencio positivo).
- **Otros hitos:** hitos sin pasos con una sola fecha límite.
- **Plazos por definir:** pasos de la otra parte sin plazo (solo para quien edita el catálogo). **Un paso sin plazo no genera alertas de vencimiento.**

## Mesa de partes

Pantalla **Mesa de partes** con el registro de cargos: fecha y hora de recepción, entidad, oficina, **número de registro**, tipo y número de documento, asunto, emisor (empresa o consorcio), quién lo presentó y el cargo sellado escaneado.

- Por defecto muestra los cargos **de hoy**; filtra por fechas, contrato, entidad, emisor y texto, y **exporta a CSV** (separador `;`, abre bien en Excel).
- Un cargo puede ir ligado a un **contrato**, a un **hito** y a un **paso**. Al elegir el paso, la fecha de recepción cuenta como la presentación: crea el movimiento y arranca el plazo de la otra parte.
- Cada contrato tiene su pestaña **Cargos**.
- Anular un cargo anula también su movimiento. Eliminarlo definitivamente exige el permiso de eliminar documentos.
- Quien no ve todos los contratos (el residente) ve los cargos de sus contratos y los que registró él mismo.

## Catálogo completo

La pantalla **Catálogo** muestra todo lo que se genera en los contratos nuevos: etapas, secciones, hitos, trámites eventuales y hitos opcionales. Quien tiene el permiso de editar el catálogo puede:

- cambiar nombres, **documentos requeridos**, documento de cumplimiento, plazos (días, desde cuándo, hábiles o calendario), norma y nota;
- definir los **pasos** de cada trámite y el plazo para levantar observaciones;
- agregar, quitar, desactivar y reordenar (subir/bajar renumera los hitos de esa sección);
- marcar cada plazo como **verificado** contra la norma (mientras no lo esté, se muestra “plazo por verificar”);
- **restaurar** un elemento, o todo el catálogo, a su versión original.

Los cambios se guardan con un solo botón y se aplican **solo a los contratos nuevos**; los existentes conservan lo suyo.

## Otras funciones

- Panel con KPIs, alertas por paso, avance por contrato y requisitos sin archivo.
- Expediente jerárquico con filtros por etapa, estado, búsqueda y requisitos pendientes.
- Cartas fianza y SCTR configurables por contrato.
- Feriados configurables para el cálculo de plazos en días hábiles.
- Descarga de archivos por hito, del expediente completo y de todo en un ZIP; respaldo JSON desde Configuración (solo con permiso).
- Impresión del expediente desde el navegador.

## Reiniciar el demo

Los datos locales están en `acrodocs_demo_v7`. Si venías de la versión anterior, se migran solos (contratos, hitos, documentos y estados se conservan) y se guarda una copia en `acrodocs_respaldo_v6`, que puedes descargar desde Configuración. Para dejar todo como nuevo, en la consola del navegador (F12):

```js
localStorage.removeItem("acrodocs_demo_v7");
indexedDB.deleteDatabase("acrodocs_archivos");
location.reload();
```

El demo incluye dos contratos (`DEMO-OC-2026-001` y `DEMO-CA-2026-002`), hitos recurrentes y un trámite eventual de cambio de personal.

## Etapa 2: pasar a PostgreSQL / Supabase

`schema.sql` describe el modelo completo (usuarios, permisos por rol, contratos con su ejecutor, hitos con sus pasos, movimientos, cargos, historial, adjuntos con versiones). Todavía **no está conectado a la app**.

1. Crea un proyecto en Supabase y ejecuta `schema.sql`.
2. Crea el bucket `adjuntos` en Supabase Storage.
3. Copia `.env.example` a `.env.local` y completa las variables.
4. Reemplaza la capa local (`src/lib/store.js` y `src/lib/archivos.js`) por consultas a las tablas y al bucket, con inicio de sesión real y políticas RLS por rol. Hoy los permisos se aplican en la interfaz y en el almacén local; con servidor los hará cumplir la base de datos.

> Las funciones de `api/` (Vercel) son del esquema anterior y no están conectadas al frontend; no las despliegues tal como están (usan la clave de servicio sin autenticar al usuario).

## Estructura

```text
src/
  App.jsx                    rutas, sesión y navegación
  lib/fechas.js              cálculo de días hábiles y fechas
  lib/permisos.js            roles, permisos y matriz inicial
  lib/flujo.js               motor de pasos: plazos, observaciones, estado
  lib/pasosSemilla.js        secuencias iniciales de cada trámite
  lib/catalogo.js            catálogo (semilla y generación de hitos)
  lib/cargos.js              visibilidad y CSV de la mesa de partes
  lib/migracion.js           migración de v6 a v7
  lib/store.js               persistencia local, permisos, historial, movimientos, cargos, alertas
  lib/archivos.js            IndexedDB: guardar, descargar y eliminar archivos
  components/                línea de tiempo, usuarios y permisos, cargos, editor de plantilla, historial
  pages/                     Login, Panel, Tramites, TramiteDetalle, Catalogo, MesaPartes, Configuracion
docs/superpowers/            diseño y plan de implementación
schema.sql                   esquema PostgreSQL/Supabase (etapa 2)
iniciar-demo.bat             lanzador local
```

## Nota sobre plazos

Los plazos del catálogo son referenciales y configurables. **Los de la supervisión y la entidad vienen sin definir** (o marcados “por verificar”): antes de usar el sistema en producción hay que validarlos contra la Ley 32069, su Reglamento y los procedimientos de cada entidad, y marcarlos como verificados en el Catálogo. El plazo de 10 días hábiles para presentar la solicitud de ampliación de plazo, contado desde el fin de la causal, es dato de la empresa. Los feriados se configuran en **Configuración** y se usan para calcular los plazos en días hábiles.
