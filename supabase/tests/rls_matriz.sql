-- Matriz rol × tabla de las reglas RLS. Se ejecuta completa (SQL editor o `execute_sql`).
-- Crea usuarios y datos de prueba, simula a cada usuario con su JWT, y SIEMPRE termina con
-- un error "RESULTADO: ..." que deshace todo: no queda ningún usuario ni dato de prueba.
-- Cada caso corre en su propio sub-bloque y se deshace, así no se afectan entre sí.
-- Códigos: G gerente · S socio · J jefe · JL jefe solo asignados · R residente · C consulta · I inactivo.

do $prueba$
declare
  ids jsonb := '{
    "G":"00000000-0000-4000-8000-0000000000a1", "S":"00000000-0000-4000-8000-0000000000a2",
    "J":"00000000-0000-4000-8000-0000000000a3", "JL":"00000000-0000-4000-8000-0000000000a4",
    "R":"00000000-0000-4000-8000-0000000000a5", "C":"00000000-0000-4000-8000-0000000000a6",
    "I":"00000000-0000-4000-8000-0000000000a7"}';
  c record;
  n int;
  obtenido text;
  total int := 0;
  fallos text[] := '{}';
begin
  insert into auth.users (id, instance_id, aud, role, email)
  select value::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', lower(key) || '@prueba.local'
  from jsonb_each_text(ids);

  insert into public.perfiles (id, nombre, email, rol, activo, solo_asignados) values
    ((ids->>'G')::uuid,  'Gerente',   'g@prueba.local',  'gerente',   true,  false),
    ((ids->>'S')::uuid,  'Socio',     's@prueba.local',  'socio',     true,  false),
    ((ids->>'J')::uuid,  'Jefe',      'j@prueba.local',  'jefe',      true,  false),
    ((ids->>'JL')::uuid, 'Jefe lim.', 'jl@prueba.local', 'jefe',      true,  true),
    ((ids->>'R')::uuid,  'Residente', 'r@prueba.local',  'residente', true,  false),
    ((ids->>'C')::uuid,  'Consulta',  'c@prueba.local',  'consulta',  true,  false),
    ((ids->>'I')::uuid,  'Inactivo',  'i@prueba.local',  'asis_adm',  false, false);

  insert into public.tramites (id, data) values ('tA', '{}'), ('tB', '{}');
  insert into public.usuario_contratos values ((ids->>'R')::uuid, 'tA'), ((ids->>'JL')::uuid, 'tB');
  insert into public.items (id, tramite_id, data) values ('iA', 'tA', '{}'), ('iB', 'tB', '{}');
  insert into public.movimientos (id, tramite_id, data) values ('mA', 'tA', '{}'), ('mB', 'tB', '{}');
  insert into public.historial (id, tramite_id, data) values ('hA', 'tA', '{}'), ('hG', null, '{}');
  insert into public.config (clave, valor) values ('catalogo', '{}'), ('feriados', '[]'), ('empresa', '{}');

  for c in select * from (values
    -- ---------- lecturas ----------
    ('G',  've todos los contratos',            $q$select count(*) from public.tramites$q$, '2'),
    ('J',  'jefe ve todos los contratos',       $q$select count(*) from public.tramites$q$, '2'),
    ('C',  'consulta ve todos los contratos',   $q$select count(*) from public.tramites$q$, '2'),
    ('R',  'residente solo el asignado',        $q$select count(*) from public.tramites$q$, '1'),
    ('JL', 'jefe limitado solo el asignado',    $q$select count(*) from public.tramites$q$, '1'),
    ('R',  'residente: sus hitos',              $q$select count(*) from public.items$q$, '1'),
    ('R',  'residente: sus movimientos',        $q$select count(*) from public.movimientos$q$, '1'),
    ('R',  'residente: historial de su contrato', $q$select count(*) from public.historial$q$, '1'),
    ('J',  'jefe: historial general incluido',  $q$select count(*) from public.historial$q$, '2'),
    ('I',  'inactivo no ve contratos',          $q$select count(*) from public.tramites$q$, '0'),
    ('I',  'inactivo no lee la matriz',         $q$select count(*) from public.permisos_roles$q$, '0'),
    ('anon', 'anon no lee contratos',           $q$select count(*) from public.tramites$q$, '-1'),
    ('R',  'residente ve solo su perfil',       $q$select count(*) from public.perfiles$q$, '1'),
    ('J',  'jefe ve solo su perfil',            $q$select count(*) from public.perfiles$q$, '1'),
    ('G',  'gerente ve todos los perfiles',     $q$select count(*) from public.perfiles$q$, '7'),
    ('S',  'socio ve todos los perfiles',       $q$select count(*) from public.perfiles$q$, '7'),
    ('R',  'residente lee la matriz',           $q$select count(*) from public.permisos_roles$q$, '9'),
    ('R',  'residente ve solo sus asignaciones', $q$select count(*) from public.usuario_contratos$q$, '1'),
    ('G',  'gerente ve todas las asignaciones', $q$select count(*) from public.usuario_contratos$q$, '2'),
    ('R',  'residente lee el catálogo y la config', $q$select count(*) from public.config$q$, '3'),
    -- ---------- escrituras: residente ----------
    ('R',  'actualiza hito de su contrato',     $q$update public.items set data = '{"x":1}' where id = 'iA'$q$, 'ok'),
    ('R',  'no toca hito de otro contrato',     $q$update public.items set data = '{"x":1}' where id = 'iB'$q$, 'no'),
    ('R',  'no borra hitos',                    $q$delete from public.items where id = 'iA'$q$, 'no'),
    ('R',  'no crea contratos',                 $q$insert into public.tramites (id, data) values ('tZ', '{}')$q$, 'no'),
    ('R',  'no edita contratos',                $q$update public.tramites set data = '{"x":1}' where id = 'tA'$q$, 'no'),
    ('R',  'registra movimiento en su contrato', $q$insert into public.movimientos (id, tramite_id, data) values ('mN', 'tA', '{}')$q$, 'ok'),
    ('R',  'no registra en contrato ajeno',     $q$insert into public.movimientos (id, tramite_id, data) values ('mN', 'tB', '{}')$q$, 'no'),
    ('R',  'no escribe la config',              $q$update public.config set valor = '{"x":1}' where clave = 'catalogo'$q$, 'no'),
    ('R',  'no se asigna contratos',            $q$insert into public.usuario_contratos values ('00000000-0000-4000-8000-0000000000a5', 'tB')$q$, 'no'),
    ('R',  'marca su clave como cambiada',      $q$select public.marcar_clave_cambiada()$q$, 'ok'),
    -- ---------- consulta e inactivo ----------
    ('C',  'consulta no escribe hitos',         $q$update public.items set data = '{"x":1}' where id = 'iA'$q$, 'no'),
    ('C',  'consulta no registra movimientos',  $q$insert into public.movimientos (id, tramite_id, data) values ('mN', 'tA', '{}')$q$, 'no'),
    ('I',  'inactivo no escribe hitos',         $q$update public.items set data = '{"x":1}' where id = 'iA'$q$, 'no'),
    ('I',  'inactivo no agrega historial',      $q$insert into public.historial (id, tramite_id, data) values ('hN', 'tA', '{}')$q$, 'no'),
    ('anon', 'anon no escribe',                 $q$insert into public.tramites (id, data) values ('tZ', '{}')$q$, 'no'),
    -- ---------- jefe ----------
    ('J',  'crea contratos',                    $q$insert into public.tramites (id, data) values ('tZ', '{}')$q$, 'ok'),
    ('J',  'edita contratos',                   $q$update public.tramites set data = '{"x":1}' where id = 'tA'$q$, 'ok'),
    ('J',  'no elimina contratos',              $q$delete from public.tramites where id = 'tA'$q$, 'no'),
    ('J',  'edita el catálogo',                 $q$update public.config set valor = '{"x":1}' where clave = 'catalogo'$q$, 'ok'),
    ('J',  'no edita feriados',                 $q$update public.config set valor = '["x"]' where clave = 'feriados'$q$, 'no'),
    ('J',  'no edita la empresa',               $q$update public.config set valor = '{"x":1}' where clave = 'empresa'$q$, 'no'),
    ('J',  'no cambia permisos de roles',       $q$update public.permisos_roles set permisos = '{}' where rol = 'residente'$q$, 'no'),
    ('J',  'no crea perfiles',                  $q$insert into public.perfiles (id, nombre, email, rol) values (gen_random_uuid(), 'X', 'x@x.x', 'consulta')$q$, 'no'),
    ('JL', 'limitado edita hito asignado',      $q$update public.items set data = '{"x":1}' where id = 'iB'$q$, 'ok'),
    ('JL', 'limitado no edita hito ajeno',      $q$update public.items set data = '{"x":1}' where id = 'iA'$q$, 'no'),
    ('JL', 'limitado no edita contrato ajeno',  $q$update public.tramites set data = '{"x":1}' where id = 'tA'$q$, 'no'),
    -- ---------- gerente ----------
    ('G',  'elimina contratos',                 $q$delete from public.tramites where id = 'tA'$q$, 'ok'),
    ('G',  'cambia el rol de otro',             $q$update public.perfiles set rol = 'socio' where id = '00000000-0000-4000-8000-0000000000a3'$q$, 'ok'),
    ('G',  'asciende a otro a gerente',         $q$update public.perfiles set rol = 'gerente' where id = '00000000-0000-4000-8000-0000000000a3'$q$, 'ok'),
    ('G',  'agrega historial',                  $q$insert into public.historial (id, tramite_id, data) values ('hN', 'tA', '{}')$q$, 'ok'),
    ('G',  'historial: no se edita',            $q$update public.historial set data = '{"x":1}' where id = 'hA'$q$, 'no'),
    ('G',  'historial: no se borra',            $q$delete from public.historial where id = 'hA'$q$, 'no'),
    -- ---------- socio (permiso usuarios, no gerente) ----------
    ('S',  'no asciende a nadie a gerente',     $q$update public.perfiles set rol = 'gerente' where id = '00000000-0000-4000-8000-0000000000a3'$q$, 'no'),
    ('S',  'no edita al gerente',               $q$update public.perfiles set nombre = 'x' where id = '00000000-0000-4000-8000-0000000000a1'$q$, 'no'),
    ('S',  'edita a otro usuario',              $q$update public.perfiles set nombre = 'x' where id = '00000000-0000-4000-8000-0000000000a3'$q$, 'ok'),
    ('S',  'cambia permisos de un rol',         $q$update public.permisos_roles set permisos = array['estado'] where rol = 'residente'$q$, 'ok'),
    ('S',  'no cambia permisos del gerente',    $q$update public.permisos_roles set permisos = '{}' where rol = 'gerente'$q$, 'no'),
    ('S',  'asigna contratos',                  $q$insert into public.usuario_contratos values ('00000000-0000-4000-8000-0000000000a5', 'tB')$q$, 'ok'),
    ('S',  'edita la empresa',                  $q$update public.config set valor = '{"x":1}' where clave = 'empresa'$q$, 'ok'),
    ('S',  'no crea claves de config desconocidas', $q$insert into public.config (clave, valor) values ('otra', '{}')$q$, 'no')
  ) as v(quien, descr, consulta, espera)
  loop
    total := total + 1;
    if c.quien = 'anon' then
      execute 'set local role anon';
    else
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', ids->>c.quien, 'role', 'authenticated')::text, true);
    end if;

    n := null;
    begin
      if c.espera ~ '^-?[0-9]+$' then
        execute c.consulta into n;
      else
        execute c.consulta;
        get diagnostics n = row_count;
      end if;
      raise exception 'deshacer-caso';
    exception when others then
      if sqlerrm <> 'deshacer-caso' then n := -1; end if;
    end;

    obtenido := case when c.espera ~ '^-?[0-9]+$' then coalesce(n, -1)::text
                     when coalesce(n, -1) > 0 then 'ok' else 'no' end;
    if obtenido <> c.espera then
      fallos := fallos || format('%s · %s: esperaba %s y fue %s', c.quien, c.descr, c.espera, obtenido);
    end if;
  end loop;

  execute 'reset role';
  raise exception E'RESULTADO: % comprobaciones, % fallos\n%', total, cardinality(fallos), array_to_string(fallos, E'\n');
end
$prueba$;
