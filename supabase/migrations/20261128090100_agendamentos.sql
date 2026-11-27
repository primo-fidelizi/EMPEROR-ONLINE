-- Jobs periódicos com pg_cron (Supabase). Fora do Supabase (ex.: testes), é ignorado.
do $do$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron indisponível: agendamentos não criados';
    return;
  end if;

  create extension if not exists pg_cron with schema pg_catalog;

  -- A cada minuto: conclui obras vencidas de todo mundo (ranking sempre em dia).
  execute $$select cron.schedule('processar-obras', '* * * * *',
    'select public.processar_obras_vencidas(500)')$$;

  -- Todo dia: limpa o log de ações (só serve para rate limit e auditoria recente).
  execute $$select cron.schedule('purgar-action-log', '23 4 * * *',
    $j$delete from public.action_log where criado_em < now() - interval '3 days'$j$)$$;
end
$do$;
