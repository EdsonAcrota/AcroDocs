# AcroDocs — Expediente documentario por contrato (React)

Control documentario para una **empresa contratista** bajo la Ley 32069: el expediente de cada **contrato** (obra, consultoría de obra, servicio o bien) y el seguimiento de cada **trámite** como flujo completo de un documento hasta el cumplimiento del hito.

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

- **Hito de catálogo (fijo o recurrente):** se crea automáticamente al registrar el contrato. Los recurrentes generan una fila por mes o por año (SCTR, valorizaciones, informes, renovación de carta fianza).
- **Hito opcional:** no se genera por defecto; se agrega con **“+ Hito opcional”**.
- **Hito eventual:** se agrega con **“+ Hito eventual”** cuando ocurre el hecho: cambio de personal clave, ampliación de plazo, adicional o deductivo, mayores metrados, consulta sobre incidencias, suspensión, intensificación del programa, paralización o sustitución del supervisor.
- **Hito propio:** hito manual para casos no previstos.

Cada hito tiene estado, responsable, fecha de presentación y límite, plazo, norma, documentos requeridos y archivos cargados. Para contratos de **Servicio** o **Bien**, mientras no haya catálogos propios, el sistema usa el catálogo de Obra como base.

El **perfeccionamiento de contrato** sigue los requisitos del **art. 88 del Reglamento**, tomados de las bases integradas: garantías, contrato de consorcio, CCI o cuenta en el exterior, vigencia de poder y DNI, institución arbitral, notificaciones por correo, CCLC del RNP (obra), plan de trabajo, análisis de precios y gastos generales, capacidad técnica y profesional del personal clave, centro de administración de JPRD y declaración jurada de desafectación. La presentación es de **8 o 5 días hábiles**, según corresponda.

### Trámite

- **Trámite:** no es un hito. Es **todo el flujo de un documento** hasta obtener el cumplimiento del hito. Se crea con **“+ Nuevo trámite”**, muestra automáticamente la entidad y la obra del contrato y permite elegir el hito objetivo.
- **Movimientos:** cada avance del flujo (asiento, presentación, observación, conformidad, pronunciamiento), con fecha, hora, número de registro de la oficina de la entidad, oficina, número de documento, nota, usuario, dependencias y archivo. El registro de un movimiento se hace con **“Registrar trámite”**.
- No hay secciones separadas de cargos ni de documentos internos: esos datos son parte de los movimientos del trámite.

Desde la ficha de un hito se ven sus trámites y se abre cualquiera de ellos; desde el trámite se vuelve al hito.

Siguiendo las buenas prácticas documentales, cada trámite lleva **número correlativo** (`TR-AÑO-0001`), **estados normalizados** (Borrador → Visado → Por despacho → Enviado → Recibido → En atención → Atendido → Archivado), **prioridad** (Normal, Urgente, Muy urgente), **trazabilidad** con usuario, fecha, origen y destino en cada movimiento, y se **archiva automáticamente** cuando el hito se completa. La entidad, la obra, el hito y el asunto se llenan solos para reducir la captura manual.

### Hitos eventuales y base legal (Ley 32069 y su Reglamento)

Los hitos eventuales disponibles en el catálogo para **Obra** son:

| Hito eventual | Base legal | Plazos principales que sigue el flujo |
|---|---|---|
| Consulta sobre incidencias en obra | Art. 190 | Supervisor 5 días; proyectista 10 días si corresponde; entidad 5 días. Sin respuesta no se aprueba la consulta: solo habilita sustentar ampliación de plazo. |
| Cambio de personal clave | Art. 189 | Se solicita 10 días hábiles antes; la entidad se pronuncia en 5 días hábiles; silencio positivo. |
| Ampliación de plazo | Arts. 198 y 200 | Contratista 10 días hábiles; supervisor 5 días hábiles; entidad 10 días hábiles; silencio positivo. |
| Presupuesto adicional de obra | Arts. 191, 194 y 195 | Expediente 15 días; supervisor 5 días; entidad 12 días hábiles en solo construcción y 10 en diseño y construcción. |
| Mayores metrados | Art. 197 | Se anotan en el cuaderno de incidencias, los autoriza el supervisor y se pagan en la valorización. |
| Suspensión de plazo | Art. 202 | Se anota, se acuerda y se reinicia con programa actualizado. |
| Intensificación del programa | Arts. 191 y 192 | Requiere sustento del área usuaria, acuerdo de las partes y resolución. |
| Paralización de obra | Arts. 202 y 107 | Se documenta en el cuaderno de incidencias. |
| Sustitución del supervisor | Ley 32069 y Reglamento | Según lo previsto en el contrato. |

Los trámites del **proceso de selección** que aparecen en las bases integradas —consultas y observaciones a las bases, absolución y elevación al OECE— son anteriores al contrato y no se gestionan en este expediente. De las bases revisadas se verificó, por ejemplo, que en la **Licitación Pública de Obras** las consultas se presentan en un plazo no menor de **7 días hábiles** desde la convocatoria, y en el **Concurso Público Abreviado para Consultoría de Obra** en un plazo no menor de **3 días hábiles**.

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

## Catálogo completo

La pantalla **Catálogo** muestra todo lo que se genera en los contratos nuevos: etapas, secciones, hitos, hitos eventuales y hitos opcionales. Quien tiene el permiso de editar el catálogo puede:

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

## Despliegue con Vercel + Supabase

La app sigue funcionando en local sin configuración. Para desplegarla en modo nube:

### 1. Supabase

1. Crea un proyecto en [Supabase](https://supabase.com).
2. Abre **SQL Editor** y ejecuta todo `schema.sql`. Ese archivo crea las tablas del modelo (`tramites`, `tramite_items`, `procedimientos`, `movimientos`, `historial`, adjuntos, usuarios, permisos…), la tabla `app_states`, el bucket `adjuntos` y las políticas del service role.
3. En **Project Settings → API** copia:
   - `Project URL`
   - `anon key`
   - `service_role key` (solo servidor; **nunca** la pongas en variables `VITE_*`).

### 2. Variables de entorno

En Vercel (**Settings → Environment Variables**) configura:

| Variable | Valor |
|---|---|
| `SUPABASE_URL` | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key |
| `VITE_SUPABASE_URL` | Project URL |
| `VITE_SUPABASE_ANON_KEY` | anon key |
| `APP_KEY` | Un secreto largo y aleatorio |
| `VITE_APP_KEY` | El **mismo** secreto que `APP_KEY` |
| `VITE_CLOUD_SYNC` | `true` |

Para probar en local, copia `.env.example` a `.env.local` con los mismos valores.

### 3. Vercel

1. Sube el proyecto a GitHub/GitLab/Bitbucket.
2. En Vercel: **Add New → Project** y selecciona el repositorio.
3. Framework: **Vite**. Build: `npm run build`. Output: `dist`. `vercel.json` ya incluye los rewrites para React Router.
4. Deploy.

Verifica `https://TU-DOMINIO.vercel.app/api/health`: debe responder `ok: true`, `supabase: true` y `sync: true`.

### Cómo funciona la sincronización

- Con `VITE_CLOUD_SYNC=true`, al abrir la app se descarga el estado desde `/api/state` y se coloca en `localStorage` antes de renderizar.
- Cada cambio guarda el estado local y, con un pequeño retardo, lo envía a `app_states` mediante `/api/state` (usa `APP_KEY` como secreto compartido).
- Las APIs usan el **service role** de Supabase; la clave nunca llega al navegador.
- Los archivos adjuntos siguen en IndexedDB por ahora. `/api/files` ya permite subir/descargar al bucket `adjuntos` y servirá para migrarlos después.
- El inicio de sesión y los roles siguen siendo locales; Supabase Auth no está integrado todavía.

> Para un despliegue multiusuario real, el siguiente paso es sustituir la sesión local por Supabase Auth y reflejar los roles en RLS. La app ya tiene las tablas `usuarios` y `permisos_roles` preparadas.

## Estructura

```text
src/
  App.jsx                    rutas, sesión y navegación
  lib/fechas.js              cálculo de días hábiles y fechas
  lib/permisos.js            roles, permisos y matriz inicial
  lib/flujo.js               motor de pasos: plazos, observaciones, estado
  lib/pasosSemilla.js        secuencias iniciales de cada trámite
  lib/catalogo.js            catálogo (semilla y generación de hitos)
  lib/cargos.js              tipos de documento del flujo (para movimientos)
  lib/migracion.js           migración de v6 a v7
  lib/store.js               persistencia local, permisos, historial, trámites, movimientos, alertas
  lib/archivos.js            IndexedDB: guardar, descargar y eliminar archivos
  lib/cloud.js               sincronización opcional con Supabase (VITE_CLOUD_SYNC)
  components/                línea de tiempo, usuarios y permisos, editor de plantilla, historial
  pages/                     Login, Panel, Tramites, TramiteDetalle, Catalogo, Configuracion
api/                         health, state y files (funciones serverless de Vercel)
docs/superpowers/            diseño y plan de implementación
schema.sql                   esquema PostgreSQL/Supabase (incluye app_states y bucket)
vercel.json                  build, output y rewrites para Vercel
.env.example                 variables de entorno de ejemplo
iniciar-demo.bat             lanzador local
```

## Nota sobre plazos

Los plazos del catálogo son configurables. Los pasos con plazo de la Ley 32069 ya vienen marcados como **verificados** (perfeccionamiento, consultas, ampliación y adicionales); los demás siguen “por verificar” y deben validarse contra el Reglamento y los procedimientos de cada entidad antes de producción. El plazo de 10 días hábiles para presentar la solicitud de ampliación de plazo, contado desde el fin de la causal, es dato de la empresa. Los feriados se configuran en **Configuración** y se usan para calcular los plazos en días hábiles.
