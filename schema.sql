-- Esquema PostgreSQL para Supabase (AcroDocs Cloud)
-- Referencia para la etapa 2 (servidor): refleja el modelo v7 que hoy vive en el
-- navegador (localStorage/IndexedDB). Todavía no está conectado a la app.
-- Modelo: un contrato = un expediente jerárquico de hitos.
-- Los hitos fijos y recurrentes se generan al registrar el contrato.
-- Los trámites eventuales (ampliación, adicional, cambio de personal, etc.)
-- se agregan como filas de tramite_items con tipo = 'eventual'.
-- Ejecutar en el SQL Editor de Supabase.

create table if not exists usuarios (
  id bigserial primary key,
  usuario text unique not null,
  nombre text not null,
  salt text not null,
  hash text not null,
  rol text not null check (rol in ('gerente','socio','jefe','residente','asis_tec','asis_adm','finanzas','legal','consulta')),
  area text,
  activo boolean not null default true,
  creado timestamptz not null default now()
);

create table if not exists tramites (
  id bigserial primary key,
  codigo text unique not null,
  entidad text,
  denominacion text not null,
  procedimiento text,
  numero_contrato text,
  contratista text,                       -- legado; el ejecutor vigente va en `ejecutor`
  ejecutor jsonb not null default '{"tipo":"empresa"}'::jsonb,  -- {tipo:'empresa'} o {tipo:'consorcio', nombre, ruc, representante, integrantes:[{razonSocial, ruc, participacion}]}
  ruc text,
  tipo_objeto text not null default 'Obra' check (tipo_objeto in ('Obra','Consultoría de obra')),
  area text,
  moneda text default 'PEN',
  monto numeric,
  plazo_dias integer,
  fecha_suscripcion date,
  fecha_inicio date,
  fecha_fin date,
  estado text not null default 'En ejecución',
  observaciones text,
  config_fianzas jsonb not null default '{}'::jsonb,
  creado_por text,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);

create table if not exists tramite_items (
  id bigserial primary key,
  tramite_id bigint not null references tramites(id) on delete cascade,
  codigo text not null,
  nombre text not null,
  etapa_codigo text not null,
  etapa_nombre text not null,
  seccion_codigo text not null,
  seccion_nombre text not null,
  tipo text not null default 'fijo' check (tipo in ('fijo','recurrente','eventual','propio','opcional')),
  plantilla text,
  clave_plantilla text,
  clave_eventual text,
  doc_cumplimiento text,
  tipo_fianza text,
  estado text not null default 'Pendiente',
  responsable text,
  fecha date,
  fecha_limite date,
  observacion text,
  docs_requeridos jsonb not null default '[]'::jsonb,
  plazo_dias integer not null default 0,
  plazo_base text not null default 'inicio',
  plazo_habiles boolean not null default true,
  norma text,
  nota text,
  pasos jsonb not null default '[]'::jsonb,        -- pasos del trámite (copia de la plantilla del catálogo)
  plazo_levantamiento jsonb,                       -- {dias, habiles} para levantar observaciones
  recurrente boolean not null default false,
  frecuencia text,
  dia_limite integer,
  periodo text,
  silencio_positivo boolean not null default false,
  dias_silencio integer not null default 0,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now(),
  unique (tramite_id, codigo)
);

-- Obsoleta en v7: las plantillas de documentos se fundieron en el catálogo (config, clave 'catalogo').
create table if not exists plantillas_documentos (
  clave text primary key,
  docs jsonb not null default '[]'::jsonb,
  cumplimiento text,
  actualizado timestamptz not null default now()
);

create table if not exists adjuntos (
  id bigserial primary key,
  tramite_id bigint not null references tramites(id) on delete cascade,
  item_id bigint not null references tramite_items(id) on delete cascade,
  tipo_doc text not null,
  nombre_original text not null,
  storage_path text not null,
  mime text,
  tamano integer,
  subido_por text,
  subido timestamptz not null default now(),
  version_de bigint references adjuntos(id) on delete cascade,  -- el documento vigente al que reemplazó esta versión
  reemplazado timestamptz
);

create table if not exists historial (
  id bigserial primary key,
  tramite_id bigint references tramites(id) on delete cascade,
  item_id bigint,
  usuario text,
  usuario_id bigint,
  objeto text,                              -- hito, contrato, catalogo, permisos, usuarios, empresa, movimiento, cargo
  objeto_id text,
  accion text not null,
  detalle text,
  fecha timestamptz not null default now()
);

create table if not exists feriados (
  fecha date primary key,
  descripcion text
);

create table if not exists config (
  clave text primary key,
  valor text
);

-- El catálogo completo (etapas, hitos, documentos, plazos y pasos) se guarda como un
-- documento JSON en config: clave 'catalogo'. Se edita desde la pantalla Catálogo.

create table if not exists empresa (
  id integer primary key default 1 check (id = 1),
  razon_social text not null default '',
  ruc text not null default ''
);

-- Matriz de permisos por rol (editable por el gerente y los socios).
create table if not exists permisos_roles (
  rol text not null check (rol in ('gerente','socio','jefe','residente','asis_tec','asis_adm','finanzas','legal','consulta')),
  permiso text not null,
  primary key (rol, permiso)
);

-- Contratos asignados a los usuarios que no tienen el permiso ver_todos.
create table if not exists usuario_contratos (
  usuario_id bigint not null references usuarios(id) on delete cascade,
  tramite_id bigint not null references tramites(id) on delete cascade,
  primary key (usuario_id, tramite_id)
);

-- Cargos de mesa de partes: el sello de recepción de cada documento presentado.
create table if not exists cargos (
  id bigserial primary key,
  fecha date not null,
  hora text,
  entidad text not null,
  oficina text,
  numero_registro text not null,
  asunto text not null,
  tipo_documento text not null default 'carta' check (tipo_documento in ('carta','oficio','solicitud','informe','otro')),
  numero_documento text,
  emisor text not null default 'empresa',   -- 'empresa' o el id del contrato en consorcio
  emisor_nombre text,
  presentado_por text,
  tramite_id bigint references tramites(id) on delete set null,
  item_id bigint references tramite_items(id) on delete set null,
  hito_codigo text,
  paso_clave text,
  movimiento_id bigint,
  archivo_cargo_path text,
  registrado_por bigint references usuarios(id),
  registrado timestamptz not null default now(),
  anulado boolean not null default false,
  anulado_por text,
  motivo_anulacion text
);

-- Movimientos de un hito con pasos: hechos con fecha y documento. Nunca se borran:
-- se anulan, y el flujo se recalcula con los que quedan.
create table if not exists movimientos (
  id bigserial primary key,
  tramite_id bigint not null references tramites(id) on delete cascade,
  item_id bigint not null references tramite_items(id) on delete cascade,
  paso_clave text not null,
  ciclo integer not null default 0,
  tipo text not null check (tipo in ('asiento','presentado','observado','levantado','conformidad','pronunciamiento','otro')),
  fecha date not null,
  hora text,
  numero_documento text,
  asiento_co text,
  cargo_id bigint references cargos(id) on delete set null,
  archivo_path text,
  archivo_nombre text,
  nota text,
  usuario text,
  usuario_id bigint references usuarios(id),
  registrado timestamptz not null default now(),
  anulado boolean not null default false,
  anulado_por text,
  motivo_anulacion text
);
alter table cargos add constraint cargos_movimiento_fk foreign key (movimiento_id) references movimientos(id) on delete set null;

create index if not exists idx_movimientos_item on movimientos(item_id);
create index if not exists idx_cargos_fecha on cargos(fecha);
create index if not exists idx_cargos_tramite on cargos(tramite_id);

create index if not exists idx_tramite_items_tramite on tramite_items(tramite_id);
create index if not exists idx_tramite_items_etapa on tramite_items(tramite_id, etapa_codigo, seccion_codigo);
create index if not exists idx_tramite_items_plazo on tramite_items(fecha_limite) where estado <> 'Completado';
create index if not exists idx_adjuntos_item on adjuntos(item_id);
create index if not exists idx_historial_tramite on historial(tramite_id);

-- RLS: habilitar y crear políticas según el rol de la app.
alter table tramites enable row level security;
alter table tramite_items enable row level security;
alter table adjuntos enable row level security;
alter table movimientos enable row level security;
alter table cargos enable row level security;
-- (Añadir políticas reales según el mapeo de roles de Supabase Auth.)

-- Bucket de archivos: crear en Supabase Storage con el nombre "adjuntos".
-- Ruta sugerida: tramites/{tramite_id}/items/{item_id}/{archivo_id}-{nombre}
