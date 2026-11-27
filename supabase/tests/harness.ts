/**
 * Banco de teste em memória (PGlite = Postgres real compilado para WASM).
 * Simula o mínimo do Supabase (schema auth, auth.uid(), papéis anon/authenticated)
 * e aplica TODAS as migrations em ordem, exatamente como vão para produção.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS = join(__dirname, "..", "migrations");

export const STUB_SUPABASE = /* sql */ `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;

  grant usage on schema public, auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated;
  -- Igual ao Supabase: tabelas novas no public ficam acessíveis à API (o RLS é quem protege).
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

/** SQL de todas as migrations, na ordem em que vão para produção. */
export function sqlDasMigrations(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((arquivo) => readFileSync(join(MIGRATIONS, arquivo), "utf8"));
}

export async function criarBanco(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(STUB_SUPABASE);
  for (const sql of sqlDasMigrations()) await db.exec(sql);
  return db;
}

/** Cria um usuário como o Supabase Auth faria (dispara o trigger de perfil). */
export async function criarUsuario(db: PGlite, username: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`,
    [`${username}@players.costaneon.invalid`, JSON.stringify({ username })],
  );
  return rows[0].id;
}

/** Executa uma função como se fosse uma requisição do jogador logado (papel authenticated). */
export async function comoJogador<T>(
  db: PGlite,
  userId: string | null,
  fn: (tx: Pick<PGlite, "query">) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? ""]);
    await tx.query(`set local role ${userId ? "authenticated" : "anon"}`);
    return fn(tx);
  });
}

/** Mensagem de erro do Postgres, para comparar com os códigos do jogo. */
export async function erroDe(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return (e as Error).message;
  }
  return "sem erro";
}
