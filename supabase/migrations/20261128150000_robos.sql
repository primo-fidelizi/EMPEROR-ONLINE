-- =====================================================================
-- Robôs (NPCs): jogadores automáticos.
-- São contas de verdade (perfil + território), mas SEM senha: ninguém faz login com elas.
-- NÃO TRAPACEIAM: cada turno chama as MESMAS RPCs de um jogador humano
-- (subir_tudo, recrutar, enviar_crew), com as mesmas regras, custos e proteção.
-- =====================================================================

alter table public.profiles add column is_bot boolean not null default false;

create table public.bots (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  perfil text not null check (perfil in ('construtor', 'saqueador', 'equilibrado')),
  ativo boolean not null default true,
  ultima_acao_em timestamptz
);
alter table public.bots enable row level security;
revoke all on public.bots from anon, authenticated; -- sem política: invisível para o cliente

insert into public.game_config (chave, valor) values
('robos', '{
  "perfis": {
    "construtor":  {"fracao_recrutar": 0.2, "chance_ataque": 0.25, "poder_minimo": 150, "so_abandonados": true},
    "equilibrado": {"fracao_recrutar": 0.4, "chance_ataque": 0.5,  "poder_minimo": 120, "so_abandonados": false},
    "saqueador":   {"fracao_recrutar": 0.6, "chance_ataque": 0.8,  "poder_minimo": 100, "so_abandonados": false}
  },
  "raio_alvo": 10,
  "max_lote": 200
}'::jsonb);

-- ---------------------------------------------------------------------
-- Executa um trecho "como se fosse o robô": auth.uid() passa a ser ele.
-- ---------------------------------------------------------------------
create function public._como(p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
$$;

-- ---------------------------------------------------------------------
-- Um turno de um robô num território. Cada passo isolado: se um falhar
-- (ex.: falta grana), os outros continuam.
-- ---------------------------------------------------------------------
create function public._bot_turno(p_terr uuid, p_perfil text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cfg jsonb := public._config('robos');
  v_p jsonb := v_cfg -> 'perfis' -> p_perfil;
  v_feito jsonb := '{}'::jsonb;
  v_eco public.territory_economy;
  v_tipo text;
  v_def jsonb;
  v_qtd integer;
  v_casa jsonb;
  v_crew jsonb;
  v_alvo uuid;
  v_eu uuid;
  v_t public.territories;
begin
  select * into v_t from public.territories where id = p_terr;
  v_eu := v_t.dono_id;

  -- 1) Economia: sobe o que der (o saqueador às vezes guarda grana para crew).
  if p_perfil <> 'saqueador' or random() < 0.5 then
    begin
      v_feito := v_feito || jsonb_build_object('subidos', (public.subir_tudo(p_terr) ->> 'subidos')::integer);
    exception when others then
      v_feito := v_feito || jsonb_build_object('subir_erro', sqlerrm);
    end;
  end if;

  -- 2) Crew: recruta a unidade de ataque mais forte liberada, gastando uma fração dos recursos.
  begin
    select u.key, u.value into v_tipo, v_def
    from jsonb_each(public._config('unidades')) u
    where public._nivel(p_terr, 'garagem') >= (u.value ->> 'garagem')::integer
      and (u.value ->> 'ataque')::numeric > 0
    order by (u.value ->> 'ataque')::numeric desc
    limit 1;

    if v_tipo is not null and (select count(*) from public.recruit_queue where territory_id = p_terr) < 2 then
      select * into v_eco from public.territory_economy where territory_id = p_terr;
      v_qtd := floor(least(
        v_eco.cash * (v_p ->> 'fracao_recrutar')::numeric / nullif((v_def -> 'custo' ->> 'cash')::numeric, 0),
        v_eco.material * (v_p ->> 'fracao_recrutar')::numeric / nullif((v_def -> 'custo' ->> 'material')::numeric, 0),
        v_eco.influencia * (v_p ->> 'fracao_recrutar')::numeric / nullif((v_def -> 'custo' ->> 'influencia')::numeric, 0),
        (v_cfg ->> 'max_lote')::numeric
      ));
      if v_qtd >= 1 then
        perform public.recrutar(p_terr, v_tipo, v_qtd);
        v_feito := v_feito || jsonb_build_object('recrutou', jsonb_build_object(v_tipo, v_qtd));
      end if;
    end if;
  exception when others then
    v_feito := v_feito || jsonb_build_object('recrutar_erro', sqlerrm);
  end;

  -- 3) Ataque: no máximo um ataque na rua por vez; vai com toda a crew ofensiva e metade dos seguranças.
  begin
    if not exists (select 1 from public.movements where origem_id = p_terr and tipo = 'ataque')
       and random() < (v_p ->> 'chance_ataque')::numeric then
      v_casa := public._unidades_json(p_terr);
      select coalesce(jsonb_object_agg(k, q), '{}'::jsonb) into v_crew
      from (
        select key as k,
               case when key = 'seguranca' then (value)::integer / 2 else (value)::integer end as q
        from jsonb_each_text(v_casa)
        where key <> 'olheiro'
      ) x
      where q > 0;

      if public._atributo(v_crew, 'ataque') >= (v_p ->> 'poder_minimo')::numeric then
        -- Um dos 3 alvos válidos mais próximos (sorteado, para não ficar previsível).
        select id into v_alvo from (
          select t.id
          from public.territories t
          left join public.world_players wp on wp.world_id = t.world_id and wp.user_id = t.dono_id
          where t.world_id = v_t.world_id
            and t.id <> p_terr
            and t.dono_id is distinct from v_eu
            and abs(t.x - v_t.x) <= (v_cfg ->> 'raio_alvo')::integer
            and abs(t.y - v_t.y) <= (v_cfg ->> 'raio_alvo')::integer
            and (t.dono_id is null or (
                  not (v_p ->> 'so_abandonados')::boolean
                  and wp.entrou_em <= now() - make_interval(hours => (public._config('combate') ->> 'protecao_iniciante_h')::integer)))
          order by power(t.x - v_t.x, 2) + power(t.y - v_t.y, 2)
          limit 3
        ) c
        order by random()
        limit 1;

        if v_alvo is not null then
          perform public.enviar_crew(p_terr, v_alvo, 'ataque', v_crew);
          v_feito := v_feito || jsonb_build_object('atacou', v_alvo);
        end if;
      end if;
    end if;
  exception when others then
    v_feito := v_feito || jsonb_build_object('atacar_erro', sqlerrm);
  end;

  return v_feito;
end;
$$;

-- ---------------------------------------------------------------------
-- Roda um turno para cada robô (chamado pelo pg_cron). Um robô com
-- problema nunca trava os outros.
-- ---------------------------------------------------------------------
create function public._rodar_bots(p_limite integer default 100)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b record;
  v_qtd integer := 0;
begin
  for v_b in
    select b.user_id, b.perfil, t.id as terr
    from public.bots b
    join public.territories t on t.dono_id = b.user_id
    join public.worlds w on w.id = t.world_id
    where b.ativo and w.status <> 'encerrado'
    order by b.ultima_acao_em nulls first, t.id
    limit p_limite
  loop
    begin
      perform public._como(v_b.user_id);
      perform public._bot_turno(v_b.terr, v_b.perfil);
      v_qtd := v_qtd + 1;
    exception when others then
      raise notice 'robô % falhou: %', v_b.user_id, sqlerrm;
    end;
    update public.bots set ultima_acao_em = now() where user_id = v_b.user_id;
  end loop;
  perform public._como(null);
  return v_qtd;
end;
$$;

-- ---------------------------------------------------------------------
-- Cria um robô: conta sem senha + perfil marcado + entrada no mundo.
-- Robôs não têm proteção de iniciante (podem ser atacados desde já).
-- ---------------------------------------------------------------------
create function public._criar_bot(p_world uuid, p_username text, p_perfil text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (v_id, p_username || '@robos.costaneon.invalid', jsonb_build_object('username', p_username));

  update public.profiles set is_bot = true where id = v_id;
  insert into public.bots (user_id, perfil) values (v_id, p_perfil);

  perform public._como(v_id);
  perform public.entrar_no_mundo(p_world);
  perform public._como(null);

  update public.world_players
  set entrou_em = now() - make_interval(hours => (public._config('combate') ->> 'protecao_iniciante_h')::integer + 1)
  where world_id = p_world and user_id = v_id;

  return v_id;
end;
$$;

-- Para administradores (SQL Editor do Supabase): cria N robôs num mundo.
create function public.admin_criar_bots(p_world uuid, p_qtd integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nomes text[] := array[
    'tubarao_do_porto', 'rainha_da_praia', 'zeca_turbo', 'dona_marisa', 'maresia_crew',
    'neon_vandal', 'capitao_sardinha', 'lua_de_neon', 'gaivota_brava', 'mestre_do_pier',
    'chinelo_veloz', 'coqueiro_sinistro', 'onda_braba', 'dj_caranguejo', 'patins_de_ouro'
  ];
  v_perfis text[] := array['construtor', 'saqueador', 'equilibrado'];
  v_criados integer := 0;
  v_i integer := 0;
  v_nome text;
begin
  while v_criados < p_qtd and v_i < 200 loop
    v_i := v_i + 1;
    v_nome := v_nomes[1 + (v_i - 1) % array_length(v_nomes, 1)]
              || case when v_i > array_length(v_nomes, 1) then '_' || ((v_i - 1) / array_length(v_nomes, 1) + 1)::text else '' end;
    continue when exists (select 1 from public.profiles where username = v_nome);
    perform public._criar_bot(p_world, v_nome, v_perfis[1 + v_criados % 3]);
    v_criados := v_criados + 1;
  end loop;
  return v_criados;
end;
$$;

-- ---------------------------------------------------------------------
-- Mapa passa a dizer quem é robô (muda o formato do retorno: recria).
-- ---------------------------------------------------------------------
drop function public.mapa_regiao(uuid, integer, integer, integer, integer);

create function public.mapa_regiao(p_world uuid, p_x0 integer, p_y0 integer, p_x1 integer, p_y1 integer)
returns table (
  id uuid, x integer, y integer, nome text, bairro public.bairro,
  dono_id uuid, dono text, pontos integer, protegido boolean, meu boolean, bot boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'nao_autenticado' using errcode = '28000';
  end if;
  if p_x1 < p_x0 or p_y1 < p_y0 or p_x1 - p_x0 > 80 or p_y1 - p_y0 > 80 then
    raise exception 'regiao_invalida' using errcode = 'P0001';
  end if;
  return query
    select t.id, t.x, t.y, t.nome, t.bairro, t.dono_id, p.username, wp.pontos,
           coalesce(wp.entrou_em > now() - make_interval(hours => (public._config('combate') ->> 'protecao_iniciante_h')::integer), false),
           t.dono_id = auth.uid(),
           coalesce(p.is_bot, false)
    from public.territories t
    left join public.profiles p on p.id = t.dono_id
    left join public.world_players wp on wp.world_id = t.world_id and wp.user_id = t.dono_id
    where t.world_id = p_world
      and t.x between p_x0 and p_x1
      and t.y between p_y0 and p_y1;
end;
$$;

-- ---------------------------------------------------------------------
-- Permissões: nada disso é chamável pelo cliente (exceto o mapa).
-- ---------------------------------------------------------------------
revoke execute on function public._como(uuid) from public, anon, authenticated;
revoke execute on function public._bot_turno(uuid, text) from public, anon, authenticated;
revoke execute on function public._rodar_bots(integer) from public, anon, authenticated;
revoke execute on function public._criar_bot(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.admin_criar_bots(uuid, integer) from public, anon, authenticated;
revoke execute on function public.mapa_regiao(uuid, integer, integer, integer, integer) from public, anon;
grant execute on function public.mapa_regiao(uuid, integer, integer, integer, integer) to authenticated;

-- ---------------------------------------------------------------------
-- 8 robôs na Temporada 1 (se ela existir e ainda não tiver robôs).
-- Os testes automáticos ligam app.sem_robos para começar de um mundo limpo.
-- ---------------------------------------------------------------------
do $$
declare
  v_world uuid;
begin
  if current_setting('app.sem_robos', true) = '1' then
    return;
  end if;
  select id into v_world from public.worlds where slug = 't1' and status <> 'encerrado';
  if v_world is not null and not exists (select 1 from public.bots) then
    perform public.admin_criar_bots(v_world, 8);
  end if;
end $$;
