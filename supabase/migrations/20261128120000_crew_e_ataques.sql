-- =====================================================================
-- Fases 3+4 (primeira entrega): crew, territórios abandonados, movimentos,
-- batalha, saque, espionagem e relatórios.
-- Regras: tudo por RPC; batalhas resolvidas em ORDEM CRONOLÓGICA, por um único
-- processador por vez (advisory lock), de forma lazy e também pelo pg_cron.
-- =====================================================================

-- ---------- Configuração ----------
insert into public.game_config (chave, valor) values
('unidades', '{
  "olheiro": {
    "ordem": 1, "nome": "Olheiro", "descricao": "Vê sem ser visto. Manda para espionar.",
    "custo": {"cash": 40, "material": 30, "influencia": 20}, "tempo_s": 20,
    "ataque": 0, "defesa": 2, "min_por_campo": 0.5, "carga": 0, "garagem": 1
  },
  "seguranca": {
    "ordem": 2, "nome": "Segurança", "descricao": "Barra quem tentar entrar. Forte na defesa.",
    "custo": {"cash": 50, "material": 30, "influencia": 10}, "tempo_s": 25,
    "ataque": 10, "defesa": 25, "min_por_campo": 2, "carga": 20, "garagem": 1
  },
  "piloto": {
    "ordem": 3, "nome": "Piloto", "descricao": "Rápido e de porta-malas grande. Nasceu para o saque.",
    "custo": {"cash": 80, "material": 40, "influencia": 30}, "tempo_s": 40,
    "ataque": 25, "defesa": 5, "min_por_campo": 1, "carga": 60, "garagem": 2
  },
  "blindado": {
    "ordem": 4, "nome": "Blindado", "descricao": "Lento e pesado. Abre caminho no ataque.",
    "custo": {"cash": 150, "material": 180, "influencia": 60}, "tempo_s": 70,
    "ataque": 60, "defesa": 20, "min_por_campo": 3, "carga": 30, "garagem": 4
  }
}'::jsonb),
('combate', '{
  "defesa_base": 20,
  "expoente_perdas": 1.5,
  "protecao_iniciante_h": 48,
  "recrutamento_max": 5,
  "max_por_lote": 5000,
  "crew_inicial": {"seguranca": 10, "olheiro": 3},
  "reducao_garagem": 0.05
}'::jsonb),
('abandonados', '{
  "por_jogador": 3,
  "raio_min": 2,
  "raio_max": 6,
  "seguranca_min": 0,
  "seguranca_max": 4
}'::jsonb);

-- ---------- Tabelas ----------
create table public.units (
  territory_id uuid not null references public.territories (id) on delete cascade,
  tipo text not null,
  quantidade integer not null default 0 check (quantidade >= 0),
  primary key (territory_id, tipo)
);

create table public.recruit_queue (
  id bigint generated always as identity primary key,
  territory_id uuid not null references public.territories (id) on delete cascade,
  tipo text not null,
  quantidade integer not null check (quantidade > 0),
  inicia_em timestamptz not null,
  termina_em timestamptz not null,
  check (termina_em > inicia_em)
);
create index recruit_queue_territorio_idx on public.recruit_queue (territory_id, termina_em);
create index recruit_queue_termina_idx on public.recruit_queue (termina_em);

create table public.movements (
  id bigint generated always as identity primary key,
  world_id uuid not null references public.worlds (id) on delete cascade,
  dono_id uuid not null references public.profiles (id) on delete cascade,
  origem_id uuid not null references public.territories (id) on delete cascade,
  destino_id uuid not null references public.territories (id) on delete cascade,
  tipo text not null check (tipo in ('ataque', 'espionagem', 'retorno')),
  unidades jsonb not null,
  saque jsonb not null default '{"cash":0,"material":0,"influencia":0}'::jsonb,
  sai_em timestamptz not null,
  chega_em timestamptz not null,
  check (chega_em > sai_em)
);
create index movements_chega_idx on public.movements (chega_em, id);
create index movements_destino_idx on public.movements (destino_id, chega_em);
create index movements_dono_idx on public.movements (dono_id, chega_em);

create table public.reports (
  id bigint generated always as identity primary key,
  world_id uuid not null references public.worlds (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  tipo text not null,
  titulo text not null,
  dados jsonb not null,
  lido boolean not null default false,
  criado_em timestamptz not null default now()
);
create index reports_user_criado_idx on public.reports (user_id, criado_em desc);

-- ---------- Segurança ----------
alter table public.units enable row level security;
alter table public.recruit_queue enable row level security;
alter table public.movements enable row level security;
alter table public.reports enable row level security;

revoke insert, update, delete, truncate on
  public.units, public.recruit_queue, public.movements, public.reports
  from anon, authenticated;

-- Crew alheia NUNCA aparece (só por relatório de espionagem).
create policy "crew só do dono" on public.units
  for select to authenticated using (
    exists (select 1 from public.territories t where t.id = territory_id and t.dono_id = (select auth.uid()))
  );
create policy "recrutamento só do dono" on public.recruit_queue
  for select to authenticated using (
    exists (select 1 from public.territories t where t.id = territory_id and t.dono_id = (select auth.uid()))
  );
-- Movimentos: só os próprios. Ataques chegando aparecem por RPC, sem revelar a crew.
create policy "movimentos próprios" on public.movements
  for select to authenticated using (dono_id = (select auth.uid()));
create policy "relatórios próprios" on public.reports
  for select to authenticated using (user_id = (select auth.uid()));

-- =====================================================================
-- Funções de apoio para crew (internas)
-- =====================================================================

-- Crew de um território como objeto {tipo: quantidade} (só quantidades > 0).
create function public._unidades_json(p_territorio uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(tipo, quantidade), '{}'::jsonb)
  from public.units where territory_id = p_territorio and quantidade > 0;
$$;

-- Soma (ou subtrai, com sinal negativo) crew num território.
-- Subtrair usa UPDATE: o CHECK (quantidade >= 0) é avaliado na linha proposta de um INSERT.
create function public._somar_unidades(p_territorio uuid, p_unidades jsonb, p_sinal integer default 1)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_sinal >= 0 then
    insert into public.units (territory_id, tipo, quantidade)
    select p_territorio, u.key, (u.value)::integer
    from jsonb_each_text(p_unidades) u
    on conflict (territory_id, tipo)
    do update set quantidade = public.units.quantidade + excluded.quantidade;
  else
    update public.units t
    set quantidade = t.quantidade - (u.value)::integer
    from jsonb_each_text(p_unidades) u
    where t.territory_id = p_territorio and t.tipo = u.key;
  end if;
end;
$$;

-- Soma de um atributo (ataque, defesa, carga) de uma crew.
create function public._atributo(p_unidades jsonb, p_campo text)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum((u.value)::numeric * (public._config('unidades') -> u.key ->> p_campo)::numeric), 0)
  from jsonb_each_text(p_unidades) u;
$$;

-- Sobreviventes depois de perder a fração p_perda (arredondada, determinística).
create function public._sobreviventes(p_unidades jsonb, p_perda numeric)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(u.key, v.vivos) filter (where v.vivos > 0), '{}'::jsonb)
  from jsonb_each_text(p_unidades) u,
       lateral (select (u.value)::integer - round((u.value)::integer * least(1, greatest(0, p_perda)))::integer as vivos) v;
$$;

create function public._total(p_unidades jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select coalesce(sum((value)::integer), 0)::integer from jsonb_each_text(p_unidades);
$$;

-- Diferença entre dois conjuntos de crew (perdas = antes − depois).
create function public._diferenca(p_antes jsonb, p_depois jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(a.key, (a.value)::integer - coalesce((p_depois ->> a.key)::integer, 0))
                  filter (where (a.value)::integer - coalesce((p_depois ->> a.key)::integer, 0) > 0), '{}'::jsonb)
  from jsonb_each_text(p_antes) a;
$$;

-- Valida a crew vinda do cliente: só tipos conhecidos, inteiros positivos. Devolve só os > 0.
create function public._validar_crew(p_unidades jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_limpo jsonb := '{}'::jsonb;
  v_qtd numeric;
begin
  if p_unidades is null or jsonb_typeof(p_unidades) <> 'object' then
    raise exception 'crew_invalida' using errcode = 'P0001';
  end if;
  for v_item in select key, value from jsonb_each(p_unidades) loop
    if public._config('unidades') -> v_item.key is null or jsonb_typeof(v_item.value) <> 'number' then
      raise exception 'crew_invalida' using errcode = 'P0001';
    end if;
    v_qtd := (v_item.value #>> '{}')::numeric;
    if v_qtd < 0 or v_qtd <> floor(v_qtd) or v_qtd > 1000000 then
      raise exception 'crew_invalida' using errcode = 'P0001';
    end if;
    if v_qtd > 0 then
      v_limpo := v_limpo || jsonb_build_object(v_item.key, v_qtd::integer);
    end if;
  end loop;
  if v_limpo = '{}'::jsonb then
    raise exception 'crew_vazia' using errcode = 'P0001';
  end if;
  return v_limpo;
end;
$$;

create function public._nivel(p_territorio uuid, p_tipo text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select nivel from public.buildings where territory_id = p_territorio and tipo = p_tipo), 0);
$$;

-- Duração da viagem: distância × minutos por campo da unidade MAIS LENTA ÷ velocidade do mundo.
create function public._duracao_viagem(p_origem uuid, p_destino uuid, p_unidades jsonb)
returns interval
language sql
stable
security definer
set search_path = ''
as $$
  select make_interval(secs => greatest(1, round(
    sqrt(power(o.x - d.x, 2) + power(o.y - d.y, 2))
    * (select max((public._config('unidades') -> u.key ->> 'min_por_campo')::numeric)
       from jsonb_each_text(p_unidades) u where (u.value)::integer > 0)
    * 60 / w.velocidade)))
  from public.territories o
  join public.territories d on d.id = p_destino
  join public.worlds w on w.id = o.world_id
  where o.id = p_origem;
$$;

create function public._criar_relatorio(p_world uuid, p_user uuid, p_tipo text, p_titulo text, p_dados jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.reports (world_id, user_id, tipo, titulo, dados)
  values (p_world, p_user, p_tipo, p_titulo, p_dados);
$$;

-- Ficha curta de um território para relatórios.
create function public._ficha(p_territorio uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', t.id, 'nome', t.nome, 'x', t.x, 'y', t.y,
    'dono', coalesce(p.username, null)
  )
  from public.territories t left join public.profiles p on p.id = t.dono_id
  where t.id = p_territorio;
$$;

-- =====================================================================
-- Sincronização: agora também conclui recrutamentos.
-- A versão antiga (só obras) vira _sincronizar_obras.
-- =====================================================================
alter function public._sincronizar(uuid) rename to _sincronizar_obras;

create function public._sincronizar(p_territorio uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote record;
begin
  perform public._sincronizar_obras(p_territorio);

  for v_lote in
    select * from public.recruit_queue
    where territory_id = p_territorio and termina_em <= now()
    order by termina_em, id
  loop
    perform public._somar_unidades(p_territorio, jsonb_build_object(v_lote.tipo, v_lote.quantidade));
    delete from public.recruit_queue where id = v_lote.id;
  end loop;
end;
$$;

-- =====================================================================
-- Resolução de movimentos (sempre em ordem de chegada)
-- =====================================================================

create function public._resolver_ataque(p_mov bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.movements;
  v_alvo public.territories;
  v_cfg jsonb := public._config('combate');
  v_atk jsonb;
  v_def jsonb;
  v_pa numeric;
  v_pd numeric;
  v_vence boolean;
  v_atk_vivos jsonb;
  v_def_vivos jsonb;
  v_eco public.territory_economy;
  v_carga numeric;
  v_total numeric;
  v_fator numeric;
  v_saque jsonb := '{"cash":0,"material":0,"influencia":0}'::jsonb;
  v_dados jsonb;
begin
  select * into m from public.movements where id = p_mov;
  select * into v_alvo from public.territories where id = m.destino_id for update;
  perform public._sincronizar(m.destino_id);

  v_atk := m.unidades;
  v_def := public._unidades_json(m.destino_id);
  v_pa := public._atributo(v_atk, 'ataque');
  v_pd := public._atributo(v_def, 'defesa') + (v_cfg ->> 'defesa_base')::numeric;
  v_vence := v_pa > v_pd;

  if v_vence then
    v_atk_vivos := public._sobreviventes(v_atk, power(v_pd / v_pa, (v_cfg ->> 'expoente_perdas')::numeric));
    v_def_vivos := '{}'::jsonb;
  else
    v_atk_vivos := '{}'::jsonb;
    v_def_vivos := public._sobreviventes(v_def, power(v_pa / v_pd, (v_cfg ->> 'expoente_perdas')::numeric));
  end if;

  update public.units u
  set quantidade = coalesce((v_def_vivos ->> u.tipo)::integer, 0)
  where u.territory_id = m.destino_id;

  -- Saque: quem vence leva o que couber, proporcional ao que o alvo tem.
  v_carga := public._atributo(v_atk_vivos, 'carga');
  if v_vence and v_carga > 0 then
    select * into v_eco from public.territory_economy where territory_id = m.destino_id;
    v_total := floor(v_eco.cash) + floor(v_eco.material) + floor(v_eco.influencia);
    if v_total > 0 then
      v_fator := least(1, v_carga / v_total);
      v_saque := jsonb_build_object(
        'cash', floor(floor(v_eco.cash) * v_fator),
        'material', floor(floor(v_eco.material) * v_fator),
        'influencia', floor(floor(v_eco.influencia) * v_fator)
      );
      update public.territory_economy
      set cash = cash - (v_saque ->> 'cash')::numeric,
          material = material - (v_saque ->> 'material')::numeric,
          influencia = influencia - (v_saque ->> 'influencia')::numeric
      where territory_id = m.destino_id;
    end if;
  end if;

  if public._total(v_atk_vivos) > 0 then
    insert into public.movements (world_id, dono_id, origem_id, destino_id, tipo, unidades, saque, sai_em, chega_em)
    values (m.world_id, m.dono_id, m.destino_id, m.origem_id, 'retorno', v_atk_vivos, v_saque,
            m.chega_em, m.chega_em + (m.chega_em - m.sai_em));
  end if;

  v_dados := jsonb_build_object(
    'chegou_em', m.chega_em,
    'vencedor', case when v_vence then 'atacante' else 'defensor' end,
    'atacante', public._ficha(m.origem_id) || jsonb_build_object(
      'enviados', v_atk, 'perdas', public._diferenca(v_atk, v_atk_vivos), 'poder', v_pa),
    'defensor', public._ficha(m.destino_id) || jsonb_build_object(
      'crew', v_def, 'perdas', public._diferenca(v_def, v_def_vivos), 'poder', v_pd),
    'saque', v_saque
  );

  perform public._criar_relatorio(m.world_id, m.dono_id, 'ataque',
    (case when v_vence then 'Vitória em ' else 'Derrota em ' end) || v_alvo.nome, v_dados);
  if v_alvo.dono_id is not null then
    perform public._criar_relatorio(m.world_id, v_alvo.dono_id, 'defesa',
      (case when v_vence then 'Seu território foi invadido: ' else 'Ataque barrado em ' end) || v_alvo.nome, v_dados);
  end if;
end;
$$;

create function public._resolver_espionagem(p_mov bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.movements;
  v_alvo public.territories;
  v_espioes integer;
  v_vigias integer;
  v_sucesso boolean;
  v_eco public.territory_economy;
  v_dados jsonb;
begin
  select * into m from public.movements where id = p_mov;
  select * into v_alvo from public.territories where id = m.destino_id for update;
  perform public._sincronizar(m.destino_id);

  v_espioes := coalesce((m.unidades ->> 'olheiro')::integer, 0);
  v_vigias := coalesce((public._unidades_json(m.destino_id) ->> 'olheiro')::integer, 0);
  v_sucesso := v_espioes > v_vigias;

  if v_sucesso then
    select * into v_eco from public.territory_economy where territory_id = m.destino_id;
    v_dados := jsonb_build_object(
      'chegou_em', m.chega_em, 'sucesso', true,
      'alvo', public._ficha(m.destino_id),
      'recursos', jsonb_build_object('cash', floor(v_eco.cash), 'material', floor(v_eco.material),
                                     'influencia', floor(v_eco.influencia)),
      'crew', public._unidades_json(m.destino_id),
      'negocios', (select coalesce(jsonb_object_agg(tipo, nivel), '{}'::jsonb)
                   from public.buildings where territory_id = m.destino_id)
    );
    insert into public.movements (world_id, dono_id, origem_id, destino_id, tipo, unidades, sai_em, chega_em)
    values (m.world_id, m.dono_id, m.destino_id, m.origem_id, 'retorno', m.unidades,
            m.chega_em, m.chega_em + (m.chega_em - m.sai_em));
    perform public._criar_relatorio(m.world_id, m.dono_id, 'espionagem', 'Espionagem em ' || v_alvo.nome, v_dados);
  else
    v_dados := jsonb_build_object('chegou_em', m.chega_em, 'sucesso', false,
      'alvo', public._ficha(m.destino_id), 'perdas', m.unidades);
    perform public._criar_relatorio(m.world_id, m.dono_id, 'espionagem',
      'Olheiros pegos em ' || v_alvo.nome, v_dados);
    if v_alvo.dono_id is not null then
      perform public._criar_relatorio(m.world_id, v_alvo.dono_id, 'defesa',
        'Olheiros inimigos pegos em ' || v_alvo.nome,
        v_dados || jsonb_build_object('espiao', public._ficha(m.origem_id)));
    end if;
  end if;
end;
$$;

create function public._resolver_retorno(p_mov bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.movements;
  v_casa public.territories;
  v_cap numeric;
begin
  select * into m from public.movements where id = p_mov;
  select * into v_casa from public.territories where id = m.destino_id for update;
  -- Se a casa mudou de dono enquanto a crew voltava, a crew se dispersa.
  if v_casa.dono_id is distinct from m.dono_id then
    return;
  end if;

  perform public._sincronizar(m.destino_id);
  perform public._somar_unidades(m.destino_id, m.unidades);

  select capacidade into v_cap from public._taxas(m.destino_id);
  update public.territory_economy
  set cash = greatest(cash, least(v_cap, cash + (m.saque ->> 'cash')::numeric)),
      material = greatest(material, least(v_cap, material + (m.saque ->> 'material')::numeric)),
      influencia = greatest(influencia, least(v_cap, influencia + (m.saque ->> 'influencia')::numeric))
  where territory_id = m.destino_id;
end;
$$;

-- Processa movimentos que já chegaram, UM POR VEZ e em ordem de chegada.
-- Só um processador roda por vez no banco inteiro (advisory lock): garante a ordem.
create function public._processar_movimentos(p_limite integer default 200)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mov public.movements;
  v_qtd integer := 0;
begin
  if not pg_try_advisory_xact_lock(7347001) then
    return 0; -- outro processador já está trabalhando
  end if;

  loop
    exit when v_qtd >= p_limite;
    select * into v_mov from public.movements
    where chega_em <= now()
    order by chega_em, id
    limit 1;
    exit when not found;

    if v_mov.tipo = 'ataque' then
      perform public._resolver_ataque(v_mov.id);
    elsif v_mov.tipo = 'espionagem' then
      perform public._resolver_espionagem(v_mov.id);
    else
      perform public._resolver_retorno(v_mov.id);
    end if;

    delete from public.movements where id = v_mov.id;
    v_qtd := v_qtd + 1;
  end loop;
  return v_qtd;
end;
$$;

-- Toda RPC do jogador primeiro resolve o que já chegou (lazy), DEPOIS trava o próprio território.
-- (Nessa ordem não existe espera circular entre transações.)
create or replace function public._abrir_territorio(p_territorio uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dono uuid;
begin
  if auth.uid() is null then
    raise exception 'nao_autenticado' using errcode = '28000';
  end if;
  if p_territorio is null then
    raise exception 'territorio_inexistente' using errcode = 'P0001';
  end if;

  perform public._processar_movimentos(100);

  select dono_id into v_dono from public.territories where id = p_territorio for update;
  if not found then
    raise exception 'territorio_inexistente' using errcode = 'P0001';
  end if;
  if v_dono is distinct from auth.uid() then
    raise exception 'territorio_alheio' using errcode = 'P0001';
  end if;

  perform public._sincronizar(p_territorio);
end;
$$;

-- pg_cron: obras E recrutamentos vencidos de quem não está jogando.
create or replace function public.processar_obras_vencidas(p_limite integer default 500)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_territorio uuid;
  v_qtd integer := 0;
begin
  for v_territorio in
    select t.id from public.territories t
    where exists (select 1 from public.build_queue q where q.territory_id = t.id and q.termina_em <= now())
       or exists (select 1 from public.recruit_queue r where r.territory_id = t.id and r.termina_em <= now())
    order by t.id
    limit p_limite
    for update of t skip locked
  loop
    perform public._sincronizar(v_territorio);
    v_qtd := v_qtd + 1;
  end loop;
  return v_qtd;
end;
$$;

-- =====================================================================
-- Estado: economia + crew numa foto só. A versão antiga vira _estado_economia.
-- =====================================================================
alter function public._estado(uuid) rename to _estado_economia;

create function public._estado(p_territorio uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_terr public.territories;
  v_cfg jsonb := public._config('combate');
  v_garagem integer := public._nivel(p_territorio, 'garagem');
  v_vel numeric;
begin
  select * into v_terr from public.territories where id = p_territorio;
  select velocidade into v_vel from public.worlds where id = v_terr.world_id;

  return public._estado_economia(p_territorio) || jsonb_build_object(
    'world_id', v_terr.world_id,
    'posicao', jsonb_build_object('x', v_terr.x, 'y', v_terr.y),
    'unidades', public._unidades_json(p_territorio),
    'recrutamento_max', (v_cfg ->> 'recrutamento_max')::integer,
    'recrutamento', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'tipo', r.tipo, 'quantidade', r.quantidade,
        'inicia_em', r.inicia_em, 'termina_em', r.termina_em) order by r.termina_em, r.id), '[]'::jsonb)
      from public.recruit_queue r where r.territory_id = p_territorio),
    'tropas', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'tipo', u.key,
        'ordem', (u.value ->> 'ordem')::integer,
        'nome', u.value ->> 'nome',
        'descricao', u.value ->> 'descricao',
        'custo', u.value -> 'custo',
        'tempo_s', greatest(1, round((u.value ->> 'tempo_s')::numeric
                   * power(1 - (v_cfg ->> 'reducao_garagem')::numeric, greatest(v_garagem - 1, 0)) / v_vel))::integer,
        'ataque', (u.value ->> 'ataque')::numeric,
        'defesa', (u.value ->> 'defesa')::numeric,
        'carga', (u.value ->> 'carga')::numeric,
        'min_por_campo', (u.value ->> 'min_por_campo')::numeric,
        'garagem', (u.value ->> 'garagem')::integer,
        'liberado', v_garagem >= (u.value ->> 'garagem')::integer
      ) order by (u.value ->> 'ordem')::integer), '[]'::jsonb)
      from jsonb_each(public._config('unidades')) u),
    'movimentos', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', mv.id, 'tipo', mv.tipo, 'unidades', mv.unidades, 'saque', mv.saque,
        'sai_em', mv.sai_em, 'chega_em', mv.chega_em,
        'alvo', public._ficha(case when mv.tipo = 'retorno' then mv.origem_id else mv.destino_id end)
      ) order by mv.chega_em, mv.id), '[]'::jsonb)
      from public.movements mv
      where mv.dono_id = v_terr.dono_id
        and ((mv.tipo <> 'retorno' and mv.origem_id = p_territorio)
          or (mv.tipo = 'retorno' and mv.destino_id = p_territorio))),
    'chegando', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'chega_em', mv.chega_em, 'origem', public._ficha(mv.origem_id)
      ) order by mv.chega_em), '[]'::jsonb)
      from public.movements mv
      where mv.destino_id = p_territorio and mv.tipo = 'ataque' and mv.dono_id <> v_terr.dono_id),
    'relatorios_nao_lidos', (
      select count(*) from public.reports
      where user_id = v_terr.dono_id and world_id = v_terr.world_id and not lido)
  );
end;
$$;

-- =====================================================================
-- Territórios abandonados e crew inicial
-- =====================================================================
create function public._gerar_abandonados(p_world uuid, p_cx integer, p_cy integer, p_qtd integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cfg jsonb := public._config('abandonados');
  v_tam integer;
  v_criados integer := 0;
  v_tent integer := 0;
  v_ang double precision;
  v_dist numeric;
  v_x integer;
  v_y integer;
  v_id uuid;
  v_seg integer;
begin
  select tamanho_mapa into v_tam from public.worlds where id = p_world;
  while v_criados < p_qtd and v_tent < p_qtd * 40 loop
    v_tent := v_tent + 1;
    v_ang := random() * 2 * pi();
    v_dist := (v_cfg ->> 'raio_min')::numeric
              + random() * ((v_cfg ->> 'raio_max')::numeric - (v_cfg ->> 'raio_min')::numeric);
    v_x := round(p_cx + v_dist * cos(v_ang));
    v_y := round(p_cy + v_dist * sin(v_ang));
    continue when v_x < 0 or v_y < 0 or v_x >= v_tam or v_y >= v_tam;
    continue when exists (select 1 from public.territories where world_id = p_world and x = v_x and y = v_y);

    insert into public.territories (world_id, x, y, bairro, dono_id, nome)
    values (p_world, v_x, v_y, public.bairro_de(v_x, v_y, v_tam), null, 'Terreno abandonado')
    returning id into v_id;

    v_seg := (v_cfg ->> 'seguranca_min')::integer
             + floor(random() * ((v_cfg ->> 'seguranca_max')::integer - (v_cfg ->> 'seguranca_min')::integer + 1))::integer;
    if v_seg > 0 then
      perform public._somar_unidades(v_id, jsonb_build_object('seguranca', v_seg));
    end if;
    v_criados := v_criados + 1;
  end loop;
  return v_criados;
end;
$$;

-- entrar_no_mundo ganha: crew inicial + abandonados perto (só na primeira entrada).
alter function public.entrar_no_mundo(uuid) rename to _entrar_no_mundo_base;
revoke execute on function public._entrar_no_mundo_base(uuid) from public, anon, authenticated;

create function public.entrar_no_mundo(p_world_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_terr uuid := public._entrar_no_mundo_base(p_world_id);
  v_novo boolean;
  v_t public.territories;
begin
  -- entrou_em = now() só na transação em que o jogador acabou de entrar.
  select wp.entrou_em = now() into v_novo
  from public.world_players wp where wp.world_id = p_world_id and wp.user_id = auth.uid();

  if v_novo then
    select * into v_t from public.territories where id = v_terr;
    perform public._somar_unidades(v_terr, public._config('combate') -> 'crew_inicial');
    perform public._gerar_abandonados(p_world_id, v_t.x, v_t.y,
      (public._config('abandonados') ->> 'por_jogador')::integer);
  end if;
  return v_terr;
end;
$$;

-- Jogadores que já existiam ganham crew inicial e vizinhos abandonados.
do $$
declare
  v_t record;
begin
  for v_t in select * from public.territories where dono_id is not null loop
    if not exists (select 1 from public.units where territory_id = v_t.id) then
      perform public._somar_unidades(v_t.id, public._config('combate') -> 'crew_inicial');
      perform public._gerar_abandonados(v_t.world_id, v_t.x, v_t.y,
        (public._config('abandonados') ->> 'por_jogador')::integer);
    end if;
  end loop;
end $$;

-- =====================================================================
-- RPCs do jogador
-- =====================================================================

create function public.recrutar(p_territorio uuid, p_tipo text, p_quantidade integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_def jsonb;
  v_cfg jsonb := public._config('combate');
  v_eco public.territory_economy;
  v_custo jsonb;
  v_vel numeric;
  v_seg numeric;
  v_inicio timestamptz;
begin
  if p_tipo is null or length(p_tipo) > 30 or public._config('unidades') -> p_tipo is null then
    raise exception 'unidade_inexistente' using errcode = 'P0001';
  end if;
  if p_quantidade is null or p_quantidade < 1 or p_quantidade > (v_cfg ->> 'max_por_lote')::integer then
    raise exception 'quantidade_invalida' using errcode = 'P0001';
  end if;

  perform public._abrir_territorio(p_territorio);
  perform public._registrar_acao(auth.uid(), 'recrutar');

  v_def := public._config('unidades') -> p_tipo;
  if public._nivel(p_territorio, 'garagem') < (v_def ->> 'garagem')::integer then
    raise exception 'requisito_pendente' using errcode = 'P0001';
  end if;
  if (select count(*) from public.recruit_queue where territory_id = p_territorio)
     >= (v_cfg ->> 'recrutamento_max')::integer then
    raise exception 'fila_cheia' using errcode = 'P0001';
  end if;

  v_custo := jsonb_build_object(
    'cash', (v_def -> 'custo' ->> 'cash')::numeric * p_quantidade,
    'material', (v_def -> 'custo' ->> 'material')::numeric * p_quantidade,
    'influencia', (v_def -> 'custo' ->> 'influencia')::numeric * p_quantidade);
  select * into v_eco from public.territory_economy where territory_id = p_territorio;
  if v_eco.cash < (v_custo ->> 'cash')::numeric
     or v_eco.material < (v_custo ->> 'material')::numeric
     or v_eco.influencia < (v_custo ->> 'influencia')::numeric then
    raise exception 'recursos_insuficientes' using errcode = 'P0001';
  end if;

  update public.territory_economy
  set cash = cash - (v_custo ->> 'cash')::numeric,
      material = material - (v_custo ->> 'material')::numeric,
      influencia = influencia - (v_custo ->> 'influencia')::numeric
  where territory_id = p_territorio;

  select w.velocidade into v_vel
  from public.territories t join public.worlds w on w.id = t.world_id where t.id = p_territorio;
  v_seg := greatest(1, round((v_def ->> 'tempo_s')::numeric * p_quantidade
           * power(1 - (v_cfg ->> 'reducao_garagem')::numeric,
                   greatest(public._nivel(p_territorio, 'garagem') - 1, 0)) / v_vel));

  select greatest(now(), coalesce(max(termina_em), now())) into v_inicio
  from public.recruit_queue where territory_id = p_territorio;

  insert into public.recruit_queue (territory_id, tipo, quantidade, inicia_em, termina_em)
  values (p_territorio, p_tipo, p_quantidade, v_inicio, v_inicio + make_interval(secs => v_seg));

  return public._estado(p_territorio);
end;
$$;

create function public.enviar_crew(p_origem uuid, p_destino uuid, p_tipo text, p_unidades jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_crew jsonb;
  v_orig public.territories;
  v_dest public.territories;
  v_item record;
  v_disponivel integer;
  v_protegido boolean;
begin
  if p_tipo is null or p_tipo not in ('ataque', 'espionagem') then
    raise exception 'tipo_invalido' using errcode = 'P0001';
  end if;
  v_crew := public._validar_crew(p_unidades);
  if p_tipo = 'espionagem' and exists (select 1 from jsonb_object_keys(v_crew) k where k <> 'olheiro') then
    raise exception 'so_olheiros' using errcode = 'P0001';
  end if;

  perform public._abrir_territorio(p_origem);
  perform public._registrar_acao(auth.uid(), 'enviar_crew');

  select * into v_orig from public.territories where id = p_origem;
  select * into v_dest from public.territories where id = p_destino;
  if not found or v_dest.world_id <> v_orig.world_id then
    raise exception 'alvo_inexistente' using errcode = 'P0001';
  end if;
  if v_dest.id = v_orig.id or v_dest.dono_id = auth.uid() then
    raise exception 'alvo_proprio' using errcode = 'P0001';
  end if;

  -- Proteção de iniciante: jogador novo não pode ser atacado nem espionado por outros jogadores.
  if v_dest.dono_id is not null then
    select wp.entrou_em > now() - make_interval(hours => (public._config('combate') ->> 'protecao_iniciante_h')::integer)
    into v_protegido
    from public.world_players wp where wp.world_id = v_dest.world_id and wp.user_id = v_dest.dono_id;
    if coalesce(v_protegido, false) then
      raise exception 'alvo_protegido' using errcode = 'P0001';
    end if;
  end if;

  for v_item in select key, (value)::integer as qtd from jsonb_each_text(v_crew) loop
    select coalesce(max(quantidade), 0) into v_disponivel
    from public.units where territory_id = p_origem and tipo = v_item.key;
    if v_disponivel < v_item.qtd then
      raise exception 'crew_insuficiente' using errcode = 'P0001';
    end if;
  end loop;

  perform public._somar_unidades(p_origem, v_crew, -1);

  insert into public.movements (world_id, dono_id, origem_id, destino_id, tipo, unidades, sai_em, chega_em)
  values (v_orig.world_id, auth.uid(), p_origem, p_destino, p_tipo, v_crew,
          now(), now() + public._duracao_viagem(p_origem, p_destino, v_crew));

  return public._estado(p_origem);
end;
$$;

-- Prévia do tempo de viagem (para a tela mostrar antes de enviar).
create function public.prever_viagem(p_origem uuid, p_destino uuid, p_unidades jsonb)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_crew jsonb := public._validar_crew(p_unidades);
begin
  if not exists (select 1 from public.territories where id = p_origem and dono_id = auth.uid()) then
    raise exception 'territorio_alheio' using errcode = 'P0001';
  end if;
  return extract(epoch from public._duracao_viagem(p_origem, p_destino, v_crew))::integer;
end;
$$;

create function public.marcar_relatorios_lidos(p_ids bigint[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.reports set lido = true
  where user_id = auth.uid() and id = any (coalesce(p_ids, '{}'::bigint[]));
$$;

-- Mapa: territórios numa região (máx. 81×81), com nome do dono e proteção. Sem crew, sem recursos.
create function public.mapa_regiao(p_world uuid, p_x0 integer, p_y0 integer, p_x1 integer, p_y1 integer)
returns table (
  id uuid, x integer, y integer, nome text, bairro public.bairro,
  dono_id uuid, dono text, pontos integer, protegido boolean, meu boolean
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
           t.dono_id = auth.uid()
    from public.territories t
    left join public.profiles p on p.id = t.dono_id
    left join public.world_players wp on wp.world_id = t.world_id and wp.user_id = t.dono_id
    where t.world_id = p_world
      and t.x between p_x0 and p_x1
      and t.y between p_y0 and p_y1;
end;
$$;

-- =====================================================================
-- Permissões
-- =====================================================================
revoke execute on function public._unidades_json(uuid) from public, anon, authenticated;
revoke execute on function public._somar_unidades(uuid, jsonb, integer) from public, anon, authenticated;
revoke execute on function public._atributo(jsonb, text) from public, anon, authenticated;
revoke execute on function public._sobreviventes(jsonb, numeric) from public, anon, authenticated;
revoke execute on function public._total(jsonb) from public, anon, authenticated;
revoke execute on function public._diferenca(jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public._validar_crew(jsonb) from public, anon, authenticated;
revoke execute on function public._nivel(uuid, text) from public, anon, authenticated;
revoke execute on function public._duracao_viagem(uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public._criar_relatorio(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public._ficha(uuid) from public, anon, authenticated;
revoke execute on function public._sincronizar(uuid) from public, anon, authenticated;
revoke execute on function public._sincronizar_obras(uuid) from public, anon, authenticated;
revoke execute on function public._resolver_ataque(bigint) from public, anon, authenticated;
revoke execute on function public._resolver_espionagem(bigint) from public, anon, authenticated;
revoke execute on function public._resolver_retorno(bigint) from public, anon, authenticated;
revoke execute on function public._processar_movimentos(integer) from public, anon, authenticated;
revoke execute on function public._estado(uuid) from public, anon, authenticated;
revoke execute on function public._estado_economia(uuid) from public, anon, authenticated;
revoke execute on function public._gerar_abandonados(uuid, integer, integer, integer) from public, anon, authenticated;
revoke execute on function public._abrir_territorio(uuid) from public, anon, authenticated;
revoke execute on function public.processar_obras_vencidas(integer) from public, anon, authenticated;

revoke execute on function public.entrar_no_mundo(uuid) from public, anon;
revoke execute on function public.recrutar(uuid, text, integer) from public, anon;
revoke execute on function public.enviar_crew(uuid, uuid, text, jsonb) from public, anon;
revoke execute on function public.prever_viagem(uuid, uuid, jsonb) from public, anon;
revoke execute on function public.marcar_relatorios_lidos(bigint[]) from public, anon;
revoke execute on function public.mapa_regiao(uuid, integer, integer, integer, integer) from public, anon;

grant execute on function public.entrar_no_mundo(uuid) to authenticated;
grant execute on function public.recrutar(uuid, text, integer) to authenticated;
grant execute on function public.enviar_crew(uuid, uuid, text, jsonb) to authenticated;
grant execute on function public.prever_viagem(uuid, uuid, jsonb) to authenticated;
grant execute on function public.marcar_relatorios_lidos(bigint[]) to authenticated;
grant execute on function public.mapa_regiao(uuid, integer, integer, integer, integer) to authenticated;
