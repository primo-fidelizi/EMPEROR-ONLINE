import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BarraTopo } from "@/components/jogo/BarraTopo";
import { MiniMapa } from "@/components/jogo/MiniMapa";
import { Cartao } from "@/components/ui/Cartao";
import { Titulo } from "@/components/ui/Titulo";
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

  const { data: vizinhos } = await supabase
    .from("territories")
    .select("id, x, y, dono_id")
    .eq("world_id", mundo.id)
    .gte("x", territorio.x - RAIO_VISTA)
    .lte("x", territorio.x + RAIO_VISTA)
    .gte("y", territorio.y - RAIO_VISTA)
    .lte("y", territorio.y + RAIO_VISTA);

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
      <main className="mx-auto max-w-4xl space-y-8 px-5 pb-12">
        <div className="space-y-2">
          <Link href="/mundos" className="font-bold underline">
            ← {mundo.nome}
          </Link>
          <Titulo nivel={1} className="text-sol">
            {territorio.nome}
          </Titulo>
        </div>

        <div className="grid gap-8 md:grid-cols-2 md:items-start">
          <Cartao className="space-y-3">
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
            <p className="borda-mao-2 bg-sol p-3 font-semibold">
              Em breve: Cash, Material e Influência, e seus primeiros negócios (Garagem, Boate…).
            </p>
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
      </main>
    </>
  );
}
