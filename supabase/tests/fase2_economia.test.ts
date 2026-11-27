import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { comoJogador, criarBanco, criarUsuario, erroDe } from "./harness";

type Estado = {
  recursos: { cash: number; material: number; influencia: number };
  taxas_h: { cash: number; material: number; influencia: number };
  capacidade: number;
  negocios: Array<{
    tipo: string;
    nivel: number;
    nivel_planejado: number;
    requisito: string | null;
    proximo: { nivel: number; custo: { cash: number; material: number; influencia: number }; tempo_s: number } | null;
  }>;
  fila: Array<{ tipo: string; nivel_alvo: number; inicia_em: string; termina_em: string }>;
  subidos?: number;
};

let db: PGlite;
let ana: string;
let terr: string;

beforeEach(async () => {
  db = await criarBanco();
  const { rows } = await db.query<{ id: string }>(`select id from public.worlds where slug = 't1'`);
  ana = await criarUsuario(db, "ana");
  terr = await comoJogador(db, ana, (tx) =>
    tx.query<{ t: string }>(`select public.entrar_no_mundo($1) as t`, [rows[0].id]),
  ).then((r) => r.rows[0].t);
  // Cada teste começa sem histórico de rate limit.
  await db.query(`delete from public.action_log`);
});

const rpc = (fn: string, ...args: unknown[]) =>
  comoJogador(db, ana, (tx) =>
    tx.query<{ r: Estado }>(
      `select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) as r`,
      args,
    ),
  ).then((r) => r.rows[0].r);

const estado = () => rpc("estado_territorio", terr);
const construir = (tipo: string) => rpc("construir", terr, tipo);
const n = (v: unknown) => Number(v);
const negocio = (e: Estado, tipo: string) => e.negocios.find((x) => x.tipo === tipo)!;

/** "Volta o relógio" da economia: simula que se passaram `horas` desde a última atualização. */
const passarHoras = (horas: number) =>
  db.query(
    `update public.territory_economy set atualizado_em = atualizado_em - make_interval(secs => $1)`,
    [horas * 3600],
  );

const definirRecursos = (cash: number, material: number, influencia: number) =>
  db.query(
    `update public.territory_economy set cash = $1, material = $2, influencia = $3, atualizado_em = now()`,
    [cash, material, influencia],
  );

/** Termina a fila inteira agora (desloca as obras para o passado, mantendo a ordem). */
const concluirFila = () =>
  db.query(`
    with base as (select max(termina_em) as fim from public.build_queue where territory_id = '${terr}')
    update public.build_queue q
    set inicia_em = q.inicia_em - (base.fim - now()) - interval '1 second',
        termina_em = q.termina_em - (base.fim - now()) - interval '1 second'
    from base where q.territory_id = '${terr}'`);

describe("território novo", () => {
  it("nasce com recursos iniciais e os negócios de nível inicial", async () => {
    const e = await estado();
    expect(e.recursos.cash).toBeCloseTo(500, 0);
    expect(e.recursos.material).toBeCloseTo(500, 0);
    expect(e.recursos.influencia).toBeCloseTo(300, 0);
    const niveis = Object.fromEntries(e.negocios.map((x) => [x.tipo, x.nivel]));
    expect(niveis).toEqual({ torre_radio: 1, boate: 1, oficina: 1, escritorio: 1, doca: 1, garagem: 0 });
    expect(e.fila).toEqual([]);
  });
});

describe("produção lazy e armazém", () => {
  it("produz pela taxa do nível depois de 1 hora", async () => {
    await passarHoras(1);
    const e = await estado();
    expect(n(e.taxas_h.cash)).toBeCloseTo(60, 5); // Boate nível 1
    expect(n(e.taxas_h.influencia)).toBeCloseTo(50, 5); // Escritório nível 1
    expect(n(e.recursos.cash)).toBeCloseTo(560, 0);
    expect(n(e.recursos.material)).toBeCloseTo(560, 0);
    expect(n(e.recursos.influencia)).toBeCloseTo(350, 0);
  });

  it("para de produzir quando o armazém enche", async () => {
    await passarHoras(1000);
    const e = await estado();
    expect(n(e.capacidade)).toBeCloseTo(1250, 5); // Doca nível 1
    expect(n(e.recursos.cash)).toBeCloseTo(1250, 5);
    expect(n(e.recursos.influencia)).toBeCloseTo(1250, 5);
  });

  it("a velocidade do mundo multiplica a produção", async () => {
    await db.query(`update public.worlds set velocidade = 10`);
    await passarHoras(1);
    const e = await estado();
    expect(n(e.taxas_h.cash)).toBeCloseTo(600, 5);
    expect(n(e.recursos.cash)).toBeCloseTo(1100, 0);
  });

  it("obra concluída no meio do intervalo muda a taxa a partir dali (ordem cronológica)", async () => {
    await construir("boate"); // custa 63/76/50 (nível 2)
    const antes = (await estado()).recursos.cash;
    // A obra terminou há 30 min e a última atualização foi há 60 min.
    await db.query(`update public.build_queue set inicia_em = now() - interval '61 minutes', termina_em = now() - interval '30 minutes'`);
    await passarHoras(1);
    const e = await estado();
    expect(negocio(e, "boate").nivel).toBe(2);
    // 30 min a 60/h + 30 min a 70,2/h (60 × 1,17)
    expect(n(e.recursos.cash) - n(antes)).toBeCloseTo(30 + 35.1, 1);
  });
});

describe("construir", () => {
  it("cobra o custo, agenda com o tempo certo e enfileira em sequência", async () => {
    const e0 = await estado();
    const custo = negocio(e0, "boate").proximo!.custo;
    expect(custo).toEqual({ cash: 63, material: 76, influencia: 50 }); // base × 1,26

    const e1 = await construir("boate");
    expect(n(e1.recursos.cash)).toBeCloseTo(500 - 63, 0);
    expect(n(e1.recursos.material)).toBeCloseTo(500 - 76, 0);
    expect(e1.fila).toHaveLength(1);
    expect(e1.fila[0]).toMatchObject({ tipo: "boate", nivel_alvo: 2 });
    const dur = (Date.parse(e1.fila[0].termina_em) - Date.parse(e1.fila[0].inicia_em)) / 1000;
    expect(dur).toBe(47); // 40 s × 1,18

    const e2 = await construir("boate");
    expect(e2.fila[1]).toMatchObject({ tipo: "boate", nivel_alvo: 3 });
    expect(e2.fila[1].inicia_em).toBe(e2.fila[0].termina_em);
    expect(negocio(e2, "boate").nivel_planejado).toBe(3);
  });

  it("conclui a obra, sobe o nível e atualiza os pontos", async () => {
    await construir("oficina");
    await concluirFila();
    const e = await estado();
    expect(negocio(e, "oficina").nivel).toBe(2);
    expect(e.fila).toEqual([]);
    const { rows } = await db.query<{ pontos: number }>(`select pontos from public.world_players`);
    expect(rows[0].pontos).toBe((1 + 2 + 1 + 1 + 1) * 10);
  });

  it("a Torre de rádio deixa as obras mais rápidas", async () => {
    await db.query(`update public.buildings set nivel = 11 where tipo = 'torre_radio'`);
    const e = await estado();
    // 40 × 1,18 × 0,95^10 = 28,26 → 28 s
    expect(negocio(e, "boate").proximo!.tempo_s).toBe(28);
  });

  it("ACEITE: não dá para gastar o que não tem", async () => {
    await definirRecursos(62, 1000, 1000); // falta 1 de Cash para a Boate nível 2
    expect(await erroDe(construir("boate"))).toBe("recursos_insuficientes");
    const e = await estado();
    expect(e.fila).toEqual([]);
    expect(n(e.recursos.cash)).toBeCloseTo(62, 2);
  });

  it("ACEITE: com dinheiro para UMA obra, a segunda chamada falha e nada fica negativo", async () => {
    await definirRecursos(63, 76, 50); // exatamente o custo da Boate nível 2
    await construir("boate");
    expect(await erroDe(construir("oficina"))).toBe("recursos_insuficientes");
    const e = await estado();
    expect(e.fila).toHaveLength(1);
    for (const v of Object.values(e.recursos)) expect(n(v)).toBeGreaterThanOrEqual(0);
  });

  it("respeita o limite da fila", async () => {
    await definirRecursos(1e6, 1e6, 1e6);
    await db.query(`update public.game_config set valor = jsonb_set(valor, '{armazem_minimo}', '10000000') where chave = 'economia'`);
    for (let i = 0; i < 5; i++) await construir("boate");
    expect(await erroDe(construir("boate"))).toBe("fila_cheia");
  });

  it("respeita requisitos e nível máximo", async () => {
    await definirRecursos(1000, 1000, 1000);
    expect(await erroDe(construir("garagem"))).toBe("requisito_pendente");
    await db.query(`update public.buildings set nivel = 3 where tipo = 'torre_radio'`);
    await construir("garagem");

    await db.query(`update public.buildings set nivel = 25 where tipo = 'boate'`);
    expect(await erroDe(construir("boate"))).toBe("nivel_maximo");
    expect(negocio(await estado(), "boate").proximo).toBeNull();
  });

  it("recusa entradas inválidas", async () => {
    expect(await erroDe(construir("cassino"))).toBe("negocio_inexistente");
    expect(await erroDe(construir("x".repeat(500)))).toBe("negocio_inexistente");
    expect(await erroDe(rpc("construir", terr, null))).toBe("negocio_inexistente");
    expect(await erroDe(rpc("estado_territorio", null))).toBe("territorio_inexistente");
    expect(await erroDe(rpc("estado_territorio", "00000000-0000-0000-0000-000000000000"))).toBe(
      "territorio_inexistente",
    );
  });
});

describe("subir tudo que dá", () => {
  it("enche a fila com o que dá para pagar, do mais barato para o mais caro", async () => {
    const e = await rpc("subir_tudo", terr);
    expect(e.subidos).toBe(5);
    expect(e.fila).toHaveLength(5);
    for (const v of Object.values(e.recursos)) expect(n(v)).toBeGreaterThanOrEqual(0);
    // Mais barata: Boate e Doca nível 2 custam 189 cada; no empate vence a ordem (Boate).
    expect(e.fila[0].tipo).toBe("boate");
    const totais = e.fila.map((q) => q.nivel_alvo);
    expect(totais.every((nv) => nv >= 2)).toBe(true);
  });

  it("para quando acaba o dinheiro", async () => {
    await definirRecursos(130, 130, 100); // dá para 1 obra barata, não 2
    const e = await rpc("subir_tudo", terr);
    expect(e.subidos).toBe(1);
  });

  it("sem dinheiro nenhum, não faz nada e não dá erro", async () => {
    await definirRecursos(0, 0, 0);
    const e = await rpc("subir_tudo", terr);
    expect(e.subidos).toBe(0);
    expect(e.fila).toEqual([]);
  });
});

describe("segurança da economia", () => {
  it("outro jogador não vê nem mexe na economia alheia", async () => {
    const beto = await criarUsuario(db, "beto");
    const comoBeto = (sql: string, args: unknown[] = []) =>
      comoJogador(db, beto, (tx) => tx.query(sql, args));

    expect(await erroDe(comoBeto(`select public.estado_territorio($1)`, [terr]))).toBe("territorio_alheio");
    expect(await erroDe(comoBeto(`select public.construir($1, 'boate')`, [terr]))).toBe("territorio_alheio");
    expect(await erroDe(comoBeto(`select public.subir_tudo($1)`, [terr]))).toBe("territorio_alheio");
    expect((await comoBeto(`select * from public.territory_economy`)).rows).toEqual([]);
    expect((await comoBeto(`select * from public.buildings`)).rows).toEqual([]);
    expect((await comoBeto(`select * from public.build_queue`)).rows).toEqual([]);
  });

  it("dono não consegue editar recursos, negócios, fila nem config direto", async () => {
    for (const sql of [
      `update public.territory_economy set cash = 999999`,
      `update public.buildings set nivel = 25`,
      `insert into public.build_queue (territory_id, tipo, nivel_alvo, inicia_em, termina_em) values ('${terr}', 'boate', 9, now(), now() + interval '1s')`,
      `update public.game_config set valor = '{}'`,
      `select public._enfileirar('${terr}', 'boate')`,
      `select public._sincronizar('${terr}')`,
      `select public.processar_obras_vencidas(10)`,
    ]) {
      expect(await erroDe(comoJogador(db, ana, (tx) => tx.query(sql)))).toMatch(/permission denied/);
    }
  });
});

describe("processamento em segundo plano (pg_cron)", () => {
  it("conclui obras vencidas de quem não está jogando", async () => {
    await construir("escritorio");
    await concluirFila();
    const { rows } = await db.query<{ n: number }>(`select public.processar_obras_vencidas(100) as n`);
    expect(rows[0].n).toBe(1);
    const b = await db.query<{ nivel: number }>(
      `select nivel from public.buildings where territory_id = $1 and tipo = 'escritorio'`,
      [terr],
    );
    expect(b.rows[0].nivel).toBe(2);
  });
});
