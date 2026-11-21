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

Los **asistentes** (técnico y administrativo) pueden subir documentos y registrar movimientos, pero **no pueden borrar** documentos, hitos ni contratos. Para corregir un archivo equivocado se sube una **nueva versión**: se agrega como un archivo adicional del mismo documento («versión 2», «versión 3»…) y el anterior se queda en la lista, sin reemplazarse ni ocultarse.

En el detalle de cada hito, la información está en **cuadros que se contraen y se expanden** (estado y responsable, norma y plazos, seguimiento por pasos, trámites, documentos requeridos, otros documentos y, al final, el catálogo con sus botones de editar y actualizar). El navegador recuerda cómo dejaste cada cuadro. La tarjeta de alertas del Panel también se contrae.

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

- **Hito de catálogo:** se crea solo en cada contrato nuevo, según el catálogo.
- **Hito recurrente:** se repite cada cierto tiempo: valorizaciones, informes mensuales, SCTR y renovaciones de carta fianza. Nace con el primer periodo (las renovaciones de carta fianza se configuran en el contrato) y los siguientes se agregan con **“+ Agregar valorización”**, **“+ Agregar informe”** o **“+ Agregar mes”**.
- **Hito eventual:** se agrega con **“+ Hito eventual”** cuando ocurre el hecho: cambio de personal clave, ampliación de plazo, adicional o deductivo, mayores metrados, consulta sobre incidencias, suspensión, intensificación del programa, paralización o sustitución del supervisor.
- **Hito opcional:** no se genera por defecto; se agrega con **“+ Hito opcional”** cuando se necesita, por ejemplo el registro del contrato en el SEACE.
- **Hito propio:** es solo de un contrato; se crea con **“+ Hito propio”** y no está en el catálogo. Con **“Convertir en catálogo”** se puede pasar al catálogo como hito de catálogo, eventual u opcional.

En el expediente, el filtro **Tipos de hito** muestra solo una clase. Si mejoras el detalle de un hito en un contrato, **“Actualizar catálogo con este hito”** lo copia a su plantilla para los contratos nuevos.

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
- Visor de archivos: el botón **Ver** (junto a «Descargar», con el permiso `descargar`) abre PDF e imágenes dentro de la app, con zoom, «Ajustar al ancho», pellizco y páginas; en celular ocupa toda la pantalla. El PDF se dibuja con pdf.js, que se descarga solo al abrir un PDF, y solo se dibujan las páginas visibles para no agotar la memoria (PDF de hasta 30 MB). Word, Excel y otros formatos no tienen vista previa: se descargan.

## Reiniciar el demo

Los datos locales están en `acrodocs_demo_v7`. Si venías de la versión anterior, se migran solos (contratos, hitos, documentos y estados se conservan) y se guarda una copia en `acrodocs_respaldo_v6`, que puedes descargar desde Configuración. Para dejar todo como nuevo, en la consola del navegador (F12):

```js
localStorage.removeItem("acrodocs_demo_v7");
indexedDB.deleteDatabase("acrodocs_archivos");
location.reload();
```

El demo incluye dos contratos (`DEMO-OC-2026-001` y `DEMO-CA-2026-002`), hitos recurrentes y un trámite eventual de cambio de personal.

## Despliegue con Vercel + Supabase (modo nube)

Sin configuración la app funciona en **modo local** (demo, datos en el navegador). Con las dos variables `VITE_` de abajo pasa a **modo nube**: ingreso real con Supabase Auth, datos compartidos entre dispositivos y permisos que hace cumplir la base de datos (RLS). Diseño: `docs/superpowers/specs/2026-11-20-supabase-fase1-design.md`.

### 1. Supabase

1. Crea el proyecto y aplica en orden `supabase/migrations/0001…0004` (SQL Editor o `apply_migration`). Crean las tablas (un documento por fila), las funciones `es_gerente`, `tiene_permiso` y `ve_contrato`, la matriz inicial de permisos y las reglas RLS.
2. `supabase/tests/rls_matriz.sql` comprueba la matriz rol × tabla con usuarios de prueba y se deshace sola (debe terminar en `RESULTADO: … 0 fallos`).
3. En **Authentication → Sign In / Providers** desactiva el registro público (los usuarios los crea el gerente).
4. Crea el primer gerente: **Authentication → Users → Add user** (correo y contraseña) y luego agrégale su perfil:
   ```sql
   insert into public.perfiles (id, nombre, email, rol)
   select id, 'Nombre del gerente', email, 'gerente' from auth.users where email = 'correo@del.gerente';
   ```

### 2. Variables de entorno (Vercel → Settings → Environment Variables)

| Variable | Valor | Dónde va |
|---|---|---|
| `VITE_SUPABASE_URL` | Project URL | navegador (pública) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | clave publicable (`sb_publishable_…`) | navegador (pública) |
| `SUPABASE_URL` | Project URL | solo servidor |
| `SUPABASE_SERVICE_ROLE_KEY` | clave de servicio | solo servidor; **nunca** con prefijo `VITE_` |

Para probar en local copia `.env.example` a `.env.local`. Las pruebas (`npx vitest run`) siempre corren en modo local.

### 3. Vercel

Framework **Vite**, build `npm run build`, salida `dist` (`vercel.json` ya trae los rewrites). `https://TU-DOMINIO.vercel.app/api/health` debe responder `ok: true`, `supabase: true` (servidor listo) y `nube: true` (páginas en modo nube).

### Cómo funciona

- Al entrar, `src/lib/nube.js` carga a memoria todo lo que el usuario puede ver, con la misma forma del estado local, y `store.js` sigue funcionando igual. Cada cambio se compara con la última copia del servidor y se envía solo lo que cambió (altas, cambios y bajas por `id`). Un fallo de guardado muestra un aviso con "Reintentar" y "Recargar datos". Al volver a la pestaña se traen los cambios de otros usuarios.
- Quién puede leer y escribir cada tabla lo decide la base: `ve_contrato` para leer y el permiso que corresponde para escribir. Las reglas finas dentro de una tabla (qué campo toca cada permiso) siguen en la app. Si dos personas editan la misma fila a la vez, gana la última.
- Los usuarios los crea el gerente desde Configuración (`api/usuarios.js`, única pieza que usa la clave de servicio). Reciben una contraseña temporal y deben cambiarla al entrar; si la olvidan, el gerente la restablece.
- **Los archivos adjuntos van a Google Drive** (sección siguiente). Sin las variables de Google, subir un archivo en modo nube avisa que Drive no está configurado.

## Archivos en Google Drive (Fase 2)

En modo nube, los documentos y las fotos de hitos, trámites y línea de tiempo se guardan en **tu Google Drive**, en `AcroDocs/{contrato}/{etapa}/{hito}/` (los que no tienen hito van a `AcroDocs/{contrato}/General/`). Supabase guarda solo los datos del documento y el identificador del archivo en Drive (`archivoId`). En modo local (sin variables de nube) todo sigue en IndexedDB.

- **Los usuarios de AcroDocs no entran a Drive.** El servidor (`api/archivos.js`) se conecta con tu cuenta y, antes de cada acción, comprueba con la sesión del usuario (reglas RLS de Supabase) que tenga el permiso (`subir`, `reemplazar`, `registrar` o `descargar`) y que vea el contrato del archivo. Un usuario sin acceso al contrato recibe un rechazo aunque conozca el identificador.
- **Subida:** el servidor crea la carpeta y una *sesión de subida reanudable* y el navegador sube **directo a Google** (Vercel limita las peticiones a 4,5 MB). Si el navegador no puede subir directo (red o CORS), la app sube por trozos de 3 MiB a través del servidor. Al terminar, el servidor confirma que el archivo llegó completo.
- **Descarga:** la sirve el servidor por trozos de 4 MiB (Vercel limita las respuestas a 4,5 MB) y la app los une. Hasta 30 MB por archivo.
- **Fotos:** al tomar o elegir una foto JPEG, el navegador la reduce a 1600 px y la guarda como JPEG antes de subirla (evita «Memoria insuficiente» en celulares modestos). Nunca pasa de **2 MB**: si aun así pesara más, baja la calidad y, si hace falta, el tamaño. Una foto que ya cabe en 2 MB no se toca.
- **Eliminar** manda el archivo a la **papelera de Drive** (se recupera durante 30 días).
- La conexión usa el alcance `drive.file`: AcroDocs solo ve lo que él mismo crea, nunca el resto de tu Drive. El espacio es el de tu cuenta (15 GB en un Gmail gratuito).

### Configurar Google (una sola vez, unos 15 minutos)

1. Entra a <https://console.cloud.google.com> con la cuenta de Gmail que guardará los archivos. **Crear proyecto** → nombre `AcroDocs`.
2. **APIs y servicios → Biblioteca** → busca **Google Drive API** → **Habilitar**.
3. **Google Auth Platform** (o **APIs y servicios → Pantalla de consentimiento de OAuth**) → **Comenzar**:
   - Nombre de la app `AcroDocs`; correo de asistencia y de contacto: el tuyo.
   - Público: **Externo**.
   - **Acceso a los datos → Agregar o quitar permisos** → marca `…/auth/drive.file` («Ver, editar, crear y borrar solo los archivos de Google Drive que utilizas con esta app») → Guardar.
   - **Información de la marca:** para poder publicar, Google exige nombre, correo de asistencia, correo de contacto, **página principal** y **política de privacidad**. Usa `https://acrodocs.vercel.app` y `https://acrodocs.vercel.app/privacidad.html` (la página está en `public/privacidad.html`; debe estar desplegada en producción) y agrega `acrodocs.vercel.app` en **Dominios autorizados**. Guarda.
   - **Público → Publicar la aplicación** → deja el estado en **En producción**. **Es obligatorio:** en modo «Prueba» el token caduca a los 7 días y los archivos dejarían de subirse. `drive.file` no es un permiso sensible, así que no pide revisión de Google.
4. **Clientes → Crear cliente** → tipo **Aplicación de escritorio** → nombre `AcroDocs servidor`. Deja abierta la ventana con el **ID de cliente** y el **secreto** (no los pegues en ningún chat).
5. En una terminal, dentro de esta carpeta:
   ```bash
   node scripts/google-token.mjs
   ```
   Pega el ID de cliente y el secreto, se abrirá el navegador: elige tu cuenta y acepta. Si Google avisa «no ha verificado esta aplicación», pulsa **Avanzado → Ir a AcroDocs**. La terminal muestra el `GOOGLE_REFRESH_TOKEN` (no se guarda en ningún archivo).
6. **Vercel → Settings → Environment Variables** (entorno de la rama `feature/nube`, o Production cuando se promueva). Crea las tres y marca **Sensitive**:

   | Variable | Valor |
   |---|---|
   | `GOOGLE_CLIENT_ID` | ID de cliente |
   | `GOOGLE_CLIENT_SECRET` | secreto del cliente |
   | `GOOGLE_REFRESH_TOKEN` | el token que mostró la terminal |

   Opcional: `GOOGLE_DRIVE_CARPETA_RAIZ` (por defecto `AcroDocs`). Después de cambiar variables hay que **redesplegar**.
7. Comprueba `https://TU-DOMINIO.vercel.app/api/health`: debe decir `drive: true`. Luego sube un archivo y una foto a un hito desde el celular y revisa que aparezcan en Drive en la carpeta correcta.

**Si dejan de subirse archivos** con «Google rechazó la conexión (invalid_grant)»: el permiso se revocó (por ejemplo, desde <https://myaccount.google.com/permissions>) o lleva más de 6 meses sin usarse. Repite el paso 5 y actualiza `GOOGLE_REFRESH_TOKEN`.

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
  lib/archivos.js            guardar, descargar y eliminar archivos (IndexedDB en local, Drive en la nube)
  lib/drive.js               cliente de /api/archivos: subida directa a Google, plan B por trozos, descarga por trozos
  lib/imagen.js              reduce las fotos del celular (≤ 1600 px, JPEG) antes de subirlas
  lib/visor.js               qué visor usa cada archivo, tope de píxeles por página y estado del visor abierto
  lib/lienzo.js              motor del visor: páginas con zoom, pellizco y dibujo perezoso
  lib/pdfRender.js           pdf.js (import() dinámico); fuentes y .wasm de pdf.js se sirven desde /pdfjs/ (vite.config.js)
  lib/supabase.js            cliente de Supabase y bandera de modo nube
  lib/nube.js                carga, diferencias por id, guardado y alta de usuarios en la nube
  components/                línea de tiempo, usuarios y permisos, editor de plantilla, historial, visor de archivos
  pages/                     Login, Panel, Tramites, TramiteDetalle, Catalogo, Configuracion
api/                         health, usuarios y archivos (funciones serverless de Vercel); _drive.js es el cliente de Drive
scripts/google-token.mjs     obtiene el token de actualización de Google (se usa una sola vez)
supabase/                    migraciones SQL (esquema, RLS) y prueba de la matriz de permisos
docs/superpowers/            diseño y plan de implementación
schema.sql                   esquema relacional anterior (referencia; no se usa)
vercel.json                  build, output y rewrites para Vercel
.env.example                 variables de entorno de ejemplo
iniciar-demo.bat             lanzador local
```

## Nota sobre plazos

Los plazos del catálogo son configurables. Los pasos con plazo de la Ley 32069 ya vienen marcados como **verificados** (perfeccionamiento, consultas, ampliación y adicionales); los demás siguen “por verificar” y deben validarse contra el Reglamento y los procedimientos de cada entidad antes de producción. El plazo de 10 días hábiles para presentar la solicitud de ampliación de plazo, contado desde el fin de la causal, es dato de la empresa. Los feriados se configuran en **Configuración** y se usan para calcular los plazos en días hábiles.
