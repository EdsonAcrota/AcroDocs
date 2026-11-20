# Versión web con Supabase — Fase 1: ingreso real y datos en la nube

Fecha: 2026-11-20 · Estado: **pendiente de aprobación** · Rama: `feature/flujo-tramite`

## Intención

Edson ya está cargando **contratos reales** en la app publicada (https://acrodocs.vercel.app). Hoy todo vive
en el navegador de cada dispositivo (`localStorage` e IndexedDB): lo de la PC no aparece en el celular,
cualquiera que adivine la dirección puede entrar con los usuarios de demostración y un borrado de datos del
navegador lo pierde todo. Esta fase pasa la app a una web real: **ingreso con correo y contraseña, datos
compartidos entre dispositivos y permisos que hace cumplir el servidor**, sin perder lo ya cargado.

Los **documentos** (archivos) van a **Google Drive** para no saturar Supabase; eso es la Fase 2. En Supabase
queda lo estructurado: usuarios, catálogo, contratos, hitos, movimientos, trámites e historial.

## Estado actual

- Proyecto Supabase `ehjfqhsaiwpxvegijkjv` (us-east-2): vacío, sin tablas.
- Vercel: proyecto `acrodocs`, producción = rama `feature/flujo-tramite`; la web responde `supabase: false`.
- Datos: un objeto con las colecciones `tramites`, `items`, `movimientos`, `procedimientos`, `cargos`,
  `historial`, `usuarios` (con contraseñas demo en texto plano), `permisosRoles`, `catalogo`, `feriados`,
  `empresa`, `configFianzas`. `store.js` (2.100 líneas, 88 funciones) lee y escribe ese objeto de forma
  síncrona; las pantallas dependen de eso.
- Existe un "puente" (`api/state.js`, `cloud.js`) que sube el estado completo a una sola fila con una clave
  compartida dentro del JavaScript de la página. No es seguro y se retira.

## Metas

- Ingreso real (correo y contraseña); usuarios que crea el gerente; recuperar contraseña por correo.
- Permisos por rol y por contrato aplicados **en la base de datos**, no solo en la pantalla.
- Contratos, hitos, catálogo, movimientos, trámites, historial, feriados y empresa en Supabase; la PC y el
  celular ven lo mismo.
- **Importar lo que Edson ya cargó** en su navegador, sin perder nada.
- La lógica actual (plazos, flujo de pasos, clases de hito) no se reescribe.

## No metas (en esta fase)

- Los archivos: siguen en el navegador donde se subieron hasta la Fase 2 (Drive).
- Tiempo real instantáneo entre usuarios (se refresca al entrar y al volver a la pestaña).
- Reportes SQL por campo, trabajo sin conexión.

## Anti-metas (sería un fracaso aunque "funcione")

- Perder datos reales ya cargados.
- Que un usuario sin permiso pueda leer o escribir saltándose la app, hablando directo con Supabase.
- Contraseñas en texto plano, o la clave de servicio de Supabase dentro del código del navegador.
- Romper el modo local (demo) y las 199 pruebas actuales.
- Guardar mal sin avisar: un fallo de guardado debe verse.

## Enfoques

- **A · Un documento por fila + caché en memoria (elegido).** Una tabla por colección con `id`, `tramite_id` y
  los datos del objeto en `jsonb`. Al entrar, la app carga a memoria lo que el usuario puede ver, con la misma
  forma de hoy, y `store.js` sigue funcionando igual; al guardar se envían solo las filas que cambiaron.
  Reaprovecha todo el código; la seguridad se aplica por tabla. Límite: la seguridad es por tabla y por
  contrato, no por cada campo.
- **B · Tablas relacionales completas** (como el `schema.sql` actual). Más limpio para reportes, pero obliga a
  reescribir las 88 funciones y todas las pantallas a asíncrono: semanas más y mucho riesgo con datos reales.
- **C · Una función del servidor por cada acción.** Máxima seguridad, el trabajo más grande.

## Diseño

### Ingreso y usuarios
- Supabase Auth con correo y contraseña. Tabla `perfiles` (`id` = usuario de Auth, `nombre`, `rol`, `activo`,
  `solo_asignados`).
- El gerente crea usuarios desde Configuración mediante una función de Vercel (`/api/usuarios`) que usa la
  clave de servicio, que vive **solo** en las variables del servidor. Comprueba que quien llama tenga el
  permiso `usuarios`. El usuario recibe una contraseña temporal y la cambia al entrar; "olvidé mi contraseña"
  usa el correo de Supabase.
- En modo nube desaparecen la lista y las contraseñas de demostración.

### Tablas
- `perfiles`, `permisos_roles` (rol → lista de permisos), `usuario_contratos`, `config` (clave → `jsonb`:
  catálogo, feriados, empresa, configFianzas).
- Por colección: `tramites`, `items`, `movimientos`, `procedimientos`, `cargos`, `historial`, cada una con
  `id`, `tramite_id`, `data jsonb`, `actualizado`, `actualizado_por`.
- Las migraciones quedan en `supabase/migrations/` en el repositorio.

### Permisos en el servidor (RLS)
- Funciones SQL `es_gerente()`, `tiene_permiso(p)` y `ve_contrato(tramite_id)`, que repiten la lógica de
  `permisos.js` (incluida la casilla `solo_asignados`).
- **Leer:** `ve_contrato`. **Escribir** por tabla: `tramites` (crear, editar, eliminar); `items` (agregar,
  estado, plazos, subir, reemplazar, registrar, corregir, borrar_hito); `movimientos` y `cargos` (registrar,
  corregir); `procedimientos` (agregar, registrar); `historial` (solo agregar, nunca editar ni borrar);
  `config` (catálogo → `catalogo`, feriados → `feriados`, empresa → `usuarios`); `perfiles`, `permisos_roles`
  y `usuario_contratos` (solo `usuarios`; el gerente no se puede limitar).
- Las reglas finas dentro de una tabla (qué campo toca cada permiso) siguen en la app. Un usuario malicioso
  solo podría hacer lo que su rol puede escribir en esa tabla.

### En la app
- `src/lib/nube.js`: al entrar carga a memoria todo lo permitido, con la forma actual de los datos;
  `write()` compara con la última copia y envía solo lo que cambió (altas, cambios y bajas por `id`).
- Un fallo de guardado muestra un aviso y reintenta; no se pierde en silencio. Se refresca al volver a la
  pestaña.
- Sin Supabase configurado, la app sigue en modo local como hoy (demo y pruebas).
- Se retiran `api/state.js` y la clave `VITE_APP_KEY`.

### Importar lo que ya cargaste (opcional)
- **Edson arranca de cero en la nube** con sus tres contratos nuevos (dos de consultoría de obra y una obra),
  así que la importación deja de ser necesaria: solo se usa si carga algo en modo local antes del cambio, y
  entonces se importa de su copia de respaldo. Es lo último que se construye.
- Botón "Subir mis datos del navegador a la nube" (solo gerente, una vez, repetible sin duplicar porque usa
  `id`). Antes descarga una copia de respaldo en JSON.
- Importa contratos, hitos, movimientos, trámites, cargos, historial y catálogo. Los usuarios de demostración
  **no** se importan: se crean los reales. Los hitos conservan sus referencias a archivos.

### Archivos (Fase 2: Google Drive, para no saturar Supabase)
- Supabase guarda solo los datos del documento (nombre, tipo, requisito, hito, versión, quién y cuándo, y el
  identificador en Drive). El archivo vive en Drive, en `AcroDocs/{contrato}/{etapa}/{hito}/`.
- Los usuarios no entran a Drive: la app comprueba el permiso en el servidor. La subida va directa del
  navegador a Google (con una sesión que crea el servidor), porque las funciones de Vercel tienen un límite
  de tamaño por petición. La descarga la sirve el servidor tras verificar el permiso; se valida con un
  archivo grande antes de comprometerse.
- **Decisión pendiente, no bloquea la Fase 1:** si la cuenta es un Gmail personal (conexión por OAuth con la
  cuenta de Edson) o Google Workspace de la empresa (cuenta de servicio con una unidad compartida, más
  estable).
- Mientras tanto, los archivos ya subidos siguen en el navegador donde se subieron: no limpiar sus datos.

## Restricciones

- La clave de servicio de Supabase (`SUPABASE_SERVICE_ROLE_KEY`) la pega Edson en las variables de Vercel;
  yo no la manejo. En el navegador solo va la clave pública.
- Los datos reales no se tocan hasta tener respaldo descargado y la importación probada con una copia.
- Pocas pruebas, como siempre: matriz de permisos en la base, la lógica de diferencias de `nube.js` y la
  importación; más `npx vitest run` y `npm run build`.

## Trabajo en orden (cada paso deja algo comprobable)

1. Esquema, funciones y reglas (RLS) en migraciones; pruebas de la matriz rol × tabla con usuarios de prueba
   que se borran después.
2. Ingreso real, `perfiles` y la función de usuarios.
3. `nube.js` y el modo nube en la app.
4. Importación de los datos del navegador y pantalla de usuarios real.
5. Variables en Vercel, prueba con una copia de tus datos y puesta en marcha.

## Plan para el fin de semana (hoy es viernes 20 de noviembre de 2026)

Programar lo anterior son unos 3 días de trabajo mío si no hay sorpresas. Las "1 a 2 semanas" incluían el
tiempo de revisión entre pasos y margen para imprevistos con datos reales. Para llegar con una versión
probable el domingo:

- **Versión de prueba separada.** El código nuevo va en la rama `feature/nube`, que Vercel publica en una
  dirección de prueba protegida con las variables de la nube. La web actual (modo local) no se toca hasta
  que Edson confirme que todo funciona.
- **Viernes:** esquema, permisos (RLS) con su matriz de pruebas, ingreso real y función de usuarios.
- **Sábado:** capa `nube.js`, modo nube en la app y pantalla de ingreso.
- **Domingo:** prueba con cada rol y carga de prueba de los contratos nuevos de Edson; correcciones. La
  importación de datos locales solo si hace falta.
- **Lunes:** cambio definitivo: crear los usuarios reales y retirar la demo. Edson empieza a cargar sus
  contratos en la nube.
- **Semana siguiente:** Fase 2, archivos en Google Drive. Mientras tanto, los archivos se suben desde un solo
  navegador y después se pasan a Drive con una herramienta de "subir mis archivos locales".

Se recorta para llegar: Google Drive (Fase 2), recuperación de contraseña por correo (el gerente la restablece
por ahora), tiempo real, y pulido de la pantalla de usuarios (se reutiliza la actual conectada a la nube).

Lo que puede mover las fechas: imprevistos al adaptar `store.js` y las pantallas al ingreso asíncrono, errores
en las reglas de permisos, rarezas en los datos reales al importarlos y retrasos en las pruebas o en pegar las
claves en Vercel. Con datos reales no se corta camino en las pruebas ni en el respaldo.

**Lo que se necesita de Edson:** aprobar el diseño hoy; descargar el respaldo de sus datos; pegar la clave de
servicio en las variables de Vercel de la rama de prueba (se la pido cuando llegue el momento); pasar la lista
de usuarios reales antes del domingo; y probar el domingo.

## Decisiones mías (a confirmar al leer)

- Un documento por fila (enfoque A) en vez de tablas relacionales.
- Seguridad por tabla y por contrato; las reglas finas se quedan en la app.
- Contraseña temporal al crear usuarios, en lugar de invitación por correo (el correo de Supabase gratuito
  tiene un límite bajo y puede cambiarse después).
- Refrescar al volver a la pestaña, sin tiempo real, en esta fase.
- Archivos en Drive en la Fase 2, no en Supabase Storage.

## Pendiente de Edson

- Aprobar este diseño.
- Cuando llegue el paso 5: pegar `SUPABASE_SERVICE_ROLE_KEY` en las variables de Vercel.
- Lista de usuarios reales (nombre, correo, rol y contratos) para crearlos al arrancar.
- Para la Fase 2: cuenta de Google (Gmail personal o Workspace).
