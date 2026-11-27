-- Primeiro mundo público, para o jogo ter onde entrar desde a Fase 1.
-- A duração da temporada ainda está em aberto (CLAUDE.md, seção 11): sem data de fim por enquanto.
insert into public.worlds (nome, slug, status, velocidade, tamanho_mapa)
values ('Temporada 1 · Costa Neon', 't1', 'aberto', 1, 500)
on conflict (slug) do nothing;
