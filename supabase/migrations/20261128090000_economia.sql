-- =====================================================================
-- Fase 2: economia
-- Recursos lazy (base + taxa × tempo, limitado pelo armazém), negócios, fila de obras.
-- Fórmulas e números ficam em game_config (balancear sem deploy).
-- Toda escrita por RPC security definer; leitura de economia só pelo dono.
-- =====================================================================

-- ---------- Configuração do jogo ----------
create table public.game_config (
  chave text primary key,
  valor jsonb not null,
  atualizado_em timestamptz not null default now()
);

insert into public.game_config (chave, valor) values
('economia', '{
  "recursos_iniciais": {"cash": 500, "material": 500, "influencia": 300},
  "producao_minima_h": 10,
  "armazem_minimo": 1000,
  "fila_max": 5,
  "pontos_por_nivel": 10
}'::jsonb),
('negocios', '{
  "torre_radio": {
    "ordem": 1, "nome": "Torre de rádio",
    "descricao": "Coordena a área. Cada nível deixa as obras 5% mais rápidas.",
    "nivel_inicial": 1, "max_nivel": 20,
    "custo": {"cash": 90, "material": 80, "influencia": 70}, "fator_custo": 1.26,
    "tempo_s": 60, "fator_tempo": 1.18,
    "efeito": {"tipo": "obra", "reducao": 0.05}
  },
  "boate": {
    "ordem": 2, "nome": "Boate",
    "descricao": "Música alta, caixa cheio. Produz Cash.",
    "nivel_inicial": 1, "max_nivel": 25,
    "custo": {"cash": 50, "material": 60, "influencia": 40}, "fator_custo": 1.26,
    "tempo_s": 40, "fator_tempo": 1.18,
    "efeito": {"tipo": "producao", "recurso": "cash", "base": 60, "fator": 1.17}
  },
  "oficina": {
    "ordem": 3, "nome": "Oficina",
    "descricao": "Solda, sucata e peças. Produz Material.",
    "nivel_inicial": 1, "max_nivel": 25,
    "custo": {"cash": 65, "material": 50, "influencia": 40}, "fator_custo": 1.26,
    "tempo_s": 40, "fator_tempo": 1.18,
    "efeito": {"tipo": "producao", "recurso": "material", "base": 60, "fator": 1.17}
  },
  "escritorio": {
    "ordem": 4, "nome": "Escritório",
    "descricao": "Contatos, favores e papelada. Produz Influência.",
    "nivel_inicial": 1, "max_nivel": 25,
    "custo": {"cash": 75, "material": 65, "influencia": 30}, "fator_custo": 1.26,
    "tempo_s": 45, "fator_tempo": 1.18,
    "efeito": {"tipo": "producao", "recurso": "influencia", "base": 50, "fator": 1.17}
  },
  "doca": {
    "ordem": 5, "nome": "Doca",
    "descricao": "Contêineres no cais. Aumenta o armazém de todos os recursos.",
    "nivel_inicial": 1, "max_nivel": 25,
    "custo": {"cash": 60, "material": 50, "influencia": 40}, "fator_custo": 1.26,
    "tempo_s": 45, "fator_tempo": 1.18,
    "efeito": {"tipo": "armazem", "base": 1000, "fator": 1.25}
  },
  "garagem": {
    "ordem": 6, "nome": "Garagem",
    "descricao": "Onde a crew vai ser recrutada (chega numa fase futura).",
    "nivel_inicial": 0, "max_nivel": 20,
    "custo": {"cash": 200, "material": 170, "influencia": 90}, "fator_custo": 1.26,
    "tempo_s": 90, "fator_tempo": 1.2,
    "requisitos": {"torre_radio": 3},
    "efeito": {"tipo": "crew"}
  }
}'::jsonb);

-- ---------- Economia de cada território (só o dono lê) ----------
create table public.territory_economy (
  territory_id uuid primary key references public.territories (id) on delete cascade,
  cash numeric not null default 0 check (cash >= 0),
  material numeric not null default 0 check (material >= 0),
  influencia numeric not null default 0 check (influencia >= 0),
  atualizado_em timestamptz not null default now()
);

-- ---------- Negócios construídos ----------
create table public.buildings (
  territory_id uuid not null references public.territories (id) on delete cascade,
  tipo text not null check (tipo ~ '^[a-z_]{2,30}$'),
  nivel integer not null check (nivel >= 0),
  primary key (territory_id, tipo)
);

-- ---------- Fila de obras ----------
create table public.build_queue (
  id bigint generated always as identity primary key,
  territory_id uuid not null references public.territories (id) on delete cascade,
  tipo text not null,
  nivel_alvo integer not null check (nivel_alvo >= 1),
  inicia_em timestamptz not null,
  termina_em timestamptz not null,
  check (termina_em > inicia_em)
);
create index build_queue_territorio_idx on public.build_queue (territory_id, termina_em);
create index build_queue_termina_idx on public.build_queue (termina_em);

-- ---------- Segurança ----------
alter table public.game_config enable row level security;
alter table public.territory_economy enable row level security;
alter table public.buildings enable row level security;
alter table public.build_queue enable row level security;

revoke insert, update, delete, truncate on
  public.game_config, public.territory_economy, public.buildings, public.build_queue
  from anon, authenticated;

create policy "config é pública" on public.game_config
  for select to anon, authenticated using (true);

create policy "economia só do dono" on public.territory_economy
  for select to authenticated using (
    exists (select 1 from public.territories t where t.id = territory_id and t.dono_id = (select auth.uid()))
  );

create policy "negócios só do dono" on public.buildings
  for select to authenticated using (
    exists (select 1 from public.territories t where t.id = territory_id and t.dono_id = (select auth.uid()))
  );

create policy "fila só do dono" on public.build_queue
  for select to authenticated using (
    exists (select 1 from public.territories t where t.id = territory_id and t.dono_id = (select auth.uid()))
  );

-- =====================================================================
-- Funções internas (ninguém de fora executa)
-- =====================================================================

create function public._config(p_chave text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select valor from public.game_config where chave = p_chave;
$$;

-- Taxas por hora, capacidade do armazém e redução do tempo de obra, a partir dos níveis atuais.
create function public._taxas(
  p_territorio uuid,
  out cash_h numeric,
  out material_h numeric,
  out influencia_h numeric,
  out capacidade numeric,
  out reducao_obra numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_velocidade numeric;
  v_economia jsonb := public._config('economia');
  v_negocio record;
  v_efeito jsonb;
  v_nivel integer;
  v_valor numeric;
begin
  select w.velocidade into v_velocidade
  from public.territories t join public.worlds w on w.id = t.world_id
  where t.id = p_territorio;

  cash_h := (v_economia ->> 'producao_minima_h')::numeric;
  material_h := cash_h;
  influencia_h := cash_h;
  capacidade := (v_economia ->> 'armazem_minimo')::numeric;
  reducao_obra := 0;

  for v_negocio in select key as tipo, value as def from jsonb_each(public._config('negocios')) loop
    select coalesce(max(b.nivel), 0) into v_nivel
    from public.buildings b where b.territory_id = p_territorio and b.tipo = v_negocio.tipo;
    continue when v_nivel = 0;

    v_efeito := v_negocio.def -> 'efeito';
    if v_efeito ->> 'tipo' = 'producao' then
      v_valor := (v_efeito ->> 'base')::numeric * power((v_efeito ->> 'fator')::numeric, v_nivel - 1);
      if v_efeito ->> 'recurso' = 'cash' then cash_h := greatest(cash_h, v_valor);
      elsif v_efeito ->> 'recurso' = 'material' then material_h := greatest(material_h, v_valor);
      elsif v_efeito ->> 'recurso' = 'influencia' then influencia_h := greatest(influencia_h, v_valor);
      end if;
    elsif v_efeito ->> 'tipo' = 'armazem' then
      capacidade := greatest(capacidade, (v_efeito ->> 'base')::numeric * power((v_efeito ->> 'fator')::numeric, v_nivel));
    elsif v_efeito ->> 'tipo' = 'obra' then
      reducao_obra := 1 - power(1 - (v_efeito ->> 'reducao')::numeric, v_nivel - 1);
    end if;
  end loop;

  cash_h := cash_h * v_velocidade;
  material_h := material_h * v_velocidade;
  influencia_h := influencia_h * v_velocidade;
end;
$$;

-- Produz recursos de atualizado_em até p_ate, com as taxas atuais, sem passar do armazém.
-- Nunca reduz o que já existe (se o armazém estiver acima do limite, só para de crescer).
create function public._acumular(p_territorio uuid, p_ate timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tx record;
  v_horas numeric;
begin
  select extract(epoch from (p_ate - atualizado_em)) / 3600.0 into v_horas
  from public.territory_economy where territory_id = p_territorio;
  if v_horas is null or v_horas <= 0 then
    return; -- nada a produzir (ou relógio voltando: nunca "desproduz")
  end if;

  select * into v_tx from public._taxas(p_territorio);

  update public.territory_economy
  set cash = greatest(cash, least(v_tx.capacidade, cash + v_tx.cash_h * v_horas)),
      material = greatest(material, least(v_tx.capacidade, material + v_tx.material_h * v_horas)),
      influencia = greatest(influencia, least(v_tx.capacidade, influencia + v_tx.influencia_h * v_horas)),
      atualizado_em = p_ate
  where territory_id = p_territorio;
end;
$$;

-- Recalcula os pontos do jogador no mundo (soma dos níveis × pontos_por_nivel).
create function public._recalcular_pontos(p_world uuid, p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.world_players wp
  set pontos = (
    select coalesce(sum(b.nivel), 0)::integer * (public._config('economia') ->> 'pontos_por_nivel')::integer
    from public.territories t join public.buildings b on b.territory_id = t.id
    where t.world_id = p_world and t.dono_id = p_user
  )
  where wp.world_id = p_world and wp.user_id = p_user;
$$;

-- Coloca o território em dia: conclui as obras vencidas EM ORDEM (produzindo com a taxa certa
-- em cada trecho de tempo) e depois produz até agora. Supõe a linha do território travada.
create function public._sincronizar(p_territorio uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_obra record;
  v_concluiu boolean := false;
  v_world uuid;
  v_dono uuid;
begin
  for v_obra in
    select * from public.build_queue
    where territory_id = p_territorio and termina_em <= now()
    order by termina_em, id
  loop
    perform public._acumular(p_territorio, v_obra.termina_em);
    insert into public.buildings (territory_id, tipo, nivel)
    values (p_territorio, v_obra.tipo, v_obra.nivel_alvo)
    on conflict (territory_id, tipo) do update set nivel = greatest(public.buildings.nivel, excluded.nivel);
    delete from public.build_queue where id = v_obra.id;
    v_concluiu := true;
  end loop;

  perform public._acumular(p_territorio, now());

  if v_concluiu then
    select world_id, dono_id into v_world, v_dono from public.territories where id = p_territorio;
    if v_dono is not null then
      perform public._recalcular_pontos(v_world, v_dono);
    end if;
  end if;
end;
$$;

-- Trava o território, confere o dono e coloca em dia. Ponto de entrada de toda RPC da economia.
create function public._abrir_territorio(p_territorio uuid)
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

-- Nível que o negócio terá depois de tudo que já está na fila.
create function public._nivel_planejado(p_territorio uuid, p_tipo text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(
    coalesce((select nivel from public.buildings where territory_id = p_territorio and tipo = p_tipo), 0),
    coalesce((select max(nivel_alvo) from public.build_queue where territory_id = p_territorio and tipo = p_tipo), 0)
  );
$$;

create function public._custo(p_tipo text, p_nivel_alvo integer)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'cash', round((d -> 'custo' ->> 'cash')::numeric * power((d ->> 'fator_custo')::numeric, p_nivel_alvo - 1)),
    'material', round((d -> 'custo' ->> 'material')::numeric * power((d ->> 'fator_custo')::numeric, p_nivel_alvo - 1)),
    'influencia', round((d -> 'custo' ->> 'influencia')::numeric * power((d ->> 'fator_custo')::numeric, p_nivel_alvo - 1))
  )
  from (select public._config('negocios') -> p_tipo as d) x;
$$;

create function public._tempo_obra(p_territorio uuid, p_tipo text, p_nivel_alvo integer)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(1, round(
    (d ->> 'tempo_s')::numeric * power((d ->> 'fator_tempo')::numeric, p_nivel_alvo - 1)
    * (1 - tx.reducao_obra) / w.velocidade
  ))::integer
  from (select public._config('negocios') -> p_tipo as d) x,
       public._taxas(p_territorio) tx,
       public.territories t join public.worlds w on w.id = t.world_id
  where t.id = p_territorio;
$$;

-- Requisito não cumprido (texto para a tela) ou null se está liberado. Usa níveis JÁ CONSTRUÍDOS.
create function public._requisito_pendente(p_territorio uuid, p_tipo text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select string_agg(
    coalesce(public._config('negocios') -> r.key ->> 'nome', r.key) || ' nível ' || r.value,
    ', ' order by r.key
  )
  from jsonb_each_text(coalesce(public._config('negocios') -> p_tipo -> 'requisitos', '{}'::jsonb)) r
  where coalesce((select nivel from public.buildings b where b.territory_id = p_territorio and b.tipo = r.key), 0)
        < r.value::integer;
$$;

-- Coloca uma obra na fila: valida, cobra e agenda. Supõe território aberto (travado e em dia).
create function public._enfileirar(p_territorio uuid, p_tipo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_def jsonb := public._config('negocios') -> p_tipo;
  v_fila_max integer := (public._config('economia') ->> 'fila_max')::integer;
  v_alvo integer;
  v_custo jsonb;
  v_eco public.territory_economy;
  v_inicio timestamptz;
begin
  if v_def is null then
    raise exception 'negocio_inexistente' using errcode = 'P0001';
  end if;
  if (select count(*) from public.build_queue where territory_id = p_territorio) >= v_fila_max then
    raise exception 'fila_cheia' using errcode = 'P0001';
  end if;

  v_alvo := public._nivel_planejado(p_territorio, p_tipo) + 1;
  if v_alvo > (v_def ->> 'max_nivel')::integer then
    raise exception 'nivel_maximo' using errcode = 'P0001';
  end if;
  if public._requisito_pendente(p_territorio, p_tipo) is not null then
    raise exception 'requisito_pendente' using errcode = 'P0001';
  end if;

  v_custo := public._custo(p_tipo, v_alvo);
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

  -- Obras são em sequência: a nova começa quando a última da fila terminar.
  select greatest(now(), coalesce(max(termina_em), now())) into v_inicio
  from public.build_queue where territory_id = p_territorio;

  insert into public.build_queue (territory_id, tipo, nivel_alvo, inicia_em, termina_em)
  values (
    p_territorio, p_tipo, v_alvo, v_inicio,
    v_inicio + make_interval(secs => public._tempo_obra(p_territorio, p_tipo, v_alvo))
  );
end;
$$;

-- Fotografia completa do território para a tela (supõe território aberto).
create function public._estado(p_territorio uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_eco public.territory_economy;
  v_tx record;
  v_negocios jsonb;
  v_fila jsonb;
begin
  select * into v_eco from public.territory_economy where territory_id = p_territorio;
  select * into v_tx from public._taxas(p_territorio);

  select coalesce(jsonb_agg(item order by (item ->> 'ordem')::integer), '[]'::jsonb) into v_negocios
  from (
    select jsonb_build_object(
      'tipo', n.key,
      'ordem', (n.value ->> 'ordem')::integer,
      'nome', n.value ->> 'nome',
      'descricao', n.value ->> 'descricao',
      'nivel', coalesce(b.nivel, 0),
      'nivel_planejado', public._nivel_planejado(p_territorio, n.key),
      'max_nivel', (n.value ->> 'max_nivel')::integer,
      'requisito', public._requisito_pendente(p_territorio, n.key),
      'proximo', case
        when public._nivel_planejado(p_territorio, n.key) >= (n.value ->> 'max_nivel')::integer then null
        else jsonb_build_object(
          'nivel', public._nivel_planejado(p_territorio, n.key) + 1,
          'custo', public._custo(n.key, public._nivel_planejado(p_territorio, n.key) + 1),
          'tempo_s', public._tempo_obra(p_territorio, n.key, public._nivel_planejado(p_territorio, n.key) + 1)
        )
      end
    ) as item
    from jsonb_each(public._config('negocios')) n
    left join public.buildings b on b.territory_id = p_territorio and b.tipo = n.key
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', q.id, 'tipo', q.tipo, 'nivel_alvo', q.nivel_alvo,
    'inicia_em', q.inicia_em, 'termina_em', q.termina_em
  ) order by q.termina_em, q.id), '[]'::jsonb) into v_fila
  from public.build_queue q where q.territory_id = p_territorio;

  return jsonb_build_object(
    'territorio_id', p_territorio,
    'agora', now(),
    'recursos', jsonb_build_object('cash', v_eco.cash, 'material', v_eco.material, 'influencia', v_eco.influencia),
    'taxas_h', jsonb_build_object('cash', v_tx.cash_h, 'material', v_tx.material_h, 'influencia', v_tx.influencia_h),
    'capacidade', v_tx.capacidade,
    'negocios', v_negocios,
    'fila', v_fila,
    'fila_max', (public._config('economia') ->> 'fila_max')::integer
  );
end;
$$;

-- =====================================================================
-- Território novo já nasce com economia e negócios iniciais
-- (vale para jogadores agora e para territórios abandonados na Fase 3).
-- =====================================================================
create function public.preparar_territorio_novo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ini jsonb := public._config('economia') -> 'recursos_iniciais';
begin
  insert into public.territory_economy (territory_id, cash, material, influencia)
  values (new.id, (v_ini ->> 'cash')::numeric, (v_ini ->> 'material')::numeric, (v_ini ->> 'influencia')::numeric);

  insert into public.buildings (territory_id, tipo, nivel)
  select new.id, n.key, (n.value ->> 'nivel_inicial')::integer
  from jsonb_each(public._config('negocios')) n
  where (n.value ->> 'nivel_inicial')::integer > 0;

  return new;
end;
$$;

create trigger ao_criar_territorio
  after insert on public.territories
  for each row execute function public.preparar_territorio_novo();

-- Territórios que já existiam (criados na Fase 1) ganham economia agora.
insert into public.territory_economy (territory_id, cash, material, influencia)
select t.id,
       (public._config('economia') -> 'recursos_iniciais' ->> 'cash')::numeric,
       (public._config('economia') -> 'recursos_iniciais' ->> 'material')::numeric,
       (public._config('economia') -> 'recursos_iniciais' ->> 'influencia')::numeric
from public.territories t
on conflict (territory_id) do nothing;

insert into public.buildings (territory_id, tipo, nivel)
select t.id, n.key, (n.value ->> 'nivel_inicial')::integer
from public.territories t cross join jsonb_each(public._config('negocios')) n
where (n.value ->> 'nivel_inicial')::integer > 0
on conflict (territory_id, tipo) do nothing;

select public._recalcular_pontos(t.world_id, t.dono_id)
from public.territories t where t.dono_id is not null;

-- =====================================================================
-- RPCs do jogador
-- =====================================================================

create function public.estado_territorio(p_territorio uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._abrir_territorio(p_territorio);
  return public._estado(p_territorio);
end;
$$;

create function public.construir(p_territorio uuid, p_tipo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_tipo is null or length(p_tipo) > 30 then
    raise exception 'negocio_inexistente' using errcode = 'P0001';
  end if;
  perform public._abrir_territorio(p_territorio);
  perform public._registrar_acao(auth.uid(), 'construir');
  perform public._enfileirar(p_territorio, p_tipo);
  return public._estado(p_territorio);
end;
$$;

-- "Subir tudo que dá": enche a fila com a obra mais barata que dá para pagar, de novo e de novo.
create function public.subir_tudo(p_territorio uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fila_max integer := (public._config('economia') ->> 'fila_max')::integer;
  v_eco public.territory_economy;
  v_escolhido text;
  v_subidos integer := 0;
begin
  perform public._abrir_territorio(p_territorio);
  perform public._registrar_acao(auth.uid(), 'subir_tudo');

  loop
    exit when (select count(*) from public.build_queue where territory_id = p_territorio) >= v_fila_max;
    select * into v_eco from public.territory_economy where territory_id = p_territorio;

    select c.tipo into v_escolhido
    from (
      select n.key as tipo,
             public._custo(n.key, public._nivel_planejado(p_territorio, n.key) + 1) as custo,
             (n.value ->> 'ordem')::integer as ordem
      from jsonb_each(public._config('negocios')) n
      where public._nivel_planejado(p_territorio, n.key) < (n.value ->> 'max_nivel')::integer
        and public._requisito_pendente(p_territorio, n.key) is null
    ) c
    where (c.custo ->> 'cash')::numeric <= v_eco.cash
      and (c.custo ->> 'material')::numeric <= v_eco.material
      and (c.custo ->> 'influencia')::numeric <= v_eco.influencia
    order by (c.custo ->> 'cash')::numeric + (c.custo ->> 'material')::numeric + (c.custo ->> 'influencia')::numeric,
             c.ordem
    limit 1;

    exit when v_escolhido is null;
    perform public._enfileirar(p_territorio, v_escolhido);
    v_subidos := v_subidos + 1;
    v_escolhido := null;
  end loop;

  return public._estado(p_territorio) || jsonb_build_object('subidos', v_subidos);
end;
$$;

-- Usado pelo pg_cron: conclui obras vencidas de todos os territórios (para ranking em dia).
create function public.processar_obras_vencidas(p_limite integer default 500)
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
-- Permissões
-- =====================================================================
revoke execute on function public._config(text) from public, anon, authenticated;
revoke execute on function public._taxas(uuid) from public, anon, authenticated;
revoke execute on function public._acumular(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public._recalcular_pontos(uuid, uuid) from public, anon, authenticated;
revoke execute on function public._sincronizar(uuid) from public, anon, authenticated;
revoke execute on function public._abrir_territorio(uuid) from public, anon, authenticated;
revoke execute on function public._nivel_planejado(uuid, text) from public, anon, authenticated;
revoke execute on function public._custo(text, integer) from public, anon, authenticated;
revoke execute on function public._tempo_obra(uuid, text, integer) from public, anon, authenticated;
revoke execute on function public._requisito_pendente(uuid, text) from public, anon, authenticated;
revoke execute on function public._enfileirar(uuid, text) from public, anon, authenticated;
revoke execute on function public._estado(uuid) from public, anon, authenticated;
revoke execute on function public.preparar_territorio_novo() from public, anon, authenticated;
revoke execute on function public.processar_obras_vencidas(integer) from public, anon, authenticated;

revoke execute on function public.estado_territorio(uuid) from public, anon;
revoke execute on function public.construir(uuid, text) from public, anon;
revoke execute on function public.subir_tudo(uuid) from public, anon;
grant execute on function public.estado_territorio(uuid) to authenticated;
grant execute on function public.construir(uuid, text) to authenticated;
grant execute on function public.subir_tudo(uuid) to authenticated;
