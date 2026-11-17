-- Esquema PostgreSQL para Supabase (AcroDocs Cloud)
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
  rol text not null check (rol in ('admin','logistica','area_usuaria','legal','lectura')),
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
  contratista text,
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
  subido timestamptz not null default now()
);

create table if not exists historial (
  id bigserial primary key,
  tramite_id bigint references tramites(id) on delete cascade,
  item_id bigint,
  usuario text,
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

create index if not exists idx_tramite_items_tramite on tramite_items(tramite_id);
create index if not exists idx_tramite_items_etapa on tramite_items(tramite_id, etapa_codigo, seccion_codigo);
create index if not exists idx_tramite_items_plazo on tramite_items(fecha_limite) where estado <> 'Completado';
create index if not exists idx_adjuntos_item on adjuntos(item_id);
create index if not exists idx_historial_tramite on historial(tramite_id);

-- RLS: habilitar y crear políticas según el rol de la app.
alter table tramites enable row level security;
alter table tramite_items enable row level security;
alter table adjuntos enable row level security;
-- (Añadir políticas reales según el mapeo de roles de Supabase Auth.)

-- Bucket de archivos: crear en Supabase Storage con el nombre "adjuntos".
-- Ruta sugerida: tramites/{tramite_id}/items/{item_id}/{archivo_id}-{nombre}
