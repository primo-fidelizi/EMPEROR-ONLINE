import { NextResponse } from "next/server";
import { supabaseConfigurado, supabaseEnv } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

/**
 * Rota de saúde. Faz uma leitura leve no Supabase: o workflow keepalive.yml chama esta rota
 * todo dia para o projeto do plano Free não ser pausado por inatividade.
 */
export async function GET() {
  const base = { jogo: "costa-neon", hora: new Date().toISOString() };
  if (!supabaseConfigurado()) {
    return NextResponse.json({ ...base, ok: true, banco: "nao_configurado" });
  }
  const { url, key } = supabaseEnv();
  try {
    const r = await fetch(`${url}/rest/v1/worlds?select=id&limit=1`, {
      headers: { apikey: key },
      cache: "no-store",
    });
    const ok = r.ok;
    return NextResponse.json(
      { ...base, ok, banco: ok ? "ok" : `erro_${r.status}` },
      { status: ok ? 200 : 503 },
    );
  } catch {
    return NextResponse.json({ ...base, ok: false, banco: "inacessivel" }, { status: 503 });
  }
}
