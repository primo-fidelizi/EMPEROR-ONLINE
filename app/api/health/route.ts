import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Rota de saúde. Na fase 1 passará a tocar o Supabase para evitar a pausa por inatividade. */
export function GET() {
  return NextResponse.json({ ok: true, jogo: "costa-neon", hora: new Date().toISOString() });
}
