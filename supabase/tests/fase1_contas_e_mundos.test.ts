import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { comoJogador, criarBanco, criarUsuario, erroDe } from "./harness";

let db: PGlite;
let mundoId: string;

beforeEach(async () => {
  db = await criarBanco();
  const { rows } = await db.query<{ id: string }>(`select id from public.worlds where slug = 't1'`);
  mundoId = rows[0].id;
});

const entrar = (userId: string | null, world = mundoId) =>
  comoJogador(db, userId, (tx) =>
    tx.query<{ entrar_no_mundo: string }>(`select public.entrar_no_mundo($1)`, [world]),
  ).then((r) => r.rows[0].entrar_no_mundo);

describe("cadastro (trigger de perfil)", () => {
  it("cria o perfil com o username em minúsculas", async () => {
    const id = await criarUsuario(db, "Surfista_99");
    const { rows } = await db.query(`select username from public.profiles where id = $1`, [id]);
    expect(rows).toEqual([{ username: "surfista_99" }]);
  });

  it("recusa username repetido e username inválido", async () => {
    await criarUsuario(db, "maresia");
    expect(await erroDe(criarUsuario(db, "MARESIA"))).toBe("username_em_uso");
    expect(await erroDe(criarUsuario(db, "ab"))).toBe("username_invalido");
    expect(await erroDe(criarUsuario(db, "com espaço"))).toBe("username_invalido");
  });

  it("o banco barra nomes reservados e palavrões mesmo se o navegador for burlado", async () => {
    for (const u of ["admin", "admin_2", "mod", "costa_neon_oficial", "x_porra_x", "puta69"]) {
      expect(await erroDe(criarUsuario(db, u))).toBe("username_proibido");
    }
    for (const u of ["computador", "modesto", "desviado", "rootbeer_fan"]) {
      expect(await erroDe(criarUsuario(db, u))).toBe("sem erro");
    }
  });

  it("username_disponivel responde certo para visitantes", async () => {
    await criarUsuario(db, "maresia");
    const disp = (u: string) =>
      comoJogador(db, null, (tx) =>
        tx.query<{ ok: boolean }>(`select public.username_disponivel($1) as ok`, [u]),
      ).then((r) => r.rows[0].ok);
    expect(await disp("maresia")).toBe(false);
    expect(await disp("Maresia")).toBe(false);
    expect(await disp("brisa")).toBe(true);
    expect(await disp("x")).toBe(false);
  });
});

describe("entrar_no_mundo", () => {
  it("ACEITE: duas contas entram no mesmo mundo e cada uma vê o seu território", async () => {
    const ana = await criarUsuario(db, "ana");
    const beto = await criarUsuario(db, "beto");

    const terrAna = await entrar(ana);
    const terrBeto = await entrar(beto);
    expect(terrAna).not.toBe(terrBeto);

    const meu = (uid: string) =>
      comoJogador(db, uid, (tx) =>
        tx.query<{ id: string; nome: string; x: number; y: number }>(
          `select id, nome, x, y from public.territories where world_id = $1 and dono_id = $2`,
          [mundoId, uid],
        ),
      ).then((r) => r.rows);

    const deAna = await meu(ana);
    const deBeto = await meu(beto);
    expect(deAna).toHaveLength(1);
    expect(deBeto).toHaveLength(1);
    expect(deAna[0]).toMatchObject({ id: terrAna, nome: "Território de ana" });
    expect(deBeto[0]).toMatchObject({ id: terrBeto, nome: "Território de beto" });
    expect([deAna[0].x, deAna[0].y]).not.toEqual([deBeto[0].x, deBeto[0].y]);
  });

  it("é idempotente: entrar de novo devolve o mesmo território", async () => {
    const ana = await criarUsuario(db, "ana");
    const t1 = await entrar(ana);
    const t2 = await entrar(ana);
    expect(t2).toBe(t1);
    const { rows } = await db.query(`select count(*)::int as n from public.territories`);
    expect(rows).toEqual([{ n: 1 }]);
  });

  it("nasce perto do centro e dentro do mapa, sem colisões, com 150 jogadores", async () => {
    for (let i = 0; i < 150; i++) {
      await entrar(await criarUsuario(db, `jogador_${i}`));
    }
    const { rows } = await db.query<{ n: number; casas: number; maxd: number; fora: number }>(`
      select count(*)::int as n,
             count(distinct (x, y))::int as casas,
             max(sqrt(power(x - 250, 2) + power(y - 250, 2)))::float as maxd,
             count(*) filter (where x < 0 or y < 0 or x >= 500 or y >= 500)::int as fora
      from public.territories`);
    expect(rows[0]).toMatchObject({ n: 150, casas: 150, fora: 0 });
    expect(rows[0].maxd).toBeLessThan(40);
  });

  it("recusa visitante sem login, mundo inexistente e mundo encerrado", async () => {
    expect(await erroDe(entrar(null))).toMatch(/permission denied|nao_autenticado/);
    const ana = await criarUsuario(db, "ana");
    expect(await erroDe(entrar(ana, "00000000-0000-0000-0000-000000000000"))).toBe(
      "mundo_inexistente",
    );
    await db.query(`update public.worlds set status = 'encerrado' where id = $1`, [mundoId]);
    expect(await erroDe(entrar(ana))).toBe("mundo_encerrado");
  });

  it("quem perdeu todos os territórios não renasce no mesmo mundo", async () => {
    const ana = await criarUsuario(db, "ana");
    await entrar(ana);
    await db.query(`update public.territories set dono_id = null where dono_id = $1`, [ana]);
    expect(await erroDe(entrar(ana))).toBe("sem_territorio");
  });

  it("rate limit: mais de 10 ações por segundo é barrado", async () => {
    const ana = await criarUsuario(db, "ana");
    await db.query(
      `insert into public.action_log (user_id, acao) select $1, 'teste' from generate_series(1, 10)`,
      [ana],
    );
    expect(await erroDe(entrar(ana))).toBe("muitas_acoes");
  });
});

describe("segurança (RLS e permissões)", () => {
  it("jogador NÃO consegue escrever direto em nenhuma tabela do jogo", async () => {
    const ana = await criarUsuario(db, "ana");
    const terr = await entrar(ana);
    const tentativas = [
      `update public.territories set lealdade = 0 where id = '${terr}'`,
      `insert into public.worlds (nome, slug) values ('Hack', 'hack')`,
      `update public.profiles set username = 'admin' where id = '${ana}'`,
      `delete from public.world_players`,
      `insert into public.action_log (user_id, acao) values ('${ana}', 'x')`,
    ];
    for (const sql of tentativas) {
      expect(await erroDe(comoJogador(db, ana, (tx) => tx.query(sql)))).toMatch(
        /permission denied/,
      );
    }
  });

  it("jogador não chama funções internas", async () => {
    const ana = await criarUsuario(db, "ana");
    const erro = await erroDe(
      comoJogador(db, ana, (tx) => tx.query(`select public._registrar_acao($1, 'x')`, [ana])),
    );
    expect(erro).toMatch(/permission denied/);
  });

  it("visitante vê os mundos, mas não vê o mapa nem os perfis", async () => {
    const ana = await criarUsuario(db, "ana");
    await entrar(ana);
    const ver = (sql: string) => comoJogador(db, null, (tx) => tx.query(sql)).then((r) => r.rows);
    expect(await ver(`select id from public.worlds`)).toHaveLength(1);
    expect(await ver(`select id from public.territories`)).toHaveLength(0);
    expect(await ver(`select id from public.profiles`)).toHaveLength(0);
  });

  it("todas as tabelas do schema public têm RLS ligado", async () => {
    const { rows } = await db.query<{ relname: string }>(`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
    expect(rows).toEqual([]);
  });
});
