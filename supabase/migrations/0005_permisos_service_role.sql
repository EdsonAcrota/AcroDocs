-- La función /api/usuarios usa la clave de servicio (rol service_role). En este proyecto ese rol
-- no recibía permisos sobre las tablas nuevas, así que no podía leer perfiles ni crear usuarios.
-- service_role ya se salta las reglas RLS; solo faltaba el permiso básico de tabla.
grant select, insert, update, delete on all tables in schema public to service_role;
