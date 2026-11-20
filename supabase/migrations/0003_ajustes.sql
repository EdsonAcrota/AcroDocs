-- Aviso del linter: fijar el search_path de la función del sello de modificación.
-- (Las funciones SECURITY DEFINER ejecutables por `authenticated` son intencionales:
-- las reglas RLS las usan y solo revelan datos del propio usuario que llama.)
alter function public.tocar() set search_path = public;
