-- pg_cron: um turno para cada robô a cada 2 minutos.
do $do$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron indisponível: robôs não agendados';
    return;
  end if;
  execute $$select cron.schedule('rodar-robos', '*/2 * * * *', 'select public._rodar_bots(100)')$$;
end
$do$;
