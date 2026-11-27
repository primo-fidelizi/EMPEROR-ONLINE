-- pg_cron: resolve chegadas de crew a cada minuto e limpa relatórios antigos.
do $do$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron indisponível: agendamentos de combate não criados';
    return;
  end if;

  execute $$select cron.schedule('processar-movimentos', '* * * * *',
    'select public._processar_movimentos(500)')$$;

  execute $$select cron.schedule('purgar-relatorios', '41 4 * * *',
    $j$delete from public.reports where criado_em < now() - interval '14 days'$j$)$$;
end
$do$;
