-- =====================================================================
-- Fase 1: contas e mundos
-- Tabelas: profiles, worlds, world_players, territories, action_log
-- Regras de ouro: RLS em tudo, leitura por política, escrita SÓ por RPC
-- security definer com search_path vazio e checagem de auth.uid().
-- =====================================================================

-- ---------- Tipos ----------
create type public.world_status as enum ('aberto', 'rodando', 'encerrado');
create type public.bairro as enum ('praia', 'centro', 'porto', 'ilhas', 'pantano');

-- ---------- Perfis ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  created_at timestamptz not null default now()
);

-- ---------- Mundos (servidores / temporadas) ----------
create table public.worlds (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(nome) between 3 and 60),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  status public.world_status not null default 'aberto',
  velocidade numeric not null default 1 check (velocidade > 0 and velocidade <= 1000),
  tamanho_mapa integer not null default 500 check (tamanho_mapa between 50 and 1000),
  inicia_em timestamptz not null default now(),
  termina_em timestamptz,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (termina_em is null or termina_em > inicia_em)
);

-- ---------- Jogadores por mundo ----------
create table public.world_players (
  world_id uuid not null references public.worlds (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  pontos integer not null default 0,
  sindicato_id uuid, -- FK entra na Fase 5 (sindicatos)
  entrou_em timestamptz not null default now(),
  primary key (world_id, user_id)
);

-- ---------- Territórios ----------
-- Recursos NÃO ficam aqui: o mapa é público dentro do mundo e recursos alheios são segredo.
-- A Fase 2 cria uma tabela de economia legível só pelo dono.
create table public.territories (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds (id) on delete cascade,
  x integer not null check (x >= 0),
  y integer not null check (y >= 0),
  bairro public.bairro not null,
  dono_id uuid references public.profiles (id) on delete set null,
  nome text not null check (char_length(nome) between 1 and 40),
  lealdade integer not null default 100 check (lealdade between 0 and 100),
  created_at timestamptz not null default now(),
  constraint territories_world_xy_unique unique (world_id, x, y) -- também é o índice (world_id, x, y)
);
create index territories_world_dono_idx on public.territories (world_id, dono_id);

-- ---------- Log de ações (rate limit e auditoria) ----------
create table public.action_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  acao text not null,
  criado_em timestamptz not null default now()
);
create index action_log_user_criado_idx on public.action_log (user_id, criado_em desc);

-- =====================================================================
-- Segurança: RLS ligado em TODAS as tabelas, padrão negar.
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.worlds enable row level security;
alter table public.world_players enable row level security;
alter table public.territories enable row level security;
alter table public.action_log enable row level security;

-- Nenhuma escrita direta pelo cliente, nem que alguém esqueça uma política no futuro.
revoke insert, update, delete, truncate on
  public.profiles, public.worlds, public.world_players, public.territories, public.action_log
  from anon, authenticated;
revoke select on public.action_log from anon, authenticated;

-- Leitura
create policy "mundos são públicos" on public.worlds
  for select to anon, authenticated using (true);

create policy "usernames visíveis para jogadores" on public.profiles
  for select to authenticated using (true);

create policy "jogadores do mundo visíveis (ranking)" on public.world_players
  for select to authenticated using (true);

create policy "mapa visível para jogadores" on public.territories
  for select to authenticated using (true);

-- action_log: sem política = ninguém lê nem escreve pelo cliente.

-- =====================================================================
-- Funções internas
-- =====================================================================

-- Bairro de uma coordenada (mapa dividido em faixas temáticas).
create function public.bairro_de(p_x integer, p_y integer, p_tamanho integer)
returns public.bairro
language sql
immutable
set search_path = ''
as $$
  select case
    when p_x::numeric / p_tamanho >= 0.8 then 'ilhas'::public.bairro
    when p_y::numeric / p_tamanho >= 0.75 then 'praia'::public.bairro
    when p_x::numeric / p_tamanho < 0.2 then 'porto'::public.bairro
    when p_y::numeric / p_tamanho < 0.2 then 'pantano'::public.bairro
    else 'centro'::public.bairro
  end;
$$;

-- Rate limit: registra a ação e barra mais de p_max ações por segundo do usuário.
create function public._registrar_acao(p_user uuid, p_acao text, p_max integer default 10)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_qtd integer;
begin
  select count(*) into v_qtd
  from public.action_log
  where user_id = p_user and criado_em > now() - interval '1 second';

  if v_qtd >= p_max then
    raise exception 'muitas_acoes' using errcode = 'P0001', hint = 'Espere um segundo e tente de novo.';
  end if;

  insert into public.action_log (user_id, acao) values (p_user, p_acao);
end;
$$;

-- Nomes reservados e palavrões. Espelha lib/conta.ts; AQUI é a regra que vale de verdade,
-- porque o cadastro é feito pelo navegador direto no Supabase Auth.
create function public.username_permitido(p_username text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  with n as (
    select lower(coalesce(p_username, '')) as u,
           replace(lower(coalesce(p_username, '')), '_', '') as base
  )
  select n.u ~ '^[a-z0-9_]{3,20}$'
     -- reservados: curtos só o nome exato; longos (5+) também variações como admin_2
     and not exists (
       select 1 from unnest(array[
         'admin','administrador','root','suporte','support','moderador','mod','sistema',
         'system','staff','oficial','costaneon','anthropic','claude'
       ]) r
       where n.base = r or (length(r) >= 5 and n.base like r || '%')
     )
     -- palavrões longos: em qualquer trecho
     and not exists (
       select 1 from unnest(array['porra','caralho','buceta','merda','cuzao','arrombado']) p
       where position(p in n.base) > 0
     )
     -- palavrões curtos: só como nome inteiro (com ou sem número no fim)
     and regexp_replace(n.base, '[0-9]+$', '') <> all (array['puta','foda','viado','fdp','cu','pau'])
  from n;
$$;

-- =====================================================================
-- Cadastro: trigger em auth.users cria o perfil com username único.
-- O username vem de raw_user_meta_data.username (enviado pela rota server).
-- =====================================================================
create function public.criar_perfil_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := lower(trim(new.raw_user_meta_data ->> 'username'));
begin
  if v_username is null or v_username !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'username_invalido' using errcode = 'P0001';
  end if;
  if not public.username_permitido(v_username) then
    raise exception 'username_proibido' using errcode = 'P0001';
  end if;

  insert into public.profiles (id, username) values (new.id, v_username);
  return new;
exception
  when unique_violation then
    raise exception 'username_em_uso' using errcode = 'P0001';
end;
$$;

create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.criar_perfil_novo_usuario();

-- =====================================================================
-- RPCs públicas
-- =====================================================================

-- Usado no formulário de cadastro antes de criar a conta.
create function public.username_disponivel(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.username_permitido(p_username)
     and not exists (select 1 from public.profiles where username = lower(p_username));
$$;

-- Entrar no mundo: cria o território inicial numa posição livre perto da borda em expansão.
-- Se o jogador já está no mundo, devolve o território que ele já tem (idempotente).
create function public.entrar_no_mundo(p_world_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_world public.worlds;
  v_username text;
  v_territorio uuid;
  v_qtd integer;
  v_centro numeric;
  v_raio numeric;
  v_dist numeric;
  v_ang double precision;
  v_x integer;
  v_y integer;
  v_tentativa integer := 0;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '28000';
  end if;
  if p_world_id is null then
    raise exception 'mundo_inexistente' using errcode = 'P0001';
  end if;

  perform public._registrar_acao(v_uid, 'entrar_no_mundo');

  -- Trava o mundo: entradas simultâneas são serializadas e nunca disputam a mesma casa.
  select * into v_world from public.worlds where id = p_world_id for update;
  if not found then
    raise exception 'mundo_inexistente' using errcode = 'P0001';
  end if;
  if v_world.status = 'encerrado' then
    raise exception 'mundo_encerrado' using errcode = 'P0001';
  end if;

  select username into v_username from public.profiles where id = v_uid;
  if v_username is null then
    raise exception 'perfil_inexistente' using errcode = 'P0001';
  end if;

  -- Já tem território aqui? Devolve o mais antigo.
  select id into v_territorio
  from public.territories
  where world_id = p_world_id and dono_id = v_uid
  order by created_at
  limit 1;
  if v_territorio is not null then
    return v_territorio;
  end if;

  -- Já jogou neste mundo e perdeu tudo: não renasce (evita farm de territórios iniciais).
  if exists (select 1 from public.world_players where world_id = p_world_id and user_id = v_uid) then
    raise exception 'sem_territorio' using errcode = 'P0001';
  end if;

  -- Raio da borda cresce com a raiz do número de territórios (densidade ~30% perto do centro).
  select count(*) into v_qtd from public.territories where world_id = p_world_id;
  v_centro := v_world.tamanho_mapa / 2.0;
  v_raio := 4 + sqrt(v_qtd);

  loop
    v_tentativa := v_tentativa + 1;
    if v_tentativa > 300 then
      raise exception 'mapa_cheio' using errcode = 'P0001';
    end if;

    v_ang := random() * 2 * pi();
    v_dist := v_raio + random() * 3 + v_tentativa / 25.0; -- se estiver lotado, empurra para fora
    v_x := round(v_centro + v_dist * cos(v_ang));
    v_y := round(v_centro + v_dist * sin(v_ang));

    continue when v_x < 0 or v_y < 0 or v_x >= v_world.tamanho_mapa or v_y >= v_world.tamanho_mapa;
    exit when not exists (
      select 1 from public.territories t
      where t.world_id = p_world_id and t.x = v_x and t.y = v_y
    );
  end loop;

  insert into public.world_players (world_id, user_id) values (p_world_id, v_uid);

  insert into public.territories (world_id, x, y, bairro, dono_id, nome)
  values (
    p_world_id, v_x, v_y,
    public.bairro_de(v_x, v_y, v_world.tamanho_mapa),
    v_uid,
    'Território de ' || v_username
  )
  returning id into v_territorio;

  return v_territorio;
end;
$$;

-- =====================================================================
-- Permissões das funções: nada executável por padrão, só o necessário.
-- =====================================================================
revoke execute on function public._registrar_acao(uuid, text, integer) from public, anon, authenticated;
revoke execute on function public.criar_perfil_novo_usuario() from public, anon, authenticated;
revoke execute on function public.entrar_no_mundo(uuid) from public, anon;
revoke execute on function public.username_disponivel(text) from public;

grant execute on function public.entrar_no_mundo(uuid) to authenticated;
grant execute on function public.username_disponivel(text) to anon, authenticated;
grant execute on function public.bairro_de(integer, integer, integer) to anon, authenticated;
grant execute on function public.username_permitido(text) to anon, authenticated;
