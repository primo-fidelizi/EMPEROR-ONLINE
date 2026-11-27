import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { comoJogador, criarBanco, criarUsuario, erroDe } from "./harness";

let db: PGlite;
let mundo: string;

beforeEach(async () => {
  db = await criarBanco();
  mundo = (await db.query<{ id: string }>(`select id from public.worlds where slug = 't1'`)).rows[0].id;
});

const criarRobos = async (n: number) =>
  (await db.query<{ n: number }>(`select public.admin_criar_bots($1, $2) as n`, [mundo, n])).rows[0].n;

const rodar = async () => (await db.query<{ n: number }>(`select public._rodar_bots(100) as n`)).rows[0].n;

const robos = () =>
  db
    .query<{ user_id: string; username: string; perfil: string; terr: string }>(`
      select b.user_id, p.username, b.perfil, t.id as terr
      from public.bots b join public.profiles p on p.id = b.user_id
      join public.territories t on t.dono_id = b.user_id
      order by p.username`)
    .then((r) => r.rows);

/** Deixa os robôs sempre dispostos a atacar (o sorteio vira certeza). */
const robosAgressivos = (soAbandonados = false) =>
  db.query(`
    update public.game_config
    set valor = jsonb_set(jsonb_set(jsonb_set(jsonb_set(valor,
      '{perfis,construtor,chance_ataque}', '1'), '{perfis,equilibrado,chance_ataque}', '1'),
      '{perfis,saqueador,chance_ataque}', '1'),
      '{perfis,saqueador,so_abandonados}', '${soAbandonados}')
    where chave = 'robos'`);

describe("criação dos robôs", () => {
  it("cria robôs de verdade: perfil marcado, território, crew inicial, 3 estilos e sem proteção", async () => {
    expect(await criarRobos(6)).toBe(6);
    const lista = await robos();
    expect(lista).toHaveLength(6);
    expect(new Set(lista.map((r) => r.perfil))).toEqual(new Set(["construtor", "saqueador", "equilibrado"]));

    const { rows } = await db.query<{ bots: number; protegidos: number; crew: number }>(`
      select count(*) filter (where p.is_bot)::int as bots,
             count(*) filter (where wp.entrou_em > now() - interval '48 hours')::int as protegidos,
             (select count(distinct territory_id)::int from public.units u
              join public.territories t on t.id = u.territory_id join public.bots b on b.user_id = t.dono_id) as crew
      from public.world_players wp join public.profiles p on p.id = wp.user_id`);
    expect(rows[0]).toEqual({ bots: 6, protegidos: 0, crew: 6 });
  });

  it("nomes não se repetem, mesmo criando mais robôs depois", async () => {
    await criarRobos(4);
    await criarRobos(4);
    const nomes = (await robos()).map((r) => r.username);
    expect(new Set(nomes).size).toBe(8);
  });

  it("robô não tem senha: a conta não serve para login", async () => {
    await criarRobos(1);
    const { rows } = await db.query(`select email from auth.users where email like '%@robos.costaneon.invalid'`);
    expect(rows).toHaveLength(1);
  });
});

describe("turno dos robôs", () => {
  it("constroem, recrutam e atacam sozinhos, pelas mesmas regras de um jogador", async () => {
    await criarRobos(3);
    await robosAgressivos();
    const lista = await robos();
    for (const r of lista) {
      await db.query(`insert into public.buildings values ($1, 'garagem', 2) on conflict do nothing`, [r.terr]);
      await db.query(
        `update public.territory_economy set cash = 1200, material = 1200, influencia = 1200, atualizado_em = now() where territory_id = $1`,
        [r.terr],
      );
      // 40 seguranças: metade (20) vai = ataque 200, acima do mínimo de qualquer estilo.
      await db.query(`update public.units set quantidade = 40 where territory_id = $1 and tipo = 'seguranca'`, [r.terr]);
    }

    expect(await rodar()).toBe(3);

    const { rows } = await db.query<{ obras: number; recrut: number; ataques: number; negativos: number }>(`
      select (select count(*)::int from public.build_queue q join public.territories t on t.id = q.territory_id join public.bots b on b.user_id = t.dono_id) as obras,
             (select count(*)::int from public.recruit_queue q join public.territories t on t.id = q.territory_id join public.bots b on b.user_id = t.dono_id) as recrut,
             (select count(*)::int from public.movements m join public.bots b on b.user_id = m.dono_id where m.tipo = 'ataque') as ataques,
             (select count(*)::int from public.territory_economy where cash < 0 or material < 0 or influencia < 0) as negativos`);
    expect(rows[0].obras).toBeGreaterThan(0);
    expect(rows[0].recrut).toBeGreaterThan(0);
    expect(rows[0].ataques).toBe(3);
    expect(rows[0].negativos).toBe(0);

    // A crew que saiu de casa foi descontada de verdade (metade dos seguranças fica para defender).
    const { rows: casa } = await db.query<{ q: number }>(
      `select quantidade as q from public.units where territory_id = $1 and tipo = 'seguranca'`,
      [lista[0].terr],
    );
    expect(casa[0].q).toBe(20);
  });

  it("não manda um segundo ataque enquanto o primeiro está na rua", async () => {
    await criarRobos(1);
    await robosAgressivos();
    const [r] = await robos();
    await db.query(`update public.units set quantidade = 40 where territory_id = $1 and tipo = 'seguranca'`, [r.terr]);
    await rodar();
    await rodar();
    const { rows } = await db.query(`select count(*)::int as n from public.movements where tipo = 'ataque'`);
    expect(rows).toEqual([{ n: 1 }]);
  });

  it("RESPEITA a proteção de iniciante dos jogadores humanos", async () => {
    await criarRobos(1);
    await robosAgressivos();
    const [r] = await robos();
    await db.query(`update public.units set quantidade = 40 where territory_id = $1 and tipo = 'seguranca'`, [r.terr]);

    // Um humano novo logo ao lado, e nenhum abandonado por perto.
    const ana = await criarUsuario(db, "ana");
    const terrAna = await comoJogador(db, ana, (tx) =>
      tx.query<{ t: string }>(`select public.entrar_no_mundo($1) as t`, [mundo]),
    ).then((x) => x.rows[0].t);
    await db.query(`delete from public.territories where dono_id is null`);
    await db.query(
      `update public.territories set x = (select x + 1 from public.territories where id = $2),
                                     y = (select y from public.territories where id = $2) where id = $1`,
      [terrAna, r.terr],
    );

    await rodar();
    expect((await db.query(`select * from public.movements`)).rows).toEqual([]);

    // Passou a proteção: agora o robô (que não é "construtor") pode atacar.
    await db.query(`update public.world_players set entrou_em = now() - interval '49 hours' where user_id = $1`, [ana]);
    await db.query(`update public.bots set perfil = 'saqueador'`);
    await rodar();
    const { rows } = await db.query<{ destino_id: string }>(`select destino_id from public.movements`);
    expect(rows).toEqual([{ destino_id: terrAna }]);
  });

  it("robô 'construtor' só ataca abandonados", async () => {
    await criarRobos(1); // o primeiro criado é construtor
    await robosAgressivos();
    const [r] = await robos();
    expect(r.perfil).toBe("construtor");
    await db.query(`update public.units set quantidade = 40 where territory_id = $1 and tipo = 'seguranca'`, [r.terr]);
    await rodar();
    const { rows } = await db.query<{ dono: string | null }>(`
      select t.dono_id as dono from public.movements m join public.territories t on t.id = m.destino_id`);
    expect(rows).toEqual([{ dono: null }]);
  });

  it("sem crew suficiente, o robô não ataca (não manda a crew para morrer)", async () => {
    await criarRobos(1);
    await robosAgressivos();
    const [r] = await robos();
    await db.query(`update public.units set quantidade = 4 where territory_id = $1 and tipo = 'seguranca'`, [r.terr]);
    await rodar();
    expect((await db.query(`select * from public.movements`)).rows).toEqual([]);
  });
});

describe("segurança dos robôs", () => {
  it("jogador não cria, não comanda e não enxerga a lista de robôs", async () => {
    await criarRobos(1);
    const ana = await criarUsuario(db, "ana");
    for (const sql of [
      `select public._rodar_bots(10)`,
      `select public.admin_criar_bots('${mundo}', 5)`,
      `select public._criar_bot('${mundo}', 'meu_robo', 'saqueador')`,
      `select public._como('${ana}')`,
      `select * from public.bots`,
      `update public.profiles set is_bot = true`,
    ]) {
      expect(await erroDe(comoJogador(db, ana, (tx) => tx.query(sql)))).toMatch(/permission denied/);
    }
  });

  it("o mapa marca quem é robô", async () => {
    await criarRobos(2);
    const ana = await criarUsuario(db, "ana");
    await comoJogador(db, ana, (tx) => tx.query(`select public.entrar_no_mundo($1)`, [mundo]));
    const { rows } = await comoJogador(db, ana, (tx) =>
      tx.query<{ dono: string | null; bot: boolean }>(
        `select dono, bot from public.mapa_regiao($1, 200, 200, 280, 280) where dono is not null`,
        [mundo],
      ),
    );
    expect(rows.filter((r) => r.bot)).toHaveLength(2);
    expect(rows.find((r) => r.dono === "ana")?.bot).toBe(false);
  });
});
