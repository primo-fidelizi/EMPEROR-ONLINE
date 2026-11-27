import type { Metadata } from "next";
import { BarraTopo } from "@/components/jogo/BarraTopo";
import { MapaCidade } from "@/components/jogo/MapaCidade";
import { NavJogo } from "@/components/jogo/NavJogo";
import { carregarJogo } from "@/lib/jogo/carregar";

export const metadata: Metadata = { title: "Mapa · Costa Neon" };

export default async function Mapa({ params }: { params: Promise<{ world: string }> }) {
  const { world: slug } = await params;
  const { usuario, mundo, territorio, estado } = await carregarJogo(slug);

  return (
    <>
      <BarraTopo username={usuario.username} />
      <main className="mx-auto max-w-6xl space-y-5 px-5 pb-12">
        <NavJogo slug={slug} ativa="mapa" naoLidos={estado.relatorios_nao_lidos} />
        <MapaCidade
          worldId={mundo.id}
          tamanho={mundo.tamanho_mapa}
          velocidade={mundo.velocidade}
          casa={{ id: territorio.id, x: territorio.x, y: territorio.y }}
          estadoInicial={estado}
        />
      </main>
    </>
  );
}
