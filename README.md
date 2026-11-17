# AcroDocs — Expediente documentario por contrato (React)

Demo funcional para el seguimiento documentario de contrataciones de obra y consultoría de obra bajo la Ley 32069. Cada contrato genera un **expediente jerárquico**: etapas, secciones, hitos numerados y documentos adjuntos por hito.

La interfaz usa un lenguaje de **archivo técnico de obra**: papel de expediente, tinta de plano, reglas y sellos. La numeración jerárquica es la estructura principal, no un adorno.

## Inicio rápido

1. Ejecuta `iniciar-demo.bat` (doble clic).
2. Espera a que abra `http://localhost:5173`.
3. Ingresa con `admin@acrodocs.local` / `admin123`.

También puedes iniciar manualmente:

```bash
npm install
npm run dev
```

Compilar para producción:

```bash
npm run build
```

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
- **Recurrente:** se genera una fila por mes o por año (SCTR, valorizaciones, informes, renovación de carta fianza). El SCTR se crea solo con el mes de inicio; los meses siguientes se agregan desde el expediente.
- **Opcional:** no se genera por defecto. Se agrega con **“+ Hito opcional”** (por ejemplo, registro en el SEACE).
- **Eventual:** no se crea solo. Se agrega con **“+ Nuevo trámite”** cuando ocurre el hecho: cambio de personal clave, ampliación de plazo, presupuesto adicional/deductivo, paralización, sustitución de supervisor, etc.
- **Propio:** hito manual para casos no previstos en el catálogo.

Cada hito tiene:

- estado, responsable, fecha de presentación y fecha límite;
- plazo en días hábiles o calendario y norma de referencia;
- lista de documentos requeridos;
- archivos cargados, con descarga y eliminación;
- observaciones y sustento.

Los archivos se guardan en **IndexedDB** y sus metadatos en el expediente local. En producción se reemplazan por Supabase Storage manteniendo los mismos campos.

## Funcionalidad del demo

- Login con roles: administrador, logística, área usuaria, asesoría legal y solo lectura.
- Panel con KPIs, alertas de vencimiento, avance por contrato y requisitos sin archivo.
- Registro de contratos de obra y consultoría.
- Generación automática de todos los hitos fijos y recurrentes.
- Expediente jerárquico con filtros por etapa, estado, búsqueda y requisitos pendientes.
- Alta de trámites eventuales con código correlativo y documentos propios.
- Catálogo personalizado de hitos en Configuración: los hitos agregados se generan automáticamente en los contratos nuevos y se pueden editar, activar, desactivar o quitar.
- Cada hito del expediente muestra su ficha de catálogo y permite editarla desde el propio modal; los cambios se guardan en la plantilla para futuros contratos.
- **“+ Hito propio”** y **“+ Hito opcional”** afectan solo al contrato abierto. Para que un hito aparezca en obras nuevas, marcar **“Guardar también en el catálogo para futuras obras”** al crearlo, usar **“Convertir en catálogo”** desde su ficha o registrarlo en Configuración.
- Al convertir un hito propio en catálogo puedes elegir una etapa real; el hito se renumbra en esa sección y puede subirse o bajarse junto a los hitos del catálogo.
- Los hitos completados se pueden desmarcar con **“Desmarcar hito”** en el modal.
- Edición de documentos por hito con opción de guardarlos en la plantilla para futuros contratos; orden de documentos y de hitos con subir/bajar.
- Selección del documento que da por cumplido cada hito; al cargar ese archivo el hito se completa y el archivo toma el nombre de la etiqueta.
- Descarga de todos los archivos de un hito, del expediente completo y de todos los archivos del demo en un solo ZIP, más respaldo JSON de los datos desde Configuración.
- Configuración de periodo y tipos de cartas fianza.
- Alerta de **silencio positivo** cuando un trámite eventual con plazo legal (por ejemplo, ampliación de plazo) vence sin pronunciamiento.
- Configuración de feriados para el cálculo de plazos en días hábiles.
- Carga, descarga y eliminación de archivos por requisito.
- Vista resumen con próximos vencimientos, trámites eventuales y avance por etapa.
- Impresión del expediente desde el navegador.
- Persistencia local sin servidor; Supabase es opcional.

El usuario de solo lectura puede consultar y descargar, pero no editar hitos ni subir archivos.

## Usuarios demo

| Correo | Contraseña | Rol |
|---|---|---|
| `admin@acrodocs.local` | `admin123` | Administrador |
| `logistica@acrodocs.local` | `logistica123` | Logística |
| `area@acrodocs.local` | `area123` | Área usuaria |
| `legal@acrodocs.local` | `legal123` | Asesoría legal |
| `lectura@acrodocs.local` | `lectura123` | Solo lectura |

## Reiniciar el demo

La base local se guarda en `acrodocs_demo_v6`. Para dejarla como nueva:

1. Abre la consola del navegador (F12).
2. Ejecuta:

```js
localStorage.removeItem("acrodocs_demo_v6");
indexedDB.deleteDatabase("acrodocs_archivos");
location.reload();
```

El demo incluye dos contratos (`DEMO-OC-2026-001` y `DEMO-CA-2026-002`), hitos recurrentes y un trámite eventual de cambio de personal.

## Pasar a PostgreSQL / Supabase

1. Crea un proyecto en Supabase.
2. Ejecuta `schema.sql` en el SQL Editor.
3. Copia `.env.example` a `.env.local` y completa:

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=...
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
```

4. Crea el bucket `adjuntos` en Supabase Storage.
5. Despliega la carpeta `api/` en Vercel.

El esquema nuevo usa `tramites`, `tramite_items` y `adjuntos`. La ampliación de plazo ya no tiene tablas propias: se registra como un `tramite_item` con `tipo = 'eventual'` y `clave_eventual = 'ampliacion'`.

Endpoints Node disponibles:

- `GET/POST /api/tramites`
- `GET/POST/PATCH/DELETE /api/items`
- `GET /api/health`

La capa local está aislada en `src/lib/store.js` y `src/lib/archivos.js`; al conectar Supabase se reemplazan por consultas a las tablas y al bucket.

## Estructura

```text
src/
  App.jsx                  rutas, sesión y navegación
  lib/catalogo.js          catálogo jerárquico, recurrentes y trámites eventuales
  lib/store.js             persistencia local, generación de hitos, plazos y resúmenes
  lib/archivos.js          IndexedDB: guardar, descargar y eliminar archivos
  lib/supabase.js          cliente Supabase opcional
  pages/Login.jsx          acceso y usuarios demo
  pages/Panel.jsx          KPIs y alertas
  pages/Tramites.jsx       listado y alta de contratos
  pages/TramiteDetalle.jsx expediente jerárquico y documentos
  pages/Configuracion.jsx  feriados y días hábiles
api/                       funciones serverless Node para Vercel
schema.sql                 esquema PostgreSQL/Supabase
iniciar-demo.bat           lanzador local
```

## Nota sobre plazos

Los plazos del catálogo son referenciales y configurables. Antes de usar el sistema en producción deben validarse contra la Ley 32069, su Reglamento y los procedimientos internos de cada entidad. Los feriados se configuran desde **Configuración** (solo administrador) y se usan para calcular los nuevos plazos en días hábiles; los hitos ya generados conservan su fecha hasta que se editen.
