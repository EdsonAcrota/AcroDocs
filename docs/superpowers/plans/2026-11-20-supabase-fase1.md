# Supabase Fase 1 — plan de implementación

> Ejecución nativa en esta sesión (sin subagentes, sin revisión por tarea). Casillas `- [ ]` para el avance.

**Meta:** ingreso real con Supabase Auth, datos compartidos en la nube y permisos hechos cumplir por la base (RLS), sin romper el modo local ni las 199 pruebas.

**Diseño:** `docs/superpowers/specs/2026-11-20-supabase-fase1-design.md` (enfoque A: un documento por fila + caché en memoria). Rama: `feature/nube` (no se toca `feature/flujo-tramite`, que es la producción actual).

**Pila:** React + Vite, `@supabase/supabase-js`, funciones de Vercel (`api/`), SQL en `supabase/migrations/`, Vitest.

## Reglas del proyecto

- La `SUPABASE_SERVICE_ROLE_KEY` solo vive en las variables de Vercel (la pega Edson). En el navegador solo `VITE_SUPABASE_URL` y la clave publicable.
- Modo nube = existen `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`. Sin ellas, la app es el modo local de hoy.
- Pedir permiso a Edson antes de cada commit/push, agrupados al cerrar cada tarea. Al cerrar cada tarea: `get_usage` y decirle los porcentajes.
- Verificación: `npx vitest run` (199 pruebas + las nuevas) y `npm run build`.

## Decisiones que el diseño dejaba abiertas

- **Tablas por colección:** `tramites`, `items`, `movimientos`, `procedimientos`, `cargos`, `historial` y `config_fianzas` (la configuración de fianzas por contrato va por fila para poder filtrarla por contrato; en `data` sigue siendo `configFianzas[id]`). `config` guarda `catalogo`, `feriados` y `empresa`.
- `id text` (la app genera UUID de texto). `historial.tramite_id` sin llave foránea: el historial sobrevive a la eliminación del contrato.
- `items` se escribe con cualquiera de `agregar, estado, plazos, subir, reemplazar, borrar_doc, registrar, corregir` (los documentos viven dentro del hito, por eso entra `borrar_doc`, que el diseño no listaba).
- Los permisos de un rol se leen siempre de `permisos_roles`; el gerente se decide por `perfiles.rol = 'gerente'`, no por la matriz.
- El primer gerente lo crea Edson en el panel de Supabase (Authentication → Add user) y yo le agrego su fila en `perfiles` por SQL. Su contraseña nunca pasa por el chat. Los demás los crea `/api/usuarios`.
- Usuarios nuevos: contraseña temporal (la escribe el gerente o se genera) y `perfiles.cambiar_clave = true` obliga a cambiarla al entrar.
- Un usuario con rol `gerente` no se puede limitar: las reglas de `perfiles` impiden que otro rol lo edite o que se cree/ascienda a gerente sin ser gerente.

## Tarea 1 — Esquema, funciones y RLS

**Archivos:** crear `supabase/migrations/0001_esquema.sql`, `0002_rls.sql`, `supabase/tests/rls_matriz.sql`.
**Produce:** funciones `es_gerente()`, `tiene_permiso(p text)`, `ve_contrato(t text)` (SECURITY DEFINER, `search_path=public`, solo `authenticated`); `marcar_clave_cambiada()`; `permisos_roles` sembrada con `MATRIZ_INICIAL`.

- [ ] Escribir y aplicar `0001` (tablas, FKs, índices por `tramite_id`, siembra de `permisos_roles`) con `apply_migration`.
- [ ] Escribir y aplicar `0002`: RLS activada en todas; `revoke` a `anon`; lectura con `ve_contrato`; escritura por tabla según el diseño (más la lista de `items` de arriba); `historial` solo `insert`; `config` por clave (`catalogo`, `feriados`, `empresa`→`usuarios`); `perfiles`/`permisos_roles`/`usuario_contratos` solo con `usuarios`.
- [ ] `rls_matriz.sql`: bloque `DO` que crea usuarios de prueba (gerente, jefe, residente asignado a un contrato, consulta, uno inactivo), simula cada uno con `request.jwt.claims` y verifica la matriz rol × tabla (lectura propia vs ajena, escrituras permitidas y denegadas, historial inmutable, gerente intocable). Se ejecuta y al final borra los usuarios de prueba.
- [ ] `get_advisors` (seguridad) sin hallazgos críticos.

## Tarea 2 — Ingreso y función de usuarios

**Archivos:** crear `api/usuarios.js`; crear `src/lib/supabase.js`.
**Produce:** `MODO_NUBE: boolean`, `supabase: SupabaseClient | null`; endpoints `POST /api/usuarios {nombre,email,rol,contratos,soloAsignados,password?} → {id,password}` y `PATCH /api/usuarios {id,password?} → {password}` con `Authorization: Bearer <jwt>`.

- [ ] `api/usuarios.js`: valida el JWT con la clave de servicio, exige activo y permiso `usuarios` (leído de `permisos_roles`), solo un gerente crea/restablece a otro gerente; crea el usuario de Auth con correo confirmado, inserta `perfiles` (`cambiar_clave=true`) y `usuario_contratos`; 503 si faltan variables; nunca devuelve la clave de servicio.
- [ ] Retirar `api/state.js` y `api/files.js` (con la clave de servicio en Vercel quedarían abiertas sin `APP_KEY`; los archivos van a Drive en la Fase 2).

## Tarea 3 — `nube.js` y modo nube en la app

**Archivos:** crear `src/lib/nube.js`, `src/lib/nube.test.js`; modificar `src/lib/store.js` (núcleo `read`/`write`/`logout`, `normalizarDatos` extraída de `read`), `src/App.jsx`, `src/main.jsx`, `src/pages/Login.jsx`; borrar `src/lib/cloud.js`; actualizar `.env.example` y README.
**Produce (puro, probado):** `aFilas(data): {tabla: Fila[]}`, `deFilas(filas): data`, `diferencias(anterior: Map<id,string>, filas): {subir: Fila[], borrar: string[]}`.
**Produce (red):** `ingresar(email, clave)`, `sesionActual()`, `cargar(): Promise<data>`, `guardar(data)` (debounce, diferencias por `id`, solo marca como guardado lo que el servidor aceptó, reintenta 3 veces), `estadoGuardado` con suscripción (`guardado | guardando | error`), `crearUsuario(datos)`, `restablecerClave(id, clave)`, `cambiarMiClave(clave)`, `cerrarSesion()`. Paginación de 1000 en 1000 al cargar.
**Store:** `iniciarNube(raw)` (normaliza y activa la caché), con la caché activa `read()` devuelve una copia de la memoria y `write()` actualiza la memoria y llama a `guardar`; el catálogo por defecto lo guarda el primer gerente que entra.

- [ ] Prueba `diferencias`/`aFilas`/`deFilas`: alta, cambio y baja por `id`, fila sin cambios no se envía, `aFilas`→`deFilas` conserva la forma de `data`.
- [ ] Implementar `nube.js` y adaptar `store.js`; `src/main.jsx` ya no llama a `cloud.js`.
- [ ] `App.jsx`: arranque asíncrono (restaura sesión → carga → muestra), aviso visible de guardado/fallo con botón "Recargar datos", recarga al volver a la pestaña si no hay guardado pendiente, pantalla de cambio de clave obligatoria (`cambiar_clave`), etiqueta "Nube · Supabase".
- [ ] `Login.jsx`: en modo nube, solo correo y contraseña (sin lista ni claves de demostración).
- [ ] `npx vitest run` y `npm run build` en verde, y comprobar que el modo local sigue entrando con los usuarios de demostración.

## Tarea 4 — Pantalla de usuarios en la nube

**Archivos:** modificar `src/components/UsuariosPermisos.jsx`.

- [ ] En modo nube: crear usa `nube.crearUsuario` y muestra la contraseña temporal una vez; editar rol/contratos/activo/solo asignados pasa por `actualizarUsuario` (los guarda el diff); la contraseña en edición usa `restablecerClave`; el correo no es editable.
- [ ] Importación de datos locales: solo si sobra tiempo (opcional, al final).

## Tarea 5 — Vercel y prueba

- [ ] Variables de Vercel solo para la rama `feature/nube` (entorno Preview): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`. `SUPABASE_SERVICE_ROLE_KEY` la pega Edson.
- [ ] Push de `feature/nube` (con permiso), desplegar, probar con gerente real: crear un usuario con rol y contrato, entrar como ese usuario, comprobar que solo ve y escribe lo permitido y que PC y celular ven lo mismo.
- [ ] Indicar a Edson: la protección de despliegues de Vercel no se cambió; la URL de la rama pide su sesión de Vercel salvo que él decida otra cosa. Desactivar el registro público en Supabase Auth (Sign In / Providers) es ajuste suyo.

## Qué podría morder y cómo se cubre

- Más de 1000 filas (PostgREST corta en 1000): la carga pagina.
- Dos personas editando la misma fila a la vez: gana la última escritura por fila (límite conocido de esta fase; se documenta).
- Un rol sin permiso intenta escribir algo que la pantalla ya ocultaba: la base lo rechaza, el aviso de error se ve y "Recargar datos" restaura lo del servidor.
- Un usuario con sesión abierta al que se le quita un permiso: la base aplica el cambio de inmediato; la pantalla se pone al día al recargar.
- Contrato borrado con hitos y movimientos: la FK en cascada los elimina; el historial se conserva.
