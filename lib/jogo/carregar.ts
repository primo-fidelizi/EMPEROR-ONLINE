import "server-only";
import { notFound, redirect } from "next/navigation";
import { usuarioAtual } from "@/lib/supabase/server";
import { normalizarEstado } from "./economia";

/** Carrega jogador, mundo, território principal e o estado completo (usado nas 3 telas do jogo). */
export async function carregarJogo(slug: string) {
  const { supabase, usuario } = await usuarioAtual();
  if (!usuario) redirect("/login");

  const { data: mundo } = await supabase
    .from("worlds")
    .select("id, nome, status, velocidade, tamanho_mapa")
    .eq("slug", slug)
    .maybeSingle();
  if (!mundo) notFound();

  const { data: meus } = await supabase
    .from("territories")
    .select("id, nome, x, y, bairro, lealdade")
    .eq("world_id", mundo.id)
    .eq("dono_id", usuario.id)
    .order("created_at")
    .limit(1);
  const territorio = meus?.[0];
  if (!territorio) redirect("/mundos");

  const { data: bruto, error } = await supabase.rpc("estado_territorio", {
    p_territorio: territorio.id,
  });
  if (error || !bruto) throw new Error(error?.message ?? "estado_indisponivel");

  return {
    supabase,
    usuario,
    mundo: { ...mundo, velocidade: Number(mundo.velocidade) },
    territorio,
    estado: normalizarEstado(bruto),
  };
}
