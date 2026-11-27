# CLAUDE.md — Projeto "Costa Neon" (nome provisório)

> Este arquivo é a fonte da verdade do projeto. Leia inteiro antes de qualquer tarefa.
> Se uma decisão daqui for mudar, atualize este arquivo **no mesmo PR**.

---

## 1. Missão e definição de sucesso

Construir um jogo de estratégia multiplayer online, persistente e com vários servidores, no
estilo de Tribal Wars 2: mapa compartilhado, construção, exército, ataques, alianças e ranking.
A diferença é ser **mais rápido, mais limpo e com tema moderno**.

**Sucesso = o jogo está no ar, público, e funciona.** Qualquer pessoa entra numa URL, cria conta
com usuário e senha, escolhe um servidor existente e joga uma partida completa sem bugs que
travem o jogo.

**Restrição dura: custo zero.** Só usamos planos gratuitos. Se alguma tarefa exigir serviço
pago, **pare e pergunte** antes de seguir.

---

## 2. Conceito do jogo

### Tema
Uma metrópole litorânea fictícia, ensolarada e neon, nos dias de hoje. Tem praias, ilhas,
pântanos e rodovias, com estética de anos 80 modernizada: rosa e ciano, pôr do sol, palmeiras.
A inspiração é a vibe de "cidade do vício" dos jogos de mundo aberto.

**Regra de propriedade intelectual (obrigatória):** nada de nomes, logos, personagens, fontes,
mapas ou músicas de GTA, Rockstar ou qualquer outra marca. A referência fica na *vibe*. Todo
nome é original. Na dúvida, invente outro.

### Troca de conceitos (TW2 → nosso jogo)
| Tribal Wars 2 | Costa Neon |
|---|---|
| Aldeia | **Território** (um quarteirão da cidade) |
| Madeira / Argila / Ferro | **Cash** / **Material** / **Influência** |
| Edifícios (quartel, ferreiro…) | **Negócios**: Garagem, Oficina, Boate, Escritório, Doca, Torre de rádio |
| Tropas | **Crew**: Olheiros, Seguranças, Pilotos, Blindados, Hackers, Negociadores |
| Nobre / conquista | **Negociador** (reduz a "lealdade" do território até tomar) |
| Tribo | **Sindicato** |
| Mapa de aldeias | Mapa em grade com bairros (Praia, Centro, Porto, Ilhas, Pântano) |

### Pilares de design (o que nos diferencia)
1. **Rápido.** Os servidores são **temporadas de 7 a 14 dias**, com vencedor e reset. As
   construções duram minutos, não horas. Velocidade configurável por servidor.
2. **Menos "clica e espera".**
   - Fila de construção e recrutamento com vários itens desde o início.
   - **Ações em lote**: um clique para "subir tudo que dá", "recrutar o máximo de X" e
     "coletar em todos os territórios".
   - **Automação leve**: reinvestimento automático opcional e "planos" salvos (ex.: build de
     economia).
   - Recursos calculados sob demanda (sem precisar clicar para coletar), com coleta em lote
     opcional como bônus.
3. **Entrar e jogar em menos de 60 segundos.** Usuário e senha, escolher servidor, nascer
   num território inicial com tutorial de 5 passos.
4. **Funciona bem no celular** desde o início (layout responsivo).

### Direção de arte (obrigatória em toda tela)

Referência: ilustração de capa de disco no estilo "zine / desenho à mão, cores chapadas".
Adotamos o **estilo**, nunca o conteúdo. **Não reproduzir** o cachorro de cone, o título,
a composição nem qualquer elemento da capa. Todos os personagens e objetos são criados por nós.

**Características do estilo**
- **Traço de nanquim feito à mão:** contorno preto, espessura irregular, linhas levemente
  tortas. Nada de vetor "perfeito" ou geométrico.
- **Cores chapadas, sem gradiente, sem brilho e sem 3D.** Paleta curtíssima (abaixo).
- **Fundo de cor sólida e saturada** (ciano), com muito respiro e poucos elementos por tela.
- **Sombras pretas duras e projetadas**, deslocadas em diagonal, como sol forte de praia ao
  meio-dia. É a marca registrada visual do jogo.
- **Texturas mínimas:** hachuras, risquinhos e listras feitas à mão (meias listradas,
  manchas, rachaduras), usadas como detalhe e não como preenchimento.
- **Enquadramentos inusitados e bem-humorados:** personagens cortados no quadro, vistos de
  baixo ou só por um detalhe (o tênis, a mão, o carro).
- **Tipografia de letreiro desenhado à mão**, em caixa alta, com sombra sólida deslocada.
- **Tom:** urbano, ensolarado, irônico e afetivo. Mais "rua e skate" do que "crime pesado".

**Paleta (tokens do Tailwind, usar só estes)**
| Token | Hex | Uso |
|---|---|---|
| `mar` | `#1FB6D5` | fundo principal, mapa (mar e asfalto) |
| `sol` | `#F6E27A` | destaques, botões primários, recursos |
| `neon` | `#C2549B` | alertas, ataques, notificações, inimigos |
| `tinta` | `#141414` | contornos, sombras, texto |
| `papel` | `#FAF6EA` | painéis, cartões, modais |
| `concreto` | `#D9D5C5` | elementos neutros, desabilitados |

Contraste: texto sempre `tinta` sobre `papel` ou `sol`. Sobre `mar`, só títulos grandes.
Validar WCAG AA.

**Regras de UI**
- Cartões e botões têm borda `tinta` de 2–3px com cantos levemente irregulares (SVG ou
  `border-radius` assimétrico) e **sombra sólida** `box-shadow: 4px 4px 0 #141414`, sem blur.
- Botão pressionado: a sombra some e o botão desloca 4px (efeito de "carimbo").
- Ícones desenhados no mesmo traço, nunca de bibliotecas genéricas misturadas.
  Lucide/shadcn só em telas administrativas.
- Animações curtas e "de papel": balanço, carimbo, wiggle de 2–3 frames. Respeitar
  `prefers-reduced-motion`.

**Mapa**
- Vista de cima chapada: fundo `mar` (água e asfalto), quarteirões como "recortes" em `papel`
  ou `sol` com contorno preto e sombra projetada. Territórios inimigos em `neon`.
- Cada negócio (Garagem, Boate…) é um desenho-adesivo pequeno com sombra.

**Fontes (Google Fonts, licença OFL, gratuitas)**
- Títulos: **`Caveat Brush`** (escolhida na Fase 0; alternativas avaliadas: `Gochi Hand`,
  `Mansalva`), sempre com sombra sólida deslocada.
- Texto corrido e números: `Nunito` (legível; números do jogo com `tabular-nums`).

**Produção de assets com custo zero**
- Ilustrações em **SVG** desenhadas à mão (Inkscape, Krita ou papel escaneado e vetorizado),
  salvas em `/public/art`.
- Para o efeito de "traço tremido" em formas geradas por código: filtro SVG
  `feTurbulence` + `feDisplacementMap` com intensidade baixa (já disponível globalmente como
  `filter: url(#traco-tremido)`, ver `components/ui/FiltroTraco.tsx`).
- Guia visual vivo em `/app/estilo` (rota interna) com paleta, botões, cartões, tipografia
  e exemplos. Toda tela nova deve parecer pertencer a esse guia.
- Proibido: fotos, gradientes, glassmorphism, sombras com blur, estética "dark gamer"
  genérica, e qualquer imagem de terceiros sem licença.

### Loop principal
Produzir recursos → subir negócios → recrutar crew → explorar o mapa (olheiros) → atacar ou
saquear → conquistar territórios → crescer com o sindicato → ranking da temporada.

---

## 3. Stack (tudo gratuito)

| Camada | Escolha | Observação |
|---|---|---|
| Código | **GitHub** (`primo-fidelizi/EMPEROR-ONLINE`) | Issues como backlog |
| Frontend + API leve | **Next.js (App Router) + TypeScript** na **Vercel (Hobby)** | O plano Hobby é para uso **não comercial**. Se um dia houver monetização, reavaliar |
| Banco, Auth, Realtime | **Supabase (Free)** | Postgres + Auth + Realtime + `pg_cron` |
| Lógica do jogo | **Funções SQL/PLpgSQL no Postgres (RPC)** | O servidor é a autoridade, sempre |
| Jobs periódicos | **`pg_cron` no Supabase** | Não usar cron da Vercel (no Hobby é limitado) |
| UI | Tailwind CSS (v4) + componentes próprios em `components/ui`; shadcn/ui só em telas administrativas | |
| Mapa | Canvas 2D (ou PixiJS se precisar) | Renderizar só a área visível |
| Estado no cliente | TanStack Query + Zustand | |
| Anti-bot | **Cloudflare Turnstile** (grátis) | No cadastro e no login |
| Testes | Vitest (unitário), Playwright (e2e), pgTAP ou testes SQL (banco) | |
| CI | GitHub Actions | lint, typecheck, testes e migrations |
| Erros | Sentry (plano free) | Opcional, fase 6 |
| Domínio | Início: `nome.vercel.app`. Depois: domínio próprio (Cloudflare DNS grátis) | Ver seção 10 |

**Limites do plano free a respeitar** (confira os valores atuais na documentação, porque mudam):
- O Supabase Free **pausa o projeto após cerca de 7 dias sem atividade**. Um job do GitHub
  Actions faz um ping diário numa rota de health para manter vivo.
- O tamanho do banco é limitado. Histórico de relatórios, chat e logs **expira** (purga
  automática via `pg_cron`).
- Realtime tem limite de conexões e mensagens: assinar apenas canais necessários (o próprio
  jogador e o sindicato), nunca o mapa inteiro.

---

## 4. Arquitetura

```
Navegador (Next.js)
   │  supabase-js (chave anon + JWT do usuário)
   ▼
Supabase
   ├─ Auth (usuário/senha)
   ├─ Postgres
   │    ├─ Tabelas com RLS (leitura)
   │    ├─ Funções RPC `security definer` (TODA escrita do jogo)
   │    └─ pg_cron: resolver chegadas de ataques, fim de temporada, purgas
   └─ Realtime: notificações (ataque chegando, relatório novo, chat do sindicato)
```

### Regras de ouro da arquitetura
1. **O cliente nunca escreve direto em tabela de jogo.** Toda ação (construir, recrutar,
   atacar) é uma chamada `supabase.rpc('nome_da_acao', {...})`. A função valida tudo:
   dono, recursos, fila, distância e tempo.
2. **Tempo é sempre `now()` do Postgres.** Nunca confiar em horário enviado pelo cliente.
3. **Recursos calculados sob demanda (lazy).** Guardamos `quantidade_base` e
   `atualizado_em`. O valor atual é `base + taxa × (now() − atualizado_em)`, limitado pela
   capacidade do armazém. Antes de qualquer gasto, a função "materializa" o valor. Assim
   não existe tick global para recursos.
4. **Eventos com hora marcada** (construção concluída, tropa chegou) ficam numa tabela
   `eventos(executa_em, tipo, payload)`. São resolvidos:
   - de forma lazy, quando qualquer jogador envolvido faz uma ação ou abre a tela; e
   - pelo `pg_cron` a cada minuto, que processa os vencidos em ordem
     (`for update skip locked`).
   Resolver em **ordem cronológica** é obrigatório para batalhas.
5. **Multi-servidor = coluna `world_id`** em todas as tabelas de jogo. Um único projeto
   Supabase hospeda vários mundos. Cada mundo tem configuração própria (velocidade, tamanho
   do mapa, datas de início e fim).
6. **Fórmulas de jogo (custos, tempos, combate) ficam em tabelas de configuração** no banco,
   não espalhadas no código. Isso permite balancear sem deploy.

### Modelo de dados inicial (esboço)
- `profiles(id → auth.users, username unique, created_at)`
- `worlds(id, nome, slug, status[aberto|rodando|encerrado], velocidade, tamanho_mapa, inicia_em, termina_em, config jsonb)`
- `world_players(world_id, user_id, pontos, sindicato_id, entrou_em)`
- `territories(id, world_id, x, y, bairro, dono_id null, nome, lealdade, recursos_base jsonb, recursos_atualizado_em)`
- `buildings(territory_id, tipo, nivel)`
- `build_queue(id, territory_id, tipo, nivel_alvo, termina_em)`
- `units(territory_id, tipo, quantidade)`
- `recruit_queue(id, territory_id, tipo, quantidade, termina_em)`
- `movements(id, world_id, origem_id, destino_id, tipo[ataque|apoio|retorno|espionagem], unidades jsonb, sai_em, chega_em, saque jsonb)`
- `reports(id, world_id, user_id, tipo, dados jsonb, lido, criado_em)` (purga após N dias)
- `syndicates(id, world_id, nome, tag, lider_id)` e `syndicate_members`
- `messages(id, world_id, sindicato_id, user_id, texto, criado_em)` (purga)
- `game_config(chave, valor jsonb)` com custos, tempos e status das unidades
- `action_log(user_id, acao, criado_em)` para rate limit e auditoria

Índices obrigatórios: `territories(world_id, x, y)`, `movements(chega_em)`,
`eventos(executa_em)` e `reports(user_id, criado_em desc)`.

---

## 5. Autenticação simplificada (usuário + senha)

O Supabase Auth trabalha com e-mail. Para ter **só usuário e senha**:
- No cadastro, o cliente envia `username` e `senha`. Uma rota server (Next.js Route Handler)
  valida o Turnstile e o formato do username (`^[a-z0-9_]{3,20}$`, com lista de nomes
  proibidos) e chama `auth.signUp` com e-mail sintético `username@players.costaneon.invalid`.
- **Desativar a confirmação de e-mail** no painel do Supabase.
- Um trigger em `auth.users` cria o registro em `profiles` com username único.
- Login: converter o username no e-mail sintético e chamar `signInWithPassword`.
- Consequência aceita: **não existe "esqueci a senha" por e-mail.** Na fase 6 entra a opção
  de vincular um e-mail real para recuperação.
- Senha com mínimo de 8 caracteres. Ativar a proteção contra senhas vazadas se estiver
  disponível no plano.

---

## 6. Segurança básica (checklist obrigatório)

- [ ] **RLS ativado em TODAS as tabelas**, sem exceção. Política padrão: negar.
- [ ] Leitura: o jogador vê o que é dele. Mapa e ranking são públicos dentro do mundo, mas
      **tropas alheias nunca aparecem** (só via relatório de espionagem).
- [ ] Escrita: **nenhuma política de insert/update/delete para usuários** nas tabelas de
      jogo. Só funções RPC `security definer` com `set search_path = ''` e checagem de
      `auth.uid()`.
- [ ] A chave `service_role` **nunca** vai para o cliente nem para variável `NEXT_PUBLIC_*`.
      Ela só existe em rotas server e no GitHub Secrets.
- [ ] Toda função RPC valida os inputs: tipos, limites, `quantidade > 0` e inteiros (evitar
      overflow e números negativos, que são o exploit clássico).
- [ ] Operações de recursos são **atômicas** (uma transação, `select … for update` no
      território) para evitar gasto duplo com cliques simultâneos.
- [ ] Rate limit por usuário nas RPCs (via `action_log`, por exemplo no máximo 10 ações por
      segundo) e no cadastro e login (Turnstile + limite por IP na rota server).
- [x] Headers de segurança no Next.js: CSP, `X-Frame-Options: DENY`, `Referrer-Policy`, HSTS.
      (CSP ainda permite `'unsafe-inline'` em scripts; trocar por nonce na fase 6.)
- [ ] Sanitizar textos de usuário (nomes, chat). Renderizar como texto, nunca como HTML.
      Filtro básico de palavrões em nomes.
- [ ] Segredos em `.env.local` (no `.gitignore`) e nas Environment Variables da Vercel.
      Ativar o secret scanning do GitHub.
- [x] Dependabot ativado. `npm audit` no CI.
- [ ] Rodar o **Security Advisor** do Supabase antes de cada release e zerar os alertas.
- [ ] Backups: o plano free tem pouco ou nenhum backup. Um job semanal no GitHub Actions faz
      `pg_dump` do schema e da config (sem dados pessoais) num artefato privado.

---

## 7. Estrutura do repositório

```
/app                 rotas Next.js (/, /estilo, /login, /cadastro, /mundos, /jogo/[world]/...)
/components/ui       componentes base no estilo do jogo (Botao, Cartao, Titulo, Modal)
/components/art      ilustrações SVG como componentes
/lib                 supabase client, hooks, fórmulas compartilhadas (só exibição)
/public/art          ilustrações SVG estáticas
/supabase
  /migrations        SQL versionado (único jeito de mudar o banco)
  /seed.sql          config do jogo + mundo de teste
  /tests             testes SQL das RPCs
/e2e                 Playwright
/docs                decisões (ADR curtas), balanceamento
.github/workflows    ci.yml, keepalive.yml, backup.yml
CLAUDE.md
```

Usar a **Supabase CLI** com ambiente local (`supabase start`) para desenvolver. Mudanças de
banco **só por migration**, nunca editando direto no painel de produção.

---

## 8. Roadmap ponta a ponta

Cada fase termina com **critério de aceite verificável**. Não avance de fase sem cumprir.

### Fase 0: Fundação (dia 1–2)
- Repo no GitHub, Next.js + TS + Tailwind, ESLint e Prettier.
- Projetos Supabase: `dev` local via CLI e `prod` na nuvem (projeto `djmtzvsjfbxuibbaqdjp`, região São Paulo).
- Deploy na Vercel conectado ao GitHub (preview por PR, produção na `main`).
- Tokens de cor e fontes da Direção de arte no Tailwind, mais a rota `/app/estilo` com os
  componentes base (botão, cartão, modal, título).
- CI: lint, typecheck e testes.
- **Aceite:** uma página "Hello Costa Neon" no ar em `*.vercel.app` e CI verde.
- **Status:** ✅ site no ar em emperor-online.vercel.app; Supabase prod criado.

### Fase 1: Contas e mundos
- Cadastro e login com usuário e senha (seção 5) + Turnstile.
- Lista de mundos (aberto, rodando, encerrado) e botão "Entrar no mundo", que cria o
  território inicial numa posição livre perto da borda em expansão.
- Workflow `keepalive.yml` pingando a rota de health (que passa a tocar o Supabase).
- **Aceite:** duas contas diferentes entram no mesmo mundo e cada uma vê seu território.

### Fase 2: Economia
- Recursos lazy, negócios, fila de construção, armazém e capacidade.
- Ações em lote: "subir tudo que dá".
- **Aceite:** um teste SQL prova que não dá para gastar o que não tem, nem com chamadas
  simultâneas.

### Fase 3: Mapa
- Grade com bairros, mapa em canvas com pan e zoom, carregando por região visível
  (`x between … and y between …`).
- Territórios abandonados ("bárbaros") gerados para saque no início.
- **Aceite:** um mapa de 500×500 navega fluido no celular.

### Fase 4: Crew e combate
- Recrutamento, movimentos (ataque, apoio, espionagem, retorno), tempo de viagem por
  distância e unidade mais lenta.
- Resolução de batalha determinística (fórmulas em `game_config`), saque, relatórios e
  notificação via Realtime.
- Conquista: o Negociador reduz a lealdade e, ao chegar a 0, o território troca de dono.
- **Aceite:** testes cobrem ataque vencido, ataque perdido, chegadas simultâneas e
  conquista; o e2e cobre um ataque completo entre duas contas.

### Fase 5: Social e temporada
- Sindicatos (criar, convidar, sair), chat do sindicato, ranking de jogadores e sindicatos.
- Fim de temporada: congela o mundo, anuncia vencedores e abre o próximo mundo.
- **Aceite:** um mundo de teste com velocidade 100× roda do início ao fim sozinho.

### Fase 6: Lançamento público
- Checklist de segurança (seção 6) 100% feito.
- Tutorial de 5 passos, página inicial explicando o jogo, termos de uso e política de
  privacidade simples.
- Sentry, keepalive e purgas ativos. Teste de carga leve (k6 ou script) com cerca de 100
  jogadores simulados.
- **Aceite = SUCESSO:** URL pública, um estranho cria conta e joga sem ajuda.

### Fase 7: Pós-lançamento
- Domínio próprio, recuperação por e-mail opcional, balanceamento com dados reais e novos
  tipos de mundo.

---

## 9. Como o Claude deve trabalhar neste projeto

- **Uma fase, uma tarefa por vez.** Antes de codar, diga em 2–3 linhas o que vai fazer e
  quais arquivos vai tocar.
- Toda lógica de jogo nova = **migration + função RPC + teste SQL**. Sem teste, não está
  pronto.
- Nunca colocar regra de jogo só no frontend. O frontend pode *prever* (mostrar tempo
  estimado), mas quem decide é o banco.
- Commits pequenos e descritivos, em português. PR por feature.
- Ao terminar uma tarefa: rodar `npm run lint`, `npm run typecheck`, `npm test` e
  `npm run build`, e informar o que foi feito e o que falta.
- Se algo exigir plano pago, quebrar uma regra deste arquivo ou envolver ação irreversível
  em produção (apagar dados, resetar mundo real): **parar e perguntar.**
- Textos do jogo em **português do Brasil**. Código, nomes de tabela e variáveis podem ser em
  português ou inglês, mas mantenha consistência (decisão: **tabelas em inglês, textos de
  UI em pt-BR**).
- Mantenha `/docs/balanceamento.md` atualizado com custos, tempos e status das unidades.

---

## 10. Domínio

1. **Início:** **https://emperor-online.vercel.app** (no ar desde a Fase 0).
2. **Depois:** registrar um domínio (é o único custo, opcional, cerca de R$40–80 por ano para
   um `.com.br`). Apontar o DNS via Cloudflare (grátis), adicionar na Vercel e atualizar:
   - a URL do site e as Redirect URLs no Supabase Auth;
   - o hostname permitido no Turnstile;
   - a CSP e o CORS.

---

## 11. Decisões em aberto (decidir junto com o usuário)

- Nome final do jogo e dos bairros (o repositório se chama `EMPEROR-ONLINE`; o jogo segue como
  "Costa Neon" até decidirmos).
- Duração padrão da temporada (7 ou 14 dias) e velocidade.
- Tamanho máximo do sindicato.
- Haverá proteção para iniciantes (ex.: 48h sem poder ser atacado)? Sugestão: sim.
