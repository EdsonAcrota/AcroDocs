-- Un cargo de mesa de partes puede registrarse sin contrato (store.js lo permite: tramiteId nulo).
alter table public.cargos alter column tramite_id drop not null;
