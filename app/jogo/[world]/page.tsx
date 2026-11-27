import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BarraTopo } from "@/components/jogo/BarraTopo";
import { MiniMapa } from "@/components/jogo/MiniMapa";
import { NavJogo } from "@/components/jogo/NavJogo";
import { PainelEconomia } from "@/components/jogo/PainelEconomia";
import { Cartao } from "@/components/ui/Cartao";
import { Titulo } from "@/components/ui/Titulo";
import { normalizarEstado } from "@/lib/jogo/economia";
import { usuarioAtual } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Seu território · Costa Neon" };

const BAIRROS: Record<string, string> = {
  praia: "Praia",
  centro: "Centro",
  porto: "Porto",
  ilhas: "Ilhas",
  pantano: "Pântano",
};

const RAIO_VISTA = 7;

type Territorio = {
  id: string;
  nome: string;
  x: number;
  y: number;
  bairro: string;
  lealdade: number;
  dono_id: string | null;
};

export default async function Jogo({ params }: { params: Promise<{ world: string }> }) {
  const { world: slug } = await params;
  const { supabase, usuario } = await usuarioAtual();
  if (!usuario) redirect("/login");

  const { data: mundo } = await supabase
    .from("worlds")
    .select("id, nome, status")
    .eq("slug", slug)
    .maybeSingle();
  if (!mundo) notFound();

  const { data: meus } = await supabase
    .from("territories")
    .select("id, nome, x, y, bairro, lealdade, dono_id")
    .eq("world_id", mundo.id)
    .eq("dono_id", usuario.id)
    .order("created_at")
    .returns<Territorio[]>();

  const territorio = meus?.[0];
  if (!territorio) redirect("/mundos");

  const [{ data: estadoBruto, error: erroEstado }, { data: vizinhos }] = await Promise.all([
    supabase.rpc("estado_territorio", { p_territorio: territorio.id }),
    supabase
      .from("territories")
      .select("id, x, y, dono_id")
      .eq("world_id", mundo.id)
      .gte("x", territorio.x - RAIO_VISTA)
      .lte("x", territorio.x + RAIO_VISTA)
      .gte("y", territorio.y - RAIO_VISTA)
      .lte("y", territorio.y + RAIO_VISTA),
  ]);
  if (erroEstado || !estadoBruto) throw new Error(erroEstado?.message ?? "estado_indisponivel");
  const estado = normalizarEstado(estadoBruto);

  const pontos = (vizinhos ?? []).map((v) => ({
    id: v.id,
    x: v.x,
    y: v.y,
    meu: v.dono_id === usuario.id,
  }));
  const outros = pontos.filter((p) => !p.meu).length;

  return (
    <>
      <BarraTopo username={usuario.username} />
      <main className="mx-auto max-w-5xl space-y-10 px-5 pb-12">
        <NavJogo slug={slug} ativa="territorio" naoLidos={estado.relatorios_nao_lidos} />
        <div className="space-y-2">
          <Link href="/mundos" className="font-bold underline">
            ← {mundo.nome}
          </Link>
          <Titulo nivel={1} className="text-sol">
            {territorio.nome}
          </Titulo>
        </div>

        <PainelEconomia inicial={estado} slug={slug} />

        <section aria-labelledby="titulo-area" className="space-y-4">
          <h2 id="titulo-area" className="titulo-carimbo text-sol text-4xl">
            Sua área
          </h2>
          <div className="grid gap-6 md:grid-cols-2 md:items-start">
            <Cartao>
              <dl className="grid grid-cols-2 gap-y-2 text-lg">
                <dt className="font-extrabold">Posição</dt>
                <dd className="tabular-nums">
                  {territorio.x}|{territorio.y}
                </dd>
                <dt className="font-extrabold">Bairro</dt>
                <dd>{BAIRROS[territorio.bairro] ?? territorio.bairro}</dd>
                <dt className="font-extrabold">Lealdade</dt>
                <dd className="tabular-nums">{territorio.lealdade}%</dd>
                <dt className="font-extrabold">Vizinhos</dt>
                <dd className="tabular-nums">{outros} por perto</dd>
              </dl>
            </Cartao>
            <div className="space-y-3">
              <MiniMapa
                centro={{ x: territorio.x, y: territorio.y }}
                raio={RAIO_VISTA}
                pontos={pontos}
              />
              <p className="flex flex-wrap gap-4 font-bold">
                <span className="flex items-center gap-2">
                  <span className="borda-mao bg-sol inline-block size-4" /> seu
                </span>
                <span className="flex items-center gap-2">
                  <span className="borda-mao bg-neon inline-block size-4" /> de outros jogadores
                </span>
              </p>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
