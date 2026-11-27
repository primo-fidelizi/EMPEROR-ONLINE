import type { Metadata } from "next";
import { BarraTopo } from "@/components/jogo/BarraTopo";
import { ListaRelatorios, type Relatorio } from "@/components/jogo/ListaRelatorios";
import { NavJogo } from "@/components/jogo/NavJogo";
import { Titulo } from "@/components/ui/Titulo";
import { carregarJogo } from "@/lib/jogo/carregar";

export const metadata: Metadata = { title: "Relatórios · Costa Neon" };

export default async function Relatorios({ params }: { params: Promise<{ world: string }> }) {
  const { world: slug } = await params;
  const { supabase, usuario, mundo, estado } = await carregarJogo(slug);

  const { data: relatorios } = await supabase
    .from("reports")
    .select("id, tipo, titulo, dados, lido, criado_em")
    .eq("world_id", mundo.id)
    .eq("user_id", usuario.id)
    .order("criado_em", { ascending: false })
    .limit(60)
    .returns<Relatorio[]>();

  const nomes = Object.fromEntries(estado.tropas.map((t) => [t.tipo, t.nome]));

  return (
    <>
      <BarraTopo username={usuario.username} />
      <main className="mx-auto max-w-3xl space-y-6 px-5 pb-12">
        <NavJogo slug={slug} ativa="relatorios" naoLidos={estado.relatorios_nao_lidos} />
        <Titulo nivel={1} className="text-sol">
          Relatórios
        </Titulo>
        <ListaRelatorios relatorios={relatorios ?? []} nomes={nomes} />
      </main>
    </>
  );
}
