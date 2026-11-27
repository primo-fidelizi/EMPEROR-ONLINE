/**
 * ACEITE da Fase 2 com concorrência DE VERDADE: várias conexões num Postgres real tentam gastar
 * o mesmo dinheiro ao mesmo tempo. Só roda quando PG_TEST_URL aponta para um Postgres
 * descartável (no CI é um container; localmente, qualquer Postgres 15+).
 */
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { STUB_SUPABASE, sqlDasMigrations } from "./harness";

const URL_BASE = process.env.PG_TEST_URL;
const banco = `teste_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
let urlTeste = "";
let admin: Client;

async function conectar(url: string) {
  const c = new Client({ connectionString: url });
  await c.connect();
  return c;
}

describe.skipIf(!URL_BASE)("concorrência real (Postgres)", () => {
  beforeAll(async () => {
    const raiz = await conectar(URL_BASE!);
    // Papéis são globais no cluster: cria só se ainda não existem.
    await raiz.query(`
      do $$ begin
        if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
        if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
        if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
      end $$;`);
    await raiz.query(`create database ${banco}`);
    await raiz.end();

    const u = new URL(URL_BASE!);
    u.pathname = `/${banco}`;
    urlTeste = u.toString();
    admin = await conectar(urlTeste);
    await admin.query(`set app.sem_robos = '1'`);
    await admin.query(STUB_SUPABASE.replace(/create role [a-z_]+ nologin( bypassrls)?;/g, ""));
    for (const sql of sqlDasMigrations()) await admin.query(sql);
  }, 60_000);

  afterAll(async () => {
    await admin?.end();
    if (!URL_BASE) return;
    const raiz = await conectar(URL_BASE);
    await raiz.query(`drop database if exists ${banco} with (force)`);
    await raiz.end();
  });

  it("ACEITE: 8 cliques simultâneos com dinheiro para UMA obra = 1 obra, nada negativo", async () => {
    const { rows: u } = await admin.query<{ id: string }>(
      `insert into auth.users (email, raw_user_meta_data) values ('ana@x.invalid', '{"username":"ana"}') returning id`,
    );
    const ana = u[0].id;
    const { rows: w } = await admin.query<{ id: string }>(`select id from public.worlds where slug = 't1'`);

    const comoAna = async <T>(c: Client, sql: string, args: unknown[]) => {
      await c.query("begin");
      try {
        await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [ana]);
        await c.query("set local role authenticated");
        const r = await c.query<T & Record<string, unknown>>(sql, args);
        await c.query("commit");
        return r;
      } catch (e) {
        await c.query("rollback");
        throw e;
      }
    };

    const c0 = await conectar(urlTeste);
    const { rows: t } = await comoAna<{ t: string }>(c0, `select public.entrar_no_mundo($1) as t`, [w[0].id]);
    const terr = t[0].t;
    await c0.end();

    // Exatamente o custo da Boate nível 2 (63/76/50) e nada mais.
    await admin.query(
      `update public.territory_economy set cash = 63, material = 76, influencia = 50, atualizado_em = now() where territory_id = $1`,
      [terr],
    );
    await admin.query(`delete from public.action_log`);

    const conexoes = await Promise.all(Array.from({ length: 8 }, () => conectar(urlTeste)));
    const resultados = await Promise.allSettled(
      conexoes.map((c, i) =>
        comoAna(c, `select public.construir($1, $2)`, [terr, i % 2 ? "boate" : "oficina"]),
      ),
    );
    await Promise.all(conexoes.map((c) => c.end()));

    const ok = resultados.filter((r) => r.status === "fulfilled");
    const erros = resultados
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) => (r.reason as Error).message);
    expect(ok).toHaveLength(1);
    expect(new Set(erros)).toEqual(new Set(["recursos_insuficientes"]));

    const { rows: fila } = await admin.query(`select * from public.build_queue where territory_id = $1`, [terr]);
    expect(fila).toHaveLength(1);
    const { rows: eco } = await admin.query<{ cash: string; material: string; influencia: string }>(
      `select cash, material, influencia from public.territory_economy where territory_id = $1`,
      [terr],
    );
    for (const v of Object.values(eco[0])) expect(Number(v)).toBeGreaterThanOrEqual(0);
  }, 60_000);
});
