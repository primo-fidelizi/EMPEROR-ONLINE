import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { comoJogador, criarBanco, criarUsuario, erroDe } from "./harness";

type Crew = Record<string, number>;
type Estado = {
  unidades: Crew;
  recursos: { cash: number; material: number; influencia: number };
  recrutamento: Array<{ tipo: string; quantidade: number; inicia_em: string; termina_em: string }>;
  movimentos: Array<{ id: number; tipo: string; unidades: Crew; saque: Record<string, number>; chega_em: string }>;
  chegando: Array<{ chega_em: string; origem: { nome: string } }>;
  relatorios_nao_lidos: number;
};
type Relatorio = { user_id: string; tipo: string; titulo: string; dados: Record<string, any> };

let db: PGlite;
let mundo: string;
let ana: string;
let terrAna: string;
let abandonado: string;

beforeEach(async () => {
  db = await criarBanco();
  mundo = (await db.query<{ id: string }>(`select id from public.worlds where slug = 't1'`)).rows[0].id;
  ana = await criarUsuario(db, "ana");
  terrAna = await entrar(ana);
  abandonado = (
    await db.query<{ id: string }>(
      `select id from public.territories where dono_id is null order by x, y limit 1`,
    )
  ).rows[0].id;
  await db.query(`delete from public.action_log`);
});

async function entrar(uid: string) {
  return comoJogador(db, uid, (tx) =>
    tx.query<{ t: string }>(`select public.entrar_no_mundo($1) as t`, [mundo]),
  ).then((r) => r.rows[0].t);
}

const como = <T = { r: Estado }>(uid: string, sql: string, args: unknown[] = []) =>
  comoJogador(db, uid, (tx) => tx.query<T>(sql, args)).then((r) => r.rows);

const estado = (uid = ana, terr = terrAna) =>
  como(uid, `select public.estado_territorio($1) as r`, [terr]).then((r) => r[0].r);

const enviar = (crew: Crew, alvo = abandonado, tipo = "ataque", uid = ana, origem = terrAna) =>
  como(uid, `select public.enviar_crew($1, $2, $3, $4) as r`, [origem, alvo, tipo, JSON.stringify(crew)]).then(
    (r) => r[0].r,
  );

const definirCrew = async (terr: string, crew: Crew) => {
  await db.query(`delete from public.units where territory_id = $1`, [terr]);
  await db.query(
    `insert into public.units (territory_id, tipo, quantidade) select $1, key, value::int from jsonb_each_text($2::jsonb)`,
    [terr, JSON.stringify(crew)],
  );
};

const definirRecursos = (terr: string, c: number, m: number, i: number) =>
  db.query(
    `update public.territory_economy set cash = $2, material = $3, influencia = $4, atualizado_em = now() where territory_id = $1`,
    [terr, c, m, i],
  );

const crewDe = async (terr: string) =>
  (
    await db.query<{ c: Crew }>(`select public._unidades_json($1) as c`, [terr])
  ).rows[0].c;

/** Faz um movimento "chegar" agora (mantendo a duração da viagem). */
const chegarAgora = (id: number, segundosAtras = 1) =>
  db.query(
    `update public.movements
     set sai_em = now() - make_interval(secs => $2) - (chega_em - sai_em),
         chega_em = now() - make_interval(secs => $2)
     where id = $1`,
    [id, segundosAtras],
  );

const movimentos = () =>
  db.query<{ id: number; tipo: string; unidades: Crew; saque: Record<string, number> }>(
    `select id, tipo, unidades, saque from public.movements order by id`,
  ).then((r) => r.rows);

const relatorios = () =>
  db.query<Relatorio>(`select user_id, tipo, titulo, dados from public.reports order by id`).then((r) => r.rows);

describe("entrada no mundo", () => {
  it("o jogador ganha crew inicial e 3 territórios abandonados por perto", async () => {
    expect(await crewDe(terrAna)).toEqual({ olheiro: 3, seguranca: 10 });
    const { rows } = await db.query<{ n: number; maxd: number; seg_max: number; eco: number }>(`
      with a as (select t.* from public.territories t where t.dono_id is null),
           meu as (select x, y from public.territories where id = '${terrAna}')
      select count(*)::int as n,
             max(sqrt(power(a.x - meu.x, 2) + power(a.y - meu.y, 2)))::float as maxd,
             coalesce(max(u.quantidade), 0)::int as seg_max,
             (select count(*)::int from public.territory_economy e join a on a.id = e.territory_id) as eco
      from a cross join meu left join public.units u on u.territory_id = a.id and u.tipo = 'seguranca'`);
    expect(rows[0].n).toBe(3);
    expect(rows[0].maxd).toBeLessThanOrEqual(6.5);
    expect(rows[0].seg_max).toBeLessThanOrEqual(4);
    expect(rows[0].eco).toBe(3); // abandonados também produzem (vale a pena saquear de novo)
  });

  it("entrar de novo não dá crew nem abandonados extras", async () => {
    await entrar(ana);
    expect(await crewDe(terrAna)).toEqual({ olheiro: 3, seguranca: 10 });
    const { rows } = await db.query(`select count(*)::int as n from public.territories where dono_id is null`);
    expect(rows).toEqual([{ n: 3 }]);
  });
});

describe("recrutamento", () => {
  it("exige Garagem, cobra, entra na fila e entrega a crew", async () => {
    expect(await erroDe(como(ana, `select public.recrutar($1, 'seguranca', 5)`, [terrAna]))).toBe(
      "requisito_pendente",
    );
    await db.query(`insert into public.buildings values ($1, 'garagem', 1)`, [terrAna]);
    await definirRecursos(terrAna, 1000, 1000, 1000);

    const e = (await como(ana, `select public.recrutar($1, 'seguranca', 5) as r`, [terrAna]))[0].r;
    expect(Number(e.recursos.cash)).toBeCloseTo(750, 0);
    expect(Number(e.recursos.material)).toBeCloseTo(850, 0);
    expect(e.recrutamento).toHaveLength(1);
    const dur = (Date.parse(e.recrutamento[0].termina_em) - Date.parse(e.recrutamento[0].inicia_em)) / 1000;
    expect(dur).toBe(125); // 25 s × 5

    await db.query(`update public.recruit_queue set inicia_em = now() - interval '200 s', termina_em = now() - interval '1 s'`);
    expect((await estado()).unidades).toEqual({ olheiro: 3, seguranca: 15 });
  });

  it("recusa quantidade inválida, unidade inexistente e falta de grana", async () => {
    await db.query(`insert into public.buildings values ($1, 'garagem', 1)`, [terrAna]);
    for (const q of [0, -5, 999999]) {
      expect(await erroDe(como(ana, `select public.recrutar($1, 'seguranca', $2)`, [terrAna, q]))).toBe(
        "quantidade_invalida",
      );
    }
    expect(await erroDe(como(ana, `select public.recrutar($1, 'ninja', 1)`, [terrAna]))).toBe("unidade_inexistente");
    expect(await erroDe(como(ana, `select public.recrutar($1, 'piloto', 1)`, [terrAna]))).toBe("requisito_pendente");
    await definirRecursos(terrAna, 49, 1000, 1000);
    expect(await erroDe(como(ana, `select public.recrutar($1, 'seguranca', 1)`, [terrAna]))).toBe(
      "recursos_insuficientes",
    );
  });
});

describe("enviar crew: validações", () => {
  it("recusa crew vazia, inválida ou maior do que a que existe", async () => {
    expect(await erroDe(enviar({}))).toBe("crew_vazia");
    expect(await erroDe(enviar({ seguranca: 0 }))).toBe("crew_vazia");
    expect(await erroDe(enviar({ seguranca: -1 }))).toBe("crew_invalida");
    expect(await erroDe(enviar({ seguranca: 1.5 }))).toBe("crew_invalida");
    expect(await erroDe(enviar({ ninja: 1 }))).toBe("crew_invalida");
    expect(await erroDe(enviar({ seguranca: "3" as unknown as number }))).toBe("crew_invalida");
    expect(await erroDe(enviar({ seguranca: 11 }))).toBe("crew_insuficiente");
    expect(await erroDe(enviar({ seguranca: 1 }, abandonado, "apoio"))).toBe("tipo_invalido");
    expect(await erroDe(enviar({ seguranca: 1 }, abandonado, "espionagem"))).toBe("so_olheiros");
  });

  it("não ataca a si mesmo nem jogador sob proteção de iniciante", async () => {
    expect(await erroDe(enviar({ seguranca: 1 }, terrAna))).toBe("alvo_proprio");
    const beto = await criarUsuario(db, "beto");
    const terrBeto = await entrar(beto);
    expect(await erroDe(enviar({ seguranca: 1 }, terrBeto))).toBe("alvo_protegido");
    expect(await erroDe(enviar({ olheiro: 1 }, terrBeto, "espionagem"))).toBe("alvo_protegido");
    await db.query(`update public.world_players set entrou_em = now() - interval '49 hours' where user_id = $1`, [beto]);
    await enviar({ seguranca: 1 }, terrBeto);
  });

  it("tira a crew de casa e calcula a viagem pela unidade mais lenta", async () => {
    const e = await enviar({ seguranca: 4, olheiro: 1 });
    expect(e.unidades).toEqual({ olheiro: 2, seguranca: 6 });
    const { rows } = await db.query<{ seg: number; dist: number }>(`
      select extract(epoch from m.chega_em - m.sai_em)::int as seg,
             sqrt(power(o.x - d.x, 2) + power(o.y - d.y, 2))::float as dist
      from public.movements m join public.territories o on o.id = m.origem_id
      join public.territories d on d.id = m.destino_id`);
    expect(rows[0].seg).toBe(Math.max(1, Math.round(rows[0].dist * 2 * 60))); // Segurança: 2 min por campo
  });
});

describe("batalha", () => {
  it("ataque VENCIDO: perdas proporcionais, saque e volta para casa com o saque", async () => {
    await definirCrew(abandonado, { seguranca: 2 }); // defesa 2×25 + 20 = 70
    await definirRecursos(abandonado, 300, 300, 300);
    await definirRecursos(terrAna, 100, 100, 100);

    await enviar({ seguranca: 10 }); // ataque 100
    await chegarAgora((await movimentos())[0].id);
    await estado(); // qualquer ação do jogador resolve o que já chegou

    // perdas: (70/100)^1,5 = 58,6% → 6 de 10. Sobram 4 × carga 20 = 80.
    const [volta] = await movimentos();
    expect(volta.tipo).toBe("retorno");
    expect(volta.unidades).toEqual({ seguranca: 4 });
    expect(volta.saque).toEqual({ cash: 26, material: 26, influencia: 26 });
    expect(await crewDe(abandonado)).toEqual({});

    const [rel] = await relatorios();
    expect(rel).toMatchObject({ user_id: ana, tipo: "ataque" });
    expect(rel.titulo).toMatch(/^Vitória em /);
    expect(rel.dados.vencedor).toBe("atacante");
    expect(rel.dados.atacante.perdas).toEqual({ seguranca: 6 });
    expect(rel.dados.defensor.perdas).toEqual({ seguranca: 2 });

    await chegarAgora(volta.id);
    const e = await estado();
    expect(e.unidades).toEqual({ olheiro: 3, seguranca: 4 });
    expect(Number(e.recursos.cash)).toBeCloseTo(126, 0);
    expect(await movimentos()).toEqual([]);
    expect(e.relatorios_nao_lidos).toBe(1);
  });

  it("ataque PERDIDO: atacante morre todo, defensor perde pouco, ninguém volta", async () => {
    await definirCrew(abandonado, { seguranca: 10 }); // defesa 270
    await enviar({ seguranca: 5 }); // ataque 50
    await chegarAgora((await movimentos())[0].id);
    await estado();

    expect(await movimentos()).toEqual([]);
    expect(await crewDe(abandonado)).toEqual({ seguranca: 9 }); // (50/270)^1,5 = 8% → perde 1
    const [rel] = await relatorios();
    expect(rel.titulo).toMatch(/^Derrota em /);
    expect(rel.dados.atacante.perdas).toEqual({ seguranca: 5 });
  });

  it("CHEGADAS SIMULTÂNEAS: resolve pela hora de chegada, não pela ordem de envio", async () => {
    await definirCrew(abandonado, { seguranca: 3 }); // defesa 95
    await definirCrew(terrAna, { seguranca: 15 });
    await enviar({ seguranca: 5 }); // B: enviado primeiro, chega DEPOIS
    await enviar({ seguranca: 10 }); // A: enviado depois, chega ANTES
    const [b, a] = await movimentos();
    await chegarAgora(a.id, 10);
    await chegarAgora(b.id, 5);
    await estado();

    const rels = await relatorios();
    expect(rels).toHaveLength(2);
    // A chegou primeiro e enfrentou os 3 seguranças; B encontrou o território vazio.
    expect(rels[0].dados.atacante.enviados).toEqual({ seguranca: 10 });
    expect(rels[0].dados.defensor.crew).toEqual({ seguranca: 3 });
    expect(rels[1].dados.atacante.enviados).toEqual({ seguranca: 5 });
    expect(rels[1].dados.defensor.crew).toEqual({});
    expect(rels.every((r) => r.dados.vencedor === "atacante")).toBe(true);
  });

  it("ataque entre jogadores: o defensor vê o ataque chegando (sem ver a crew) e recebe relatório", async () => {
    const beto = await criarUsuario(db, "beto");
    const terrBeto = await entrar(beto);
    await db.query(`update public.world_players set entrou_em = now() - interval '49 hours' where user_id = $1`, [beto]);

    await enviar({ seguranca: 10 }, terrBeto);
    const visto = await estado(beto, terrBeto);
    expect(visto.chegando).toHaveLength(1);
    expect(visto.chegando[0].origem.nome).toBe("Território de ana");
    expect(JSON.stringify(visto.chegando)).not.toMatch(/seguranca/);

    await chegarAgora((await movimentos())[0].id);
    await estado(beto, terrBeto);
    const rels = await relatorios();
    expect(rels.map((r) => [r.user_id, r.tipo])).toEqual([
      [ana, "ataque"],
      [beto, "defesa"],
    ]);
    // 10 seguranças (100) contra 10 seguranças + 3 olheiros + base (276): defesa vence.
    expect(rels[1].titulo).toMatch(/^Ataque barrado/);
  });
});

describe("espionagem", () => {
  it("com mais olheiros que o alvo: relatório com recursos, crew e negócios, e os olheiros voltam", async () => {
    await definirCrew(abandonado, { seguranca: 3 });
    await enviar({ olheiro: 2 }, abandonado, "espionagem");
    await chegarAgora((await movimentos())[0].id);
    await estado();

    const [rel] = await relatorios();
    expect(rel.dados.sucesso).toBe(true);
    expect(rel.dados.crew).toEqual({ seguranca: 3 });
    expect(rel.dados.recursos).toHaveProperty("cash");
    expect(rel.dados.negocios).toHaveProperty("boate", 1);
    const [volta] = await movimentos();
    expect(volta).toMatchObject({ tipo: "retorno", unidades: { olheiro: 2 } });
  });

  it("com menos olheiros que o alvo: são pegos e não voltam", async () => {
    await definirCrew(abandonado, { olheiro: 5 });
    await enviar({ olheiro: 3 }, abandonado, "espionagem");
    await chegarAgora((await movimentos())[0].id);
    await estado();
    const [rel] = await relatorios();
    expect(rel.dados.sucesso).toBe(false);
    expect(rel.dados).not.toHaveProperty("crew");
    expect(await movimentos()).toEqual([]);
  });
});

describe("segurança do combate", () => {
  it("ninguém vê crew, movimentos ou relatórios dos outros", async () => {
    const beto = await criarUsuario(db, "beto");
    await entrar(beto);
    await enviar({ seguranca: 1 });
    const ver = (sql: string) => como<Record<string, unknown>>(beto, sql);
    expect(await ver(`select * from public.units where territory_id = '${terrAna}'`)).toEqual([]);
    expect(await ver(`select * from public.units where territory_id = '${abandonado}'`)).toEqual([]);
    expect(await ver(`select * from public.movements`)).toEqual([]);
    expect(await ver(`select * from public.reports`)).toEqual([]);
  });

  it("ninguém escreve direto nem chama funções internas", async () => {
    for (const sql of [
      `update public.units set quantidade = 9999`,
      `insert into public.movements (world_id, dono_id, origem_id, destino_id, tipo, unidades, sai_em, chega_em)
       values ('${mundo}', '${ana}', '${terrAna}', '${abandonado}', 'ataque', '{"seguranca":1}', now(), now() + interval '1s')`,
      `update public.reports set dados = '{}'`,
      `select public._processar_movimentos(10)`,
      `select public._resolver_ataque(1)`,
      `select public._somar_unidades('${terrAna}', '{"blindado": 999}')`,
      `select public._gerar_abandonados('${mundo}', 1, 1, 5)`,
      `select public._entrar_no_mundo_base('${mundo}')`,
    ]) {
      expect(await erroDe(como(ana, sql))).toMatch(/permission denied/);
    }
  });

  it("o mapa mostra donos e proteção, mas nunca crew nem recursos", async () => {
    const { rows: pos } = await db.query<{ x: number; y: number }>(
      `select x, y from public.territories where id = $1`,
      [terrAna],
    );
    const mapa = await como<Record<string, unknown>>(
      ana,
      `select * from public.mapa_regiao($1, $2, $3, $4, $5)`,
      [mundo, pos[0].x - 10, pos[0].y - 10, pos[0].x + 10, pos[0].y + 10],
    );
    expect(mapa).toHaveLength(4);
    const meu = mapa.find((t) => t.meu)!;
    expect(meu).toMatchObject({ dono: "ana", protegido: true });
    expect(mapa.filter((t) => t.dono_id === null)).toHaveLength(3);
    expect(Object.keys(meu).sort()).toEqual(
      ["bairro", "bot", "dono", "dono_id", "id", "meu", "nome", "pontos", "protegido", "x", "y"].sort(),
    );
    expect(await erroDe(como(ana, `select * from public.mapa_regiao($1, 0, 0, 200, 200)`, [mundo]))).toBe(
      "regiao_invalida",
    );
  });
});
