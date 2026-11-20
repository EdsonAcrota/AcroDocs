-- AcroDocs · Fase 1 · reglas de seguridad (RLS). Nada se abre al rol `anon`.
-- Leer: según `ve_contrato`. Escribir: según el permiso que la app exige para esa colección.

create function public.es_activo() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles where id = auth.uid() and activo);
$$;

create function public.tiene_alguno(ps text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from unnest(ps) p where public.tiene_permiso(p));
$$;

revoke all on function public.es_activo(), public.tiene_alguno(text[]) from public, anon;
grant execute on function public.es_activo(), public.tiene_alguno(text[]) to authenticated;

-- Sello de modificación en cada cambio.
create function public.tocar() returns trigger language plpgsql as $$
begin
  new.actualizado := now();
  new.actualizado_por := auth.uid();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['tramites','config','items','movimientos','procedimientos','cargos','config_fianzas','historial'] loop
    execute format('create trigger tocar before update on public.%I for each row execute function public.tocar()', t);
  end loop;
end $$;

-- Permisos de tabla: nada para `anon`; `authenticated` queda filtrado por las reglas de fila.
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;

alter table public.perfiles enable row level security;
alter table public.permisos_roles enable row level security;
alter table public.usuario_contratos enable row level security;
alter table public.config enable row level security;
alter table public.tramites enable row level security;
alter table public.items enable row level security;
alter table public.movimientos enable row level security;
alter table public.procedimientos enable row level security;
alter table public.cargos enable row level security;
alter table public.config_fianzas enable row level security;
alter table public.historial enable row level security;

-- ---------- perfiles ----------
-- Crear usuarios solo lo hace la función de Vercel (clave de servicio). Nadie borra perfiles: se desactivan.
create policy perfiles_leer on public.perfiles for select to authenticated
  using (id = auth.uid() or public.tiene_permiso('usuarios'));
create policy perfiles_editar on public.perfiles for update to authenticated
  using (public.tiene_permiso('usuarios') and (rol <> 'gerente' or public.es_gerente()))
  with check (rol <> 'gerente' or public.es_gerente());

-- ---------- permisos_roles ----------
create policy permisos_roles_leer on public.permisos_roles for select to authenticated
  using (public.es_activo());
create policy permisos_roles_insertar on public.permisos_roles for insert to authenticated
  with check (public.tiene_permiso('usuarios') and rol <> 'gerente');
create policy permisos_roles_editar on public.permisos_roles for update to authenticated
  using (public.tiene_permiso('usuarios') and rol <> 'gerente')
  with check (public.tiene_permiso('usuarios') and rol <> 'gerente');

-- ---------- usuario_contratos ----------
create policy usuario_contratos_leer on public.usuario_contratos for select to authenticated
  using (usuario_id = auth.uid() or public.tiene_permiso('usuarios'));
create policy usuario_contratos_insertar on public.usuario_contratos for insert to authenticated
  with check (public.tiene_permiso('usuarios'));
create policy usuario_contratos_borrar on public.usuario_contratos for delete to authenticated
  using (public.tiene_permiso('usuarios'));

-- ---------- config (catálogo, feriados, empresa) ----------
create policy config_leer on public.config for select to authenticated
  using (public.es_activo());
create policy config_insertar on public.config for insert to authenticated
  with check (case clave
    when 'catalogo' then public.tiene_permiso('catalogo')
    when 'feriados' then public.tiene_permiso('feriados')
    when 'empresa' then public.tiene_permiso('usuarios')
    else false end);
create policy config_editar on public.config for update to authenticated
  using (case clave
    when 'catalogo' then public.tiene_permiso('catalogo')
    when 'feriados' then public.tiene_permiso('feriados')
    when 'empresa' then public.tiene_permiso('usuarios')
    else false end)
  with check (case clave
    when 'catalogo' then public.tiene_permiso('catalogo')
    when 'feriados' then public.tiene_permiso('feriados')
    when 'empresa' then public.tiene_permiso('usuarios')
    else false end);

-- ---------- tramites (contratos) ----------
create policy tramites_leer on public.tramites for select to authenticated
  using (public.ve_contrato(id));
create policy tramites_crear on public.tramites for insert to authenticated
  with check (public.tiene_permiso('crear'));
create policy tramites_editar on public.tramites for update to authenticated
  using (public.ve_contrato(id) and public.tiene_permiso('editar'))
  with check (public.ve_contrato(id) and public.tiene_permiso('editar'));
create policy tramites_borrar on public.tramites for delete to authenticated
  using (public.ve_contrato(id) and public.tiene_permiso('eliminar'));

-- ---------- colecciones por contrato ----------
-- Las listas de permisos de escritura salen de lo que exige store.js en cada función.
do $$
declare
  t text;
  escribir text;
  borrar text;
begin
  for t, escribir, borrar in select * from (values
    ('items',          'array[''agregar'',''estado'',''plazos'',''subir'',''reemplazar'',''borrar_doc'',''registrar'',''corregir'']', 'array[''borrar_hito'',''eliminar'']'),
    ('movimientos',    'array[''registrar'',''corregir'']',                                                                            'array[''corregir'',''eliminar'']'),
    ('cargos',         'array[''registrar'',''corregir'',''subir'',''borrar_doc'']',                                                   'array[''corregir'',''borrar_doc'',''eliminar'']'),
    ('procedimientos', 'array[''agregar'',''registrar'',''subir'',''borrar_doc'',''corregir'',''estado'']',                           'array[''borrar_hito'',''eliminar'']'),
    ('config_fianzas', 'array[''agregar'']',                                                                                          'array[''agregar'',''eliminar'']')
  ) as v(a, b, c)
  loop
    execute format('create policy %I on public.%I for select to authenticated using (public.ve_contrato(tramite_id))', t || '_leer', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.ve_contrato(tramite_id) and public.tiene_alguno(%s))', t || '_crear', t, escribir);
    execute format('create policy %I on public.%I for update to authenticated using (public.ve_contrato(tramite_id) and public.tiene_alguno(%s)) with check (public.ve_contrato(tramite_id) and public.tiene_alguno(%s))', t || '_editar', t, escribir, escribir);
    execute format('create policy %I on public.%I for delete to authenticated using (public.ve_contrato(tramite_id) and public.tiene_alguno(%s))', t || '_borrar', t, borrar);
  end loop;
end $$;

-- ---------- historial: solo agregar ----------
create policy historial_leer on public.historial for select to authenticated
  using (public.ve_contrato(tramite_id));
create policy historial_agregar on public.historial for insert to authenticated
  with check (public.es_activo());
-- Sin reglas de update ni delete: el historial no se edita ni se borra.
