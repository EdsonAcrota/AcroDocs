-- AcroDocs · Fase 1 · esquema (un documento por fila).
-- Cada colección de la app es una tabla con `id`, `tramite_id` y el objeto completo en `data`.

-- ---------- Usuarios y permisos ----------
create table public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null,
  email text not null,
  rol text not null check (rol in ('gerente','socio','jefe','residente','asis_tec','asis_adm','finanzas','legal','consulta')),
  activo boolean not null default true,
  solo_asignados boolean not null default false,
  cambiar_clave boolean not null default false,
  creado timestamptz not null default now()
);

create table public.permisos_roles (
  rol text primary key,
  permisos text[] not null default '{}'
);

-- ---------- Datos ----------
create table public.tramites (
  id text primary key,
  data jsonb not null,
  actualizado timestamptz not null default now(),
  actualizado_por uuid default auth.uid()
);

create table public.usuario_contratos (
  usuario_id uuid not null references public.perfiles (id) on delete cascade,
  tramite_id text not null references public.tramites (id) on delete cascade,
  primary key (usuario_id, tramite_id)
);

create table public.config (
  clave text primary key,
  valor jsonb not null,
  actualizado timestamptz not null default now(),
  actualizado_por uuid default auth.uid()
);

create table public.items (
  id text primary key,
  tramite_id text not null references public.tramites (id) on delete cascade,
  data jsonb not null,
  actualizado timestamptz not null default now(),
  actualizado_por uuid default auth.uid()
);
create table public.movimientos (like public.items including all);
create table public.procedimientos (like public.items including all);
create table public.cargos (like public.items including all);
create table public.config_fianzas (like public.items including all);
alter table public.movimientos add foreign key (tramite_id) references public.tramites (id) on delete cascade;
alter table public.procedimientos add foreign key (tramite_id) references public.tramites (id) on delete cascade;
alter table public.cargos add foreign key (tramite_id) references public.tramites (id) on delete cascade;
alter table public.config_fianzas add foreign key (tramite_id) references public.tramites (id) on delete cascade;

-- El historial sobrevive a la eliminación del contrato: sin llave foránea.
create table public.historial (
  id text primary key,
  tramite_id text,
  data jsonb not null,
  actualizado timestamptz not null default now(),
  actualizado_por uuid default auth.uid()
);

create index on public.items (tramite_id);
create index on public.movimientos (tramite_id);
create index on public.procedimientos (tramite_id);
create index on public.cargos (tramite_id);
create index on public.historial (tramite_id);
create index on public.usuario_contratos (tramite_id);

-- ---------- Funciones de permisos (repiten la lógica de src/lib/permisos.js) ----------
-- SECURITY DEFINER para poder leer `perfiles` sin que sus propias reglas se llamen a sí mismas.
create function public.es_gerente() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles where id = auth.uid() and rol = 'gerente' and activo);
$$;

create function public.tiene_permiso(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.es_gerente() or exists (
    select 1 from perfiles pf join permisos_roles pr on pr.rol = pf.rol
    where pf.id = auth.uid() and pf.activo and p = any (pr.permisos)
  );
$$;

-- ¿Ve este contrato? Gerente: todos. Con `ver_todos` y sin `solo_asignados`: todos.
-- Si no, solo los asignados en `usuario_contratos`. Con `t` nulo (historial general)
-- solo ven quienes ven todos los contratos.
create function public.ve_contrato(t text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.es_gerente() or exists (
    select 1 from perfiles pf join permisos_roles pr on pr.rol = pf.rol
    where pf.id = auth.uid() and pf.activo and not pf.solo_asignados and 'ver_todos' = any (pr.permisos)
  ) or (t is not null and exists (
    select 1 from usuario_contratos uc join perfiles pf on pf.id = uc.usuario_id
    where uc.usuario_id = auth.uid() and uc.tramite_id = t and pf.activo
  ));
$$;

-- Quien entra con clave temporal la cambia y la app lo marca aquí.
create function public.marcar_clave_cambiada() returns void
language sql security definer set search_path = public as $$
  update perfiles set cambiar_clave = false where id = auth.uid();
$$;

revoke all on function public.es_gerente(), public.tiene_permiso(text), public.ve_contrato(text), public.marcar_clave_cambiada() from public, anon;
grant execute on function public.es_gerente(), public.tiene_permiso(text), public.ve_contrato(text), public.marcar_clave_cambiada() to authenticated;

-- ---------- Siembra: matriz inicial de permisos (MATRIZ_INICIAL de permisos.js) ----------
insert into public.permisos_roles (rol, permisos) values
  ('gerente', array['ver_todos', 'crear', 'editar', 'eliminar', 'estado', 'agregar', 'plazos', 'borrar_hito', 'subir', 'descargar', 'reemplazar', 'borrar_doc', 'registrar', 'corregir', 'alertas', 'catalogo', 'feriados', 'usuarios', 'respaldo']),
  ('socio', array['ver_todos', 'crear', 'editar', 'eliminar', 'estado', 'agregar', 'plazos', 'borrar_hito', 'subir', 'descargar', 'reemplazar', 'borrar_doc', 'registrar', 'corregir', 'alertas', 'catalogo', 'feriados', 'usuarios', 'respaldo']),
  ('jefe', array['ver_todos', 'crear', 'editar', 'estado', 'agregar', 'plazos', 'subir', 'descargar', 'reemplazar', 'registrar', 'corregir', 'alertas', 'catalogo']),
  ('residente', array['estado', 'subir', 'descargar', 'registrar', 'alertas']),
  ('asis_tec', array['ver_todos', 'estado', 'subir', 'descargar', 'registrar', 'alertas']),
  ('asis_adm', array['ver_todos', 'estado', 'subir', 'descargar', 'registrar', 'alertas']),
  ('finanzas', array['ver_todos', 'subir', 'descargar', 'registrar', 'alertas']),
  ('legal', array['ver_todos', 'subir', 'descargar', 'registrar', 'alertas']),
  ('consulta', array['ver_todos', 'descargar']);
